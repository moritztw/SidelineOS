import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  SIDELINE_SDK_VERSION,
  type PluginManifest,
  type PluginNavigationManifest,
  type PrivilegiertePluginPermission,
} from '../../sdk/plugin.ts';
import { istPrivilegierteCapability } from '../../sdk/plugin.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository, InstalliertesPluginDatensatz } from '../db/coreRepository.ts';
import type { PluginRuntimeLoader } from '../plugins/runtimeLoader.ts';

export interface TarDateiEintrag {
  pfad: string;
  daten: Buffer;
}

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024; // 50 MiB

/**
 * Minimalistischer USTAR-`.tar.gz`-Entpacker ohne externe Abhängigkeiten (KISS).
 */
export function entpackeTarGzBuffer(gzBuffer: Buffer): TarDateiEintrag[] {
  if (gzBuffer.length > MAX_ARCHIVE_BYTES) {
    throw new Error('Plugin-Archiv überschreitet das 50-MiB-Limit.');
  }

  const tar = zlib.gunzipSync(gzBuffer);
  const eintraege: TarDateiEintrag[] = [];
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;

    const nameRaw = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefixRaw = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const vollPfad = (prefixRaw ? `${prefixRaw}/${nameRaw}` : nameRaw).replace(/^\.\//, '');
    const sizeOktal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const typeFlag = String.fromCharCode(header[156] || 48);
    const size = sizeOktal ? parseInt(sizeOktal, 8) : 0;

    if (!Number.isFinite(size) || size < 0) {
      throw new Error('Ungültige Dateigröße im TAR-Archiv.');
    }

    const datenStart = offset + 512;
    const datenEnde = datenStart + size;
    if (datenEnde > tar.length) {
      throw new Error('Abgeschnittenes TAR-Archiv.');
    }

    if ((typeFlag === '0' || typeFlag === '\0') && vollPfad) {
      eintraege.push({
        pfad: vollPfad,
        daten: Buffer.from(tar.subarray(datenStart, datenEnde)),
      });
    }

    const blocks = Math.ceil(size / 512);
    offset = datenStart + blocks * 512;
  }

  return eintraege;
}

/**
 * Validiert eine externe Download-URL strikt gegen SSRF (nur https:, keine privaten/lokalen Netze).
 */
export function pruefeSichereArchivUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Ungültige Archiv-URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Externe Plugin-Archive dürfen ausschließlich über https:// geladen werden.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    throw new Error('Lokale oder interne Hosts sind für Archiv-Downloads gesperrt.');
  }

  const ipTyp = net.isIP(host);
  if (ipTyp === 4) {
    const [a, b] = host.split('.').map(Number);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      throw new Error('Private oder Link-Local-IPs sind für Archiv-Downloads gesperrt.');
    }
  } else if (ipTyp === 6) {
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
      throw new Error('Private IPv6-Adressen sind für Archiv-Downloads gesperrt.');
    }
  }

  return parsed;
}

/**
 * Prüft ein SDK-v2.0-Manifest strikt gegen die 4-Ebenen-Navigations- und Sicherheitsregeln.
 */
export function validierePluginManifestV2(raw: unknown): PluginManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('plugin.json fehlt oder ist kein gültiges JSON-Objekt.');
  }

  const m = raw as Partial<PluginManifest>;
  if (!m.id || !/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(m.id)) {
    throw new Error('Ungültige Plugin-ID im Manifest (erlaubt: a-z, 0-9, Bindestrich).');
  }
  if (!m.name?.trim() || !m.version?.trim()) {
    throw new Error('Manifest benötigt "name" und "version".');
  }
  if (m.sdkVersion !== SIDELINE_SDK_VERSION) {
    throw new Error(
      `Inkompatible SDK-Version "${String(m.sdkVersion)}". SidelineOS-core v0.2.0 erfordert sdkVersion "${SIDELINE_SDK_VERSION}".`
    );
  }
  if (!Array.isArray(m.permissions)) {
    throw new Error('Manifest benötigt das Feld "permissions" als Array.');
  }

  const nav = m.navigation as Partial<PluginNavigationManifest> | undefined;
  if (
    !nav ||
    !['app', 'headless', 'system'].includes(String(nav.surface)) ||
    !Array.isArray(nav.scopes) ||
    nav.scopes.length === 0
  ) {
    throw new Error(
      'Manifest benötigt "navigation" mit gültigem "surface" (app|headless|system) und "scopes".'
    );
  }

  if (nav.sidebarGroups && nav.sidebarGroups.length > 3) {
    throw new Error('Navigations-Vertrag verletzt: Maximal 3 Sidebar-Gruppen pro Plugin erlaubt.');
  }

  return m as PluginManifest;
}

/**
 * Minimaler, gehärteter Core-Archiv-Installer (v0.2.0):
 * - Nur `.tar.gz`-Archiv-Installation (Upload, sichere https:-URL oder lokaler Bootstrap-Pfad).
 * - Kein git, kein npm, kein Store-Browser und kein Update-Checker im Core!
 */
export class MinimalArchiveInstaller {
  constructor(
    private readonly repo: CoreRepository,
    private readonly config: CoreServerConfig,
    private readonly runtimeLoader: PluginRuntimeLoader,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async installiereAusBuffer(params: {
    archiveBuffer: Buffer;
    sourceUrl?: string | null;
    autoEnable?: boolean;
    autoApproveCapabilities?: boolean;
  }): Promise<InstalliertesPluginDatensatz> {
    const sha256 = crypto.createHash('sha256').update(params.archiveBuffer).digest('hex');
    const eintraege = entpackeTarGzBuffer(params.archiveBuffer);

    // Gemeinsamen Top-Level-Ordner (wie bei GitHub-Release-Tarballs) automatisch erkennen
    const manifestEintrag = eintraege.find(
      (e) => e.pfad === 'plugin.json' || e.pfad.endsWith('/plugin.json')
    );
    if (!manifestEintrag) {
      throw new Error('Archiv enthält keine plugin.json.');
    }

    const rootPrefix = manifestEintrag.pfad.includes('/')
      ? manifestEintrag.pfad.slice(0, manifestEintrag.pfad.lastIndexOf('/') + 1)
      : '';

    const manifest = validierePluginManifestV2(
      JSON.parse(manifestEintrag.daten.toString('utf8')) as unknown
    );

    const basisRoot = path.resolve(this.config.pluginDataDir);
    const zielVerzeichnis = path.resolve(basisRoot, manifest.id, manifest.version);
    if (!zielVerzeichnis.startsWith(basisRoot + path.sep)) {
      throw new Error('Ungültiges Zielverzeichnis für Plugin-Installation.');
    }

    await fs.rm(zielVerzeichnis, { recursive: true, force: true });
    await fs.mkdir(zielVerzeichnis, { recursive: true });

    for (const eintrag of eintraege) {
      const rel =
        rootPrefix && eintrag.pfad.startsWith(rootPrefix)
          ? eintrag.pfad.slice(rootPrefix.length)
          : eintrag.pfad;
      if (!rel || rel.includes('..') || path.isAbsolute(rel)) continue;

      const vollPfad = path.resolve(zielVerzeichnis, rel);
      if (!vollPfad.startsWith(zielVerzeichnis + path.sep)) {
        throw new Error(`Path-Traversal im Plugin-Archiv blockiert: ${eintrag.pfad}`);
      }
      await fs.mkdir(path.dirname(vollPfad), { recursive: true });
      await fs.writeFile(vollPfad, eintrag.daten);
    }

    const angefordertePrivilegien = manifest.permissions.filter(istPrivilegierteCapability);
    const approvedCapabilities: PrivilegiertePluginPermission[] = params.autoApproveCapabilities
      ? angefordertePrivilegien
      : [];

    const gespeichert = await this.repo.speichereInstalliertesPlugin({
      manifest,
      enabledGlobally: Boolean(params.autoEnable),
      approvedCapabilities,
      sourceUrl: params.sourceUrl ?? null,
      sha256,
    });

    if (gespeichert.enabledGlobally) {
      await this.runtimeLoader.ladeBackendPlugin(gespeichert.pluginId, gespeichert.version);
    }

    return gespeichert;
  }

  async installiereAusUrl(
    rawUrl: string,
    optionen: { autoEnable?: boolean; autoApproveCapabilities?: boolean } = {}
  ): Promise<InstalliertesPluginDatensatz> {
    const url = pruefeSichereArchivUrl(rawUrl);
    const antwort = await this.fetchFn(url.toString(), {
      headers: { Accept: 'application/octet-stream' },
    });
    if (!antwort.ok) {
      throw new Error(`Archiv-Download fehlgeschlagen (HTTP ${antwort.status}).`);
    }
    const arrayBuffer = await antwort.arrayBuffer();
    return this.installiereAusBuffer({
      archiveBuffer: Buffer.from(arrayBuffer),
      sourceUrl: url.toString(),
      ...optionen,
    });
  }

  async deinstallierePlugin(pluginId: string): Promise<boolean> {
    this.runtimeLoader.entladeBackendPlugin(pluginId);
    const geloescht = await this.repo.loescheInstalliertesPlugin(pluginId);
    if (geloescht) {
      const basisRoot = path.resolve(this.config.pluginDataDir);
      const pluginDir = path.resolve(basisRoot, pluginId);
      if (pluginDir.startsWith(basisRoot + path.sep)) {
        await fs.rm(pluginDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    return geloescht;
  }

  /**
   * ENV-Bootstrap (`CORE_BOOTSTRAP_PLUGINS`): installiert kommagetrennte lokale `.tar.gz`-Dateien
   * oder sichere `https://`-Archive idempotent beim Serverstart.
   */
  async bootstrapAusEnv(): Promise<{ installiert: string[]; fehler: Array<{ quelle: string; fehler: string }> }> {
    const installiert: string[] = [];
    const fehler: Array<{ quelle: string; fehler: string }> = [];

    for (const quelle of this.config.coreBootstrapPlugins) {
      try {
        if (quelle.startsWith('https://')) {
          const res = await this.installiereAusUrl(quelle, {
            autoEnable: true,
            autoApproveCapabilities: true,
          });
          installiert.push(res.pluginId);
        } else {
          const aufgeloest = path.resolve(quelle);
          const buffer = await fs.readFile(aufgeloest);
          const res = await this.installiereAusBuffer({
            archiveBuffer: buffer,
            sourceUrl: `file:${path.basename(aufgeloest)}`,
            autoEnable: true,
            autoApproveCapabilities: true,
          });
          installiert.push(res.pluginId);
        }
      } catch (err) {
        fehler.push({
          quelle,
          fehler: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { installiert, fehler };
  }
}
