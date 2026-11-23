import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginManifest, SidelineBackendPlugin } from '../../sdk/plugin.ts';
import type { PluginId } from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import type { PluginBackendHost } from './backendHost.ts';

export interface RuntimePluginClientEintrag {
  pluginId: PluginId;
  version: string;
  manifest: PluginManifest;
  clientUrl: string;
  cssUrl?: string;
}

export interface BundleDateienInfo {
  basisDir: string;
  distDir: string;
  serverEntryPfad?: string;
  clientEntryRel?: string;
  cssRel?: string;
}

const SERVER_ENTRY_KANDIDATEN = ['dist/server.js', 'dist/server.mjs', 'dist/index.js'];
const CLIENT_ENTRY_KANDIDATEN = ['dist/client.js', 'dist/client.mjs', 'dist/index.js'];
const CLIENT_CSS_KANDIDATEN = ['dist/client.css', 'dist/style.css', 'dist/index.css'];

async function existiertDatei(pfad: string): Promise<boolean> {
  try {
    const stat = await fs.stat(pfad);
    return stat.isFile();
  } catch {
    return false;
  }
}

function istGueltigesPluginBackendObjekt(
  kandidat: unknown,
  erwartetePluginId: string
): kandidat is SidelineBackendPlugin {
  if (!kandidat || typeof kandidat !== 'object') return false;
  const obj = kandidat as Partial<SidelineBackendPlugin>;
  if (!obj.manifest || obj.manifest.id !== erwartetePluginId) return false;
  return (
    typeof obj.handleRequest === 'function' ||
    typeof obj.handlePublicRequest === 'function' ||
    Array.isArray(obj.migrations) ||
    typeof obj.listExportableItems === 'function' ||
    typeof obj.exportScope === 'function' ||
    typeof obj.importScope === 'function'
  );
}

/**
 * Lädt installierte externe Plugins dynamisch aus `PLUGIN_DATA_DIR`:
 * - Server-Backend-Module in den `PluginBackendHost` (beim Boot + live nach Store-Aktionen)
 * - Client-ESM-Bundle-Metadaten für Browser-Runtime-Lader
 */
export class PluginRuntimeLoader {
  constructor(
    private readonly repo: CoreRepository,
    private readonly config: CoreServerConfig,
    private readonly pluginHost: PluginBackendHost
  ) {}

  loesePluginVersionVerzeichnisAuf(pluginId: string, version: string): string | null {
    if (!/^[a-z0-9-]+$/.test(pluginId)) return null;
    if (!version || version.includes('..') || version.includes('/') || version.includes('\\')) {
      return null;
    }
    const root = path.resolve(this.config.pluginDataDir);
    const ziel = path.resolve(root, pluginId, version);
    if (!ziel.startsWith(root + path.sep)) return null;
    return ziel;
  }

  async pruefeBundleDateien(pluginId: string, version: string): Promise<BundleDateienInfo | null> {
    const basisDir = this.loesePluginVersionVerzeichnisAuf(pluginId, version);
    if (!basisDir) return null;
    const distDir = path.join(basisDir, 'dist');

    let serverEntryPfad: string | undefined;
    for (const rel of SERVER_ENTRY_KANDIDATEN) {
      const voll = path.join(basisDir, rel);
      if (await existiertDatei(voll)) {
        serverEntryPfad = voll;
        break;
      }
    }

    let clientEntryRel: string | undefined;
    for (const rel of CLIENT_ENTRY_KANDIDATEN) {
      const voll = path.join(basisDir, rel);
      if (await existiertDatei(voll)) {
        clientEntryRel = rel.replace(/^dist\//, '');
        break;
      }
    }

    let cssRel: string | undefined;
    for (const rel of CLIENT_CSS_KANDIDATEN) {
      const voll = path.join(basisDir, rel);
      if (await existiertDatei(voll)) {
        cssRel = rel.replace(/^dist\//, '');
        break;
      }
    }

    return {
      basisDir,
      distDir,
      serverEntryPfad,
      clientEntryRel,
      cssRel,
    };
  }

  async ladeBackendPlugin(pluginId: string, version: string): Promise<boolean> {
    const info = await this.pruefeBundleDateien(pluginId, version);
    if (!info?.serverEntryPfad) {
      return false;
    }

    const modulUrl = `${pathToFileURL(info.serverEntryPfad).href}?t=${Date.now()}`;
    const geladen = (await import(modulUrl)) as Record<string, unknown>;
    const kandidat = geladen.backendPlugin ?? geladen.default;

    if (!istGueltigesPluginBackendObjekt(kandidat, pluginId)) {
      return false;
    }

    await this.pluginHost.registriereBackendPlugin(kandidat);
    return true;
  }

  entladeBackendPlugin(pluginId: string): void {
    this.pluginHost.entferneBackendPlugin(pluginId);
  }

  async ladeAlleInstalliertenBackendPlugins(): Promise<{
    geladen: string[];
    fehler: Array<{ pluginId: string; fehler: string }>;
  }> {
    const installierte = await this.repo.listeInstalliertePlugins();
    const geladen: string[] = [];
    const fehler: Array<{ pluginId: string; fehler: string }> = [];

    for (const eintrag of installierte) {
      if (!eintrag.enabledGlobally) continue;
      const pluginId = eintrag.manifest.id;
      try {
        const ok = await this.ladeBackendPlugin(pluginId, eintrag.installedVersion);
        if (ok) {
          geladen.push(pluginId);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fehler.push({ pluginId, fehler: msg });
        console.warn(
          `[SidelineOS-Core] Backend-Plugin "${pluginId}" konnte nicht dynamisch geladen werden: ${msg}`
        );
      }
    }

    return { geladen, fehler };
  }

  async listeFrontendRuntimeEintraege(optionen: {
    nurPublicShare?: boolean;
  } = {}): Promise<{
    installedPluginIds: PluginId[];
    enabledPluginIds: PluginId[];
    bundles: RuntimePluginClientEintrag[];
  }> {
    const installierte = await this.repo.listeInstalliertePlugins();
    const installedPluginIds = installierte.map((p) => p.manifest.id);
    const enabledPluginIds = installierte
      .filter((p) => p.enabledGlobally)
      .map((p) => p.manifest.id);

    const bundles: RuntimePluginClientEintrag[] = [];
    for (const eintrag of installierte) {
      if (!eintrag.enabledGlobally) continue;
      if (
        optionen.nurPublicShare &&
        !eintrag.manifest.permissions.includes('share:public-links')
      ) {
        continue;
      }

      const info = await this.pruefeBundleDateien(
        eintrag.manifest.id,
        eintrag.installedVersion
      );
      if (!info?.clientEntryRel) continue;

      const baseUrl = `/api/v1/plugins/runtime/bundles/${encodeURIComponent(
        eintrag.manifest.id
      )}/${encodeURIComponent(eintrag.installedVersion)}`;

      bundles.push({
        pluginId: eintrag.manifest.id,
        version: eintrag.installedVersion,
        manifest: eintrag.manifest,
        clientUrl: `${baseUrl}/${info.clientEntryRel}`,
        ...(info.cssRel ? { cssUrl: `${baseUrl}/${info.cssRel}` } : {}),
      });
    }

    return {
      installedPluginIds,
      enabledPluginIds,
      bundles,
    };
  }
}
