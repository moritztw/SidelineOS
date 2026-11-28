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
  cacheBuster?: string;
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
    return (await fs.stat(pfad)).isFile();
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
    typeof obj.deliverNotification === 'function' ||
    Boolean(obj.storageProvider) ||
    Array.isArray(obj.migrations)
  );
}

/**
 * Lädt installierte externe Plugins dynamisch aus `PLUGIN_DATA_DIR` (SDK v2.0).
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

    return { basisDir, distDir, serverEntryPfad, clientEntryRel, cssRel };
  }

  async ladeBackendPlugin(pluginId: string, version: string): Promise<boolean> {
    this.entladeBackendPlugin(pluginId);

    const info = await this.pruefeBundleDateien(pluginId, version);
    if (!info?.serverEntryPfad) return false;

    const entryDateiname = path.basename(info.serverEntryPfad);
    const istExpliziterServerEntry =
      entryDateiname === 'server.js' || entryDateiname === 'server.mjs';

    const modulUrl = `${pathToFileURL(info.serverEntryPfad).href}?t=${Date.now()}`;
    let geladen: Record<string, unknown>;
    try {
      geladen = (await import(modulUrl)) as Record<string, unknown>;
    } catch (err) {
      if (istExpliziterServerEntry) throw err;
      return false;
    }

    const kandidat = geladen.backendPlugin ?? geladen.default;
    if (!istGueltigesPluginBackendObjekt(kandidat, pluginId)) {
      if (istExpliziterServerEntry) {
        throw new Error(
          `Backend-Bundle für "${pluginId}" exportiert kein gültiges SidelineBackendPlugin.`
        );
      }
      return false;
    }

    const datensatz = await this.repo.findePlugin(pluginId);
    await this.pluginHost.registriereBackendPlugin(
      kandidat,
      datensatz?.approvedCapabilities ?? []
    );
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
      if (
        eintrag.manifest.permissions.includes('dev:git-install') &&
        !this.config.allowDevPlugins
      ) {
        continue;
      }
      try {
        const ok = await this.ladeBackendPlugin(eintrag.pluginId, eintrag.version);
        if (ok) geladen.push(eintrag.pluginId);
        if (eintrag.lastError) {
          await this.repo.aktualisierePluginStatus(eintrag.pluginId, { lastError: null });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fehler.push({ pluginId: eintrag.pluginId, fehler: msg });
        await this.repo.aktualisierePluginStatus(eintrag.pluginId, { lastError: msg });
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
    const installedPluginIds = installierte.map((p) => p.pluginId);
    const enabledPluginIds = installierte
      .filter((p) => p.enabledGlobally)
      .map((p) => p.pluginId);

    const bundles: RuntimePluginClientEintrag[] = [];
    for (const eintrag of installierte) {
      if (!eintrag.enabledGlobally) continue;
      if (
        optionen.nurPublicShare &&
        !eintrag.manifest.permissions.includes('share:public-links')
      ) {
        continue;
      }

      const info = await this.pruefeBundleDateien(eintrag.pluginId, eintrag.version);
      if (!info?.clientEntryRel) continue;

      const baseUrl = `/api/v2/plugins/runtime/bundles/${encodeURIComponent(
        eintrag.pluginId
      )}/${encodeURIComponent(eintrag.version)}`;

      const clientStat = await fs
        .stat(path.join(info.distDir, info.clientEntryRel))
        .catch(() => null);
      const cacheBuster = clientStat ? String(Math.trunc(clientStat.mtimeMs)) : String(Date.now());

      bundles.push({
        pluginId: eintrag.pluginId,
        version: eintrag.version,
        manifest: eintrag.manifest,
        clientUrl: `${baseUrl}/${info.clientEntryRel}`,
        ...(info.cssRel ? { cssUrl: `${baseUrl}/${info.cssRel}` } : {}),
        cacheBuster,
      });
    }

    return { installedPluginIds, enabledPluginIds, bundles };
  }
}
