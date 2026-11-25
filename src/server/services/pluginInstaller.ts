import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { parseGitHubPluginQuelle } from '../../core/pluginRegistry.ts';
import type { PluginManifest, PluginPermission } from '../../sdk/plugin.ts';
import { PACKAGE_CORE_VERSION, type CoreServerConfig } from '../config.ts';
import { fuehrePluginMigrationAus, type CoreDatabaseClient } from '../db/client.ts';
import type { CoreRepository } from '../db/coreRepository.ts';

const execFileAsync = promisify(execFile);
const CORE_PLUGIN_SDK_DIR = fileURLToPath(
  new URL('../../../packages/plugin-sdk', import.meta.url)
);

function kuerzeFehlerAusgabe(err: unknown): string {
  const rec = (err && typeof err === 'object' ? err : {}) as {
    stderr?: string | Buffer;
    stdout?: string | Buffer;
    message?: string;
  };
  const stderrText =
    typeof rec.stderr === 'string'
      ? rec.stderr
      : Buffer.isBuffer(rec.stderr)
        ? rec.stderr.toString('utf8')
        : '';
  const stdoutText =
    typeof rec.stdout === 'string'
      ? rec.stdout
      : Buffer.isBuffer(rec.stdout)
        ? rec.stdout.toString('utf8')
        : '';
  const roh = (stderrText.trim() || stdoutText.trim() || rec.message || String(err)).replace(
    /(https?:\/\/)([^/@\s]+):([^/@\s]+)@/gi,
    '$1***@'
  );
  const zeilen = roh
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean);
  const auszug = zeilen.slice(-8).join(' | ');
  return auszug.length > 500 ? `...${auszug.slice(-497)}` : auszug || 'Unbekannter Fehler';
}

const MAX_TAR_BYTES = 25 * 1024 * 1024;
const MAX_TAR_EINTRAEGE = 500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const RESERVIERTE_PLUGIN_IDS = new Set([
  'hub',
  'settings',
  'settings-hub',
  'team-settings',
  'sysadmin',
  'invite',
  'share',
  'auth',
  'login',
  'api',
  'plugins',
]);

const GUELTIGE_PERMISSIONS = new Set<PluginPermission>([
  'team:read',
  'team:roster-read',
  's3:team-rw',
  's3:cleanup-queue',
  'db:plugin-tables',
  'share:public-links',
  'notifications:send',
  'notifications:channel',
]);

export class PluginInstallerFehler extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'PluginInstallerFehler';
  }
}

export interface CoreUpdateInfo {
  aktuell: string;
  verfuegbar: string | null;
  updateVerfuegbar: boolean;
  releaseUrl: string | null;
  veroeffentlichtAm: string | null;
  hinweis?: string;
}

export interface PluginUpdateEintrag {
  pluginId: string;
  name: string;
  aktuell: string;
  verfuegbar: string | null;
  updateVerfuegbar: boolean;
  sdkKompatibel: boolean;
  coreKompatibel?: boolean;
  releaseTag: string | null;
  releaseUrl: string | null;
}

export interface UpdatePruefErgebnis {
  deaktiviert: boolean;
  geprueftAm: string;
  coreUpdate: CoreUpdateInfo | null;
  pluginUpdates: PluginUpdateEintrag[];
  anzahlVerfuegbar: number;
}

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GitHubReleaseApiAntwort {
  tag_name: string;
  html_url?: string;
  published_at?: string;
  assets?: GitHubReleaseAsset[];
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type CommandRunner = (
  cmd: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }
) => Promise<{ stdout: string; stderr: string }>;

function defaultCommandRunner(
  cmd: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(cmd, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    timeout: options.timeoutMs ?? 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseSemVerTupel(raw: string): { nums: [number, number, number]; pre: string } {
  const bereinigt = raw.trim().replace(/^v/i, '');
  const [corePart, ...preParts] = bereinigt.split('-');
  const [maj, min, pat] = corePart.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return { nums: [maj, min, pat], pre: preParts.join('-') };
}

/**
 * Vergleicht zwei SemVer-Strings (`a < b` => `-1`, `a == b` => `0`, `a > b` => `1`).
 */
export function vergleicheSemVer(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemVerTupel(a);
  const pb = parseSemVerTupel(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa.nums[i] < pb.nums[i]) return -1;
    if (pa.nums[i] > pb.nums[i]) return 1;
  }
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre < pb.pre) return -1;
  if (pa.pre > pb.pre) return 1;
  return 0;
}

function istSemVerVersion(raw: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    raw.trim().replace(/^v/i, '')
  );
}

function parseSdkMajorMinor(raw: string): { major: number; minor: number } | null {
  const m = raw.trim().match(/^(\d+)\.(\d+)$/);
  if (!m) return null;
  return {
    major: Number.parseInt(m[1], 10),
    minor: Number.parseInt(m[2], 10),
  };
}

function normalisiereInstallVersion(raw: string, fallback = '0.1.0'): string {
  const bereinigt = raw.trim().replace(/^v(?=\d)/i, '');
  if (
    !bereinigt ||
    bereinigt.includes('..') ||
    bereinigt.includes('/') ||
    bereinigt.includes('\\')
  ) {
    throw new PluginInstallerFehler(400, `Ungültige Plugin-Version "${raw}".`);
  }
  return bereinigt || fallback;
}

export function ermittleEffektiveCoreSemVer(
  coreVersion?: string,
  fallbackCoreSemVer = PACKAGE_CORE_VERSION
): string {
  const raw = coreVersion?.trim().replace(/^v/i, '') ?? '';
  if (istSemVerVersion(raw)) return raw;
  return fallbackCoreSemVer.trim().replace(/^v/i, '') || '0.1.0';
}

export function pruefePluginKompatibilitaet(
  manifest: {
    id: string;
    sdkVersion: string;
    minCoreVersion?: string;
    maxCoreVersion?: string;
  },
  optionen: {
    supportedSdkVersion?: string;
    coreVersion?: string;
    fallbackCoreSemVer?: string;
  } = {}
): { ok: boolean; sdkKompatibel: boolean; coreKompatibel: boolean; grund?: string } {
  const supportedSdk = optionen.supportedSdkVersion ?? '1.0';
  const pluginSdk = parseSdkMajorMinor(manifest.sdkVersion);
  const coreSdk = parseSdkMajorMinor(supportedSdk);
  const sdkKompatibel = Boolean(
    pluginSdk &&
      coreSdk &&
      pluginSdk.major === coreSdk.major &&
      pluginSdk.minor <= coreSdk.minor
  );

  if (!sdkKompatibel) {
    return {
      ok: false,
      sdkKompatibel: false,
      coreKompatibel: true,
      grund: `Inkompatible SDK-Version "${manifest.sdkVersion}" (Core unterstützt "${supportedSdk}").`,
    };
  }

  const effektiveCore = ermittleEffektiveCoreSemVer(
    optionen.coreVersion,
    optionen.fallbackCoreSemVer
  );

  if (manifest.minCoreVersion) {
    const minClean = manifest.minCoreVersion.trim().replace(/^v/i, '');
    if (vergleicheSemVer(effektiveCore, minClean) < 0) {
      return {
        ok: false,
        sdkKompatibel: true,
        coreKompatibel: false,
        grund: `Plugin "${manifest.id}" erfordert mindestens SidelineOS-Core v${minClean} (aktuell ${optionen.coreVersion ?? effektiveCore}).`,
      };
    }
  }

  if (manifest.maxCoreVersion) {
    const maxClean = manifest.maxCoreVersion.trim().replace(/^v/i, '');
    if (vergleicheSemVer(effektiveCore, maxClean) > 0) {
      return {
        ok: false,
        sdkKompatibel: true,
        coreKompatibel: false,
        grund: `Plugin "${manifest.id}" unterstützt maximal SidelineOS-Core v${maxClean} (aktuell ${optionen.coreVersion ?? effektiveCore}).`,
      };
    }
  }

  return { ok: true, sdkKompatibel: true, coreKompatibel: true };
}

export interface ManifestValidierungsOptionen {
  supportedSdkVersion?: string;
  coreVersion?: string;
  skipCompatibilityCheck?: boolean;
}

/**
 * Validiert ein `plugin.manifest.json` gegen das Core-SDK-Schema (`v1.0`)
 * und prüft (sofern nicht explizit für Dev-Git übersprungen) SDK- und Core-Kompatibilität.
 */
export function validierePluginManifest(
  raw: unknown,
  optionenOrSdk: string | ManifestValidierungsOptionen = '1.0'
): PluginManifest {
  const optionen: ManifestValidierungsOptionen =
    typeof optionenOrSdk === 'string'
      ? { supportedSdkVersion: optionenOrSdk }
      : optionenOrSdk;

  if (!raw || typeof raw !== 'object') {
    throw new PluginInstallerFehler(400, 'Ungültiges plugin.manifest.json (kein JSON-Objekt).');
  }
  const m = raw as Record<string, unknown>;
  const id = typeof m.id === 'string' ? m.id.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(id) || RESERVIERTE_PLUGIN_IDS.has(id)) {
    throw new PluginInstallerFehler(400, `Ungültige oder reservierte Plugin-ID "${id}".`);
  }

  const name = typeof m.name === 'string' ? m.name.trim() : '';
  const version = typeof m.version === 'string' ? m.version.trim() : '';
  const sdkVersion = typeof m.sdkVersion === 'string' ? m.sdkVersion.trim() : '';
  const dbPrefix = typeof m.dbPrefix === 'string' ? m.dbPrefix.trim() : '';

  if (!name || !version) {
    throw new PluginInstallerFehler(400, 'Manifest benötigt mindestens "name" und "version".');
  }

  const minCoreVersion =
    typeof m.minCoreVersion === 'string' && m.minCoreVersion.trim()
      ? m.minCoreVersion.trim().replace(/^v/i, '')
      : undefined;
  const maxCoreVersion =
    typeof m.maxCoreVersion === 'string' && m.maxCoreVersion.trim()
      ? m.maxCoreVersion.trim().replace(/^v/i, '')
      : undefined;

  if (minCoreVersion && !istSemVerVersion(minCoreVersion)) {
    throw new PluginInstallerFehler(
      400,
      `Ungültiges SemVer-Format für minCoreVersion: "${minCoreVersion}".`
    );
  }
  if (maxCoreVersion && !istSemVerVersion(maxCoreVersion)) {
    throw new PluginInstallerFehler(
      400,
      `Ungültiges SemVer-Format für maxCoreVersion: "${maxCoreVersion}".`
    );
  }

  if (!optionen.skipCompatibilityCheck) {
    const komp = pruefePluginKompatibilitaet(
      { id, sdkVersion, minCoreVersion, maxCoreVersion },
      {
        supportedSdkVersion: optionen.supportedSdkVersion ?? '1.0',
        coreVersion: optionen.coreVersion,
      }
    );
    if (!komp.ok) {
      throw new PluginInstallerFehler(409, komp.grund ?? 'Inkompatible Plugin-Version.');
    }
  }

  if (!/^mod_[a-z0-9_]+_$/.test(dbPrefix)) {
    throw new PluginInstallerFehler(
      400,
      `Ungültiger dbPrefix "${dbPrefix}" (erwartet: mod_<slug>_).`
    );
  }

  const rawPerms = Array.isArray(m.permissions) ? m.permissions : [];
  const permissions: PluginPermission[] = [];
  for (const p of rawPerms) {
    if (typeof p !== 'string' || !GUELTIGE_PERMISSIONS.has(p as PluginPermission)) {
      throw new PluginInstallerFehler(400, `Unbekannte Plugin-Permission "${String(p)}".`);
    }
    permissions.push(p as PluginPermission);
  }

  return {
    id,
    name,
    kurzbeschreibung:
      typeof m.kurzbeschreibung === 'string' ? m.kurzbeschreibung.trim() : '',
    version,
    sdkVersion: sdkVersion || '1.0',
    ...(minCoreVersion ? { minCoreVersion } : {}),
    ...(maxCoreVersion ? { maxCoreVersion } : {}),
    autor: typeof m.autor === 'string' ? m.autor.trim() : 'Unbekannt',
    repositoryUrl: typeof m.repositoryUrl === 'string' ? m.repositoryUrl.trim() : '',
    icon:
      m.icon === 'film' ||
      m.icon === 'book-open' ||
      m.icon === 'clipboard-check' ||
      m.icon === 'layers' ||
      m.icon === 'puzzle'
        ? m.icon
        : 'puzzle',
    status: m.status === 'AKTIV' ? 'AKTIV' : 'VORSCHAU',
    standardAktiviert: Boolean(m.standardAktiviert),
    permissions: Array.from(new Set(permissions)),
    dbPrefix,
    ...(typeof m.s3Prefix === 'string' && m.s3Prefix.trim()
      ? { s3Prefix: m.s3Prefix.trim() }
      : {}),
    settingsAnker:
      m.settingsAnker && typeof m.settingsAnker === 'object'
        ? (m.settingsAnker as PluginManifest['settingsAnker'])
        : {},
  };
}

function normalisiereTarPfad(rawPfad: string): string {
  const bereinigt = rawPfad.replace(/^\.\//, '').replace(/\/+$/, '');
  if (
    !bereinigt ||
    bereinigt.startsWith('/') ||
    bereinigt.includes('\\') ||
    bereinigt.includes('\u0000')
  ) {
    throw new PluginInstallerFehler(400, `Unsicherer Archiv-Pfad "${rawPfad}".`);
  }
  const segmente = bereinigt.split('/');
  if (segmente.some((s) => s === '' || s === '.' || s === '..')) {
    throw new PluginInstallerFehler(400, `Pfad-Traversal im Plugin-Archiv ("${rawPfad}").`);
  }
  return segmente.join('/');
}

/**
 * Pure-TS USTAR `.tar.gz`-Entpacker auf Basis der Node-Standardbibliothek (`node:zlib`)
 * mit integriertem Zip-Slip-, Symlink- und Größen-Schutz (max. 25 MB).
 */
export function entpackeTarGzSicher(tarGzBuffer: Buffer): Map<string, Buffer> {
  if (tarGzBuffer.length > MAX_TAR_BYTES) {
    throw new PluginInstallerFehler(400, 'Plugin-Archiv überschreitet das 25-MB-Limit.');
  }
  let tarBuffer: Buffer;
  try {
    tarBuffer = zlib.gunzipSync(tarGzBuffer, { maxOutputLength: MAX_TAR_BYTES });
  } catch {
    throw new PluginInstallerFehler(400, 'Plugin-Archiv ist kein gültiges .tar.gz.');
  }

  const dateien = new Map<string, Buffer>();
  let offset = 0;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    offset += 512;

    if (header.every((b) => b === 0)) {
      break;
    }

    const nameRaw = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefixRaw = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const fullName = prefixRaw ? `${prefixRaw}/${nameRaw}` : nameRaw;

    const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = sizeOctal ? Number.parseInt(sizeOctal, 8) : 0;
    const typeflag = String.fromCharCode(header[156] || 48);

    if (!Number.isFinite(size) || size < 0 || offset + size > tarBuffer.length) {
      throw new PluginInstallerFehler(400, 'Beschädigter TAR-Eintrag im Plugin-Archiv.');
    }

    const content = Buffer.from(tarBuffer.subarray(offset, offset + size));
    const paddedSize = Math.ceil(size / 512) * 512;
    offset += paddedSize;

    // Symlinks / Hardlinks blockieren
    if (typeflag === '1' || typeflag === '2') {
      throw new PluginInstallerFehler(400, 'Symlinks im Plugin-Archiv sind nicht erlaubt.');
    }

    // Verzeichnisse (5) & Pax-Header (x/g) überspringen
    if (typeflag === '5' || typeflag === 'x' || typeflag === 'g') {
      continue;
    }

    if (typeflag === '0' || typeflag === '\0') {
      if (dateien.size >= MAX_TAR_EINTRAEGE) {
        throw new PluginInstallerFehler(400, 'Plugin-Archiv enthält zu viele Dateien.');
      }
      const sichererPfad = normalisiereTarPfad(fullName);
      dateien.set(sichererPfad, content);
    }
  }

  return dateien;
}

/**
 * Hilfsfunktion zur Erzeugung eines gültigen `sideline-plugin-v1.tar.gz`-Archivs (Tests & CLI).
 */
export function erzeugeTarGzBuffer(dateien: Record<string, string | Buffer>): Buffer {
  const bloecke: Buffer[] = [];

  for (const [pfad, inhaltRoh] of Object.entries(dateien)) {
    const content = typeof inhaltRoh === 'string' ? Buffer.from(inhaltRoh, 'utf8') : inhaltRoh;
    const header = Buffer.alloc(512, 0);
    const nameBytes = Buffer.from(pfad, 'utf8');
    if (nameBytes.length > 100) {
      throw new Error(`TAR-Pfad zu lang: ${pfad}`);
    }
    nameBytes.copy(header, 0);
    Buffer.from('0000644\0', 'ascii').copy(header, 100);
    Buffer.from('0000000\0', 'ascii').copy(header, 108);
    Buffer.from('0000000\0', 'ascii').copy(header, 116);
    Buffer.from(content.length.toString(8).padStart(11, '0') + '\0', 'ascii').copy(header, 124);
    Buffer.from('00000000000\0', 'ascii').copy(header, 136);
    Buffer.from('        ', 'ascii').copy(header, 148);
    header[156] = '0'.charCodeAt(0);
    Buffer.from('ustar\0', 'ascii').copy(header, 257);
    Buffer.from('00', 'ascii').copy(header, 263);

    let checksum = 0;
    for (let i = 0; i < 512; i += 1) checksum += header[i];
    Buffer.from(checksum.toString(8).padStart(6, '0') + '\0 ', 'ascii').copy(header, 148);

    bloecke.push(header);
    if (content.length > 0) {
      bloecke.push(content);
      const rest = content.length % 512;
      if (rest !== 0) {
        bloecke.push(Buffer.alloc(512 - rest, 0));
      }
    }
  }

  bloecke.push(Buffer.alloc(1024, 0));
  return zlib.gzipSync(Buffer.concat(bloecke));
}

function validiereGitBranchName(branch: string | undefined): string | undefined {
  if (!branch || !branch.trim()) return undefined;
  const bereinigt = branch.trim();
  if (
    bereinigt.startsWith('-') ||
    bereinigt.includes('..') ||
    !/^[a-zA-Z0-9._/-]{1,80}$/.test(bereinigt)
  ) {
    throw new PluginInstallerFehler(400, 'Ungültiger Git-Branch oder Tag-Name.');
  }
  return bereinigt;
}

export class PluginInstallerService {
  private readonly fetchImpl: FetchLike;
  private readonly commandRunner: CommandRunner;
  private updateCache: { ergebnis: UpdatePruefErgebnis; ablaufMs: number } | null = null;

  constructor(
    private readonly db: CoreDatabaseClient,
    private readonly repo: CoreRepository,
    private readonly config: CoreServerConfig,
    optionen: { fetchImpl?: FetchLike; commandRunner?: CommandRunner } = {}
  ) {
    this.fetchImpl = optionen.fetchImpl ?? ((url, init) => fetch(url, init));
    this.commandRunner = optionen.commandRunner ?? defaultCommandRunner;
  }

  private async holeGitHubRelease(
    repoSlug: string,
    tag?: string
  ): Promise<GitHubReleaseApiAntwort> {
    const endpoint = tag
      ? `${this.config.githubApiBaseUrl}/repos/${repoSlug}/releases/tags/${encodeURIComponent(tag)}`
      : `${this.config.githubApiBaseUrl}/repos/${repoSlug}/releases/latest`;

    const res = await this.fetchImpl(endpoint, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SidelineOS-Core-Installer/1.0',
      },
    });
    if (!res.ok) {
      throw new PluginInstallerFehler(
        res.status === 404 ? 404 : 502,
        `GitHub-Release für "${repoSlug}" konnte nicht abgerufen werden (HTTP ${res.status}).`
      );
    }
    return (await res.json()) as GitHubReleaseApiAntwort;
  }

  private async fuehreMigrationenAusDateienAus(
    pluginId: string,
    dateien: Map<string, Buffer>
  ): Promise<number> {
    const migrationKeys = Array.from(dateien.keys())
      .filter((k) => k.startsWith('migrations/') && k.endsWith('.sql'))
      .sort();

    let ausgefuehrt = 0;
    for (const key of migrationKeys) {
      const sql = dateien.get(key)!.toString('utf8');
      const name = path.basename(key);
      const res = await fuehrePluginMigrationAus(this.db, pluginId, name, sql);
      if (res.ausgefuehrt) ausgefuehrt += 1;
    }
    return ausgefuehrt;
  }

  private async schreibeDateienAufPlatte(
    pluginId: string,
    version: string,
    dateien: Map<string, Buffer>
  ): Promise<string> {
    const zielBasis = path.resolve(this.config.pluginDataDir, pluginId, version);
    await fs.mkdir(zielBasis, { recursive: true });

    for (const [relPfad, buf] of dateien.entries()) {
      const vollPfad = path.resolve(zielBasis, relPfad);
      if (!vollPfad.startsWith(zielBasis + path.sep) && vollPfad !== zielBasis) {
        throw new PluginInstallerFehler(400, 'Ungültiger Zielpfad bei Plugin-Entpackung.');
      }
      await fs.mkdir(path.dirname(vollPfad), { recursive: true });
      await fs.writeFile(vollPfad, buf);
    }
    return zielBasis;
  }

  async installiereAusOfflineTarGz(params: {
    tarGzBuffer: Buffer;
    expectedSha256?: string;
    sourceUrl?: string;
    releaseTag?: string;
    effectiveVersion?: string;
    installMode?: 'RELEASE_BUNDLE' | 'OFFLINE_UPLOAD';
  }): Promise<{
    manifest: PluginManifest;
    sha256: string;
    migrationenAusgefuehrt: number;
  }> {
    const sha256 = crypto.createHash('sha256').update(params.tarGzBuffer).digest('hex');
    if (params.expectedSha256) {
      const erwartet = params.expectedSha256.trim().toLowerCase().split(/\s+/)[0] ?? '';
      if (!erwartet || erwartet !== sha256) {
        throw new PluginInstallerFehler(
          400,
          'SHA-256-Prüfsumme des Plugin-Pakets stimmt nicht überein.'
        );
      }
    }

    const dateien = entpackeTarGzSicher(params.tarGzBuffer);
    const manifestBuffer =
      dateien.get('plugin.manifest.json') ?? dateien.get('dist/plugin.manifest.json');
    if (!manifestBuffer) {
      throw new PluginInstallerFehler(
        400,
        'Plugin-Archiv enthält keine "plugin.manifest.json".'
      );
    }

    let rawManifest: unknown;
    try {
      rawManifest = JSON.parse(manifestBuffer.toString('utf8'));
    } catch {
      throw new PluginInstallerFehler(400, '"plugin.manifest.json" ist kein gültiges JSON.');
    }

    const manifest = validierePluginManifest(rawManifest, {
      supportedSdkVersion: this.config.supportedSdkVersion,
      coreVersion: this.config.coreVersion,
    });
    if (!manifest.repositoryUrl && params.sourceUrl) {
      manifest.repositoryUrl = params.sourceUrl;
    }
    if (params.effectiveVersion) {
      manifest.version = normalisiereInstallVersion(params.effectiveVersion, manifest.version);
    }

    await this.schreibeDateienAufPlatte(manifest.id, manifest.version, dateien);
    const migrationenAusgefuehrt = await this.fuehreMigrationenAusDateienAus(
      manifest.id,
      dateien
    );

    await this.repo.speicherePluginInstallation({
      manifest,
      source: params.sourceUrl ? 'CUSTOM_GITHUB' : 'OFFLINE_BUNDLE',
      releaseTag: params.releaseTag || `v${manifest.version}`,
      enabledGlobally: true,
      installMode: params.installMode ?? 'OFFLINE_UPLOAD',
      packageSha256: sha256,
    });

    this.updateCache = null;
    return { manifest, sha256, migrationenAusgefuehrt };
  }

  async installiereAusReleaseBundle(params: {
    repoUrl: string;
    tag?: string;
  }): Promise<{
    manifest: PluginManifest;
    sha256: string;
    releaseTag: string;
    migrationenAusgefuehrt: number;
  }> {
    const quelle = parseGitHubPluginQuelle(params.repoUrl);
    if (!quelle.ok || !quelle.repoUrl) {
      throw new PluginInstallerFehler(400, quelle.fehler ?? 'Ungültige GitHub-URL.');
    }
    const repoSlug = quelle.repoUrl.replace(/^https:\/\/github\.com\//, '');
    const release = await this.holeGitHubRelease(repoSlug, params.tag);
    const assets = release.assets ?? [];

    const tarAsset =
      assets.find((a) => a.name === 'sideline-plugin-v1.tar.gz') ??
      assets.find((a) => a.name.endsWith('.tar.gz'));
    if (!tarAsset) {
      throw new PluginInstallerFehler(
        404,
        `GitHub Release "${release.tag_name}" enthält kein .tar.gz-Plugin-Paket.`
      );
    }

    const shaAsset =
      assets.find((a) => a.name === `${tarAsset.name}.sha256`) ??
      assets.find((a) => a.name.endsWith('.sha256'));

    let expectedSha256: string | undefined;
    if (shaAsset) {
      const shaRes = await this.fetchImpl(shaAsset.browser_download_url);
      if (!shaRes.ok) {
        throw new PluginInstallerFehler(
          502,
          'SHA-256-Prüfsummendatei konnte nicht geladen werden.'
        );
      }
      expectedSha256 = await shaRes.text();
    }

    const tarRes = await this.fetchImpl(tarAsset.browser_download_url);
    if (!tarRes.ok) {
      throw new PluginInstallerFehler(
        502,
        `Plugin-Release-Bundle konnte nicht geladen werden (HTTP ${tarRes.status}).`
      );
    }
    const tarGzBuffer = Buffer.from(await tarRes.arrayBuffer());

    const releaseVersion = normalisiereInstallVersion(release.tag_name);
    const ergebnis = await this.installiereAusOfflineTarGz({
      tarGzBuffer,
      expectedSha256,
      sourceUrl: quelle.repoUrl,
      releaseTag: release.tag_name,
      effectiveVersion: releaseVersion,
      installMode: 'RELEASE_BUNDLE',
    });

    return {
      ...ergebnis,
      releaseTag: release.tag_name,
    };
  }

  async installiereDevAusGit(params: {
    repoUrl: string;
    branch?: string;
  }): Promise<{
    manifest: PluginManifest;
    branch: string;
    migrationenAusgefuehrt: number;
  }> {
    if (!this.config.devAllowGitInstall) {
      throw new PluginInstallerFehler(
        403,
        'Git-Branch-Installation ist deaktiviert (DEV_ALLOW_GIT_INSTALL=true in .env erforderlich).'
      );
    }

    const quelle = parseGitHubPluginQuelle(params.repoUrl);
    if (!quelle.ok || !quelle.repoUrl || !quelle.slug) {
      throw new PluginInstallerFehler(400, quelle.fehler ?? 'Ungültige GitHub-URL.');
    }
    const branch = validiereGitBranchName(params.branch);

    const stagingDir = path.resolve(
      this.config.pluginDataDir,
      '_staging',
      `${quelle.slug}-${Date.now()}`
    );
    const buildHome = path.resolve(this.config.pluginDataDir, '_build-home');
    const npmCache = path.resolve(this.config.pluginDataDir, '_npm-cache');
    await fs.mkdir(path.dirname(stagingDir), { recursive: true });
    await fs.mkdir(buildHome, { recursive: true });
    await fs.mkdir(npmCache, { recursive: true });

    const buildEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: buildHome,
      npm_config_cache: npmCache,
      // Auch wenn der Core unter NODE_ENV=production läuft, braucht der Plugin-Build devDependencies (vite/tsc)
      NODE_ENV: 'development',
    };

    try {
      const cloneArgs = ['clone', '--depth', '1'];
      if (branch) {
        cloneArgs.push('--branch', branch);
      }
      cloneArgs.push(`${quelle.repoUrl}.git`, stagingDir);
      await this.fuehreDevBefehlAus('Git-Clone', 'git', cloneArgs, { env: buildEnv });

      let manifestRawStr: string;
      let manifestJson: unknown;
      try {
        manifestRawStr = await fs.readFile(path.join(stagingDir, 'plugin.manifest.json'), 'utf8');
        manifestJson = JSON.parse(manifestRawStr);
      } catch {
        throw new PluginInstallerFehler(
          422,
          'plugin.manifest.json fehlt im geklonten Repository oder ist kein gültiges JSON.'
        );
      }
      // Bei Dev-Git-Clone bewusst kein SDK-/Core-Kompatibilitätsabgleich
      const manifest = validierePluginManifest(manifestJson, {
        skipCompatibilityCheck: true,
      });
      if (!manifest.repositoryUrl) {
        manifest.repositoryUrl = quelle.repoUrl;
      }

      const erkannteBranch = await this.commandRunner(
        'git',
        ['symbolic-ref', '--short', 'HEAD'],
        { cwd: stagingDir, env: buildEnv }
      ).catch(() => ({ stdout: '', stderr: '' }));
      const effektiverBranch = branch || erkannteBranch.stdout.trim() || 'main';

      const erkannterCommit = await this.commandRunner(
        'git',
        ['rev-parse', '--short', 'HEAD'],
        { cwd: stagingDir, env: buildEnv }
      ).catch(() => ({ stdout: '', stderr: '' }));
      const shortSha = erkannterCommit.stdout.trim();
      const saubererBranch =
        effektiverBranch
          .replace(/[^a-zA-Z0-9._-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'main';
      const commitSuffix = /^[a-zA-Z0-9]{4,40}$/.test(shortSha) ? shortSha : 'dev';
      const devVersion = normalisiereInstallVersion(`${saubererBranch}-${commitSuffix}`);
      manifest.version = devVersion;

      // Lockfile prüfen für reproduzierbaren Dev-Build
      let hatLockfile = false;
      try {
        await fs.access(path.join(stagingDir, 'package-lock.json'));
        hatLockfile = true;
      } catch {
        hatLockfile = false;
      }

      await this.fuehreDevBefehlAus(
        'npm-Installation',
        'npm',
        hatLockfile
          ? ['ci', '--include=dev', '--legacy-peer-deps', '--no-audit', '--no-fund']
          : ['install', '--include=dev', '--legacy-peer-deps', '--no-audit', '--no-fund'],
        { cwd: stagingDir, env: buildEnv }
      );
      await this.stelleLokalesSdkBereit(stagingDir);
      await this.fuehreDevBefehlAus('Plugin-Build', 'npm', ['run', 'build'], {
        cwd: stagingDir,
        env: buildEnv,
      });

      // Gebautes dist/ + Manifest + optionale Migrationen einsammeln
      const gesammelteDateien = new Map<string, Buffer>();
      gesammelteDateien.set(
        'plugin.manifest.json',
        Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
      );
      await this.sammleVerzeichnisRekursiv(
        path.join(stagingDir, 'dist'),
        'dist',
        gesammelteDateien
      );
      await this.sammleVerzeichnisRekursiv(
        path.join(stagingDir, 'migrations'),
        'migrations',
        gesammelteDateien
      );

      await this.schreibeDateienAufPlatte(manifest.id, devVersion, gesammelteDateien);
      const migrationenAusgefuehrt = await this.fuehreMigrationenAusDateienAus(
        manifest.id,
        gesammelteDateien
      );

      await this.repo.speicherePluginInstallation({
        manifest,
        source: 'DEV_GITHUB',
        releaseTag: `dev:${effektiverBranch}`,
        enabledGlobally: true,
        installMode: 'DEV_GIT',
        devBranch: effektiverBranch,
      });

      await this.bereinigeAltePluginVersionen(manifest.id, devVersion);

      this.updateCache = null;
      return { manifest, branch: effektiverBranch, migrationenAusgefuehrt };
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async fuehreDevBefehlAus(
    schritt: string,
    cmd: string,
    args: string[],
    options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await this.commandRunner(cmd, args, options);
    } catch (err) {
      if (err instanceof PluginInstallerFehler) throw err;
      throw new PluginInstallerFehler(422, `${schritt} fehlgeschlagen: ${kuerzeFehlerAusgabe(err)}`);
    }
  }

  private async stelleLokalesSdkBereit(stagingDir: string): Promise<void> {
    const sdkPackageJson = path.join(CORE_PLUGIN_SDK_DIR, 'package.json');
    const sdkDistDir = path.join(CORE_PLUGIN_SDK_DIR, 'dist');
    try {
      await fs.access(sdkPackageJson);
      await fs.access(sdkDistDir);
    } catch {
      return;
    }

    const zielDir = path.join(stagingDir, 'node_modules', '@sidelineos', 'plugin-sdk');
    await fs.rm(zielDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.mkdir(zielDir, { recursive: true });
    await fs.cp(sdkPackageJson, path.join(zielDir, 'package.json'));
    await fs.cp(sdkDistDir, path.join(zielDir, 'dist'), { recursive: true });
  }

  private async bereinigeAltePluginVersionen(
    pluginId: string,
    behalteVersion: string
  ): Promise<void> {
    const pluginDir = path.resolve(this.config.pluginDataDir, pluginId);
    try {
      const eintraege = await fs.readdir(pluginDir, { withFileTypes: true });
      for (const eintrag of eintraege) {
        if (eintrag.name === behalteVersion) continue;
        await fs
          .rm(path.join(pluginDir, eintrag.name), { recursive: true, force: true })
          .catch(() => undefined);
      }
    } catch {
      // Verzeichnis existiert nicht -> ignorieren
    }
  }

  private async sammleVerzeichnisRekursiv(
    dirPath: string,
    relPrefix: string,
    ziel: Map<string, Buffer>
  ): Promise<void> {
    try {
      const eintraege = await fs.readdir(dirPath, { withFileTypes: true });
      for (const eintrag of eintraege) {
        const voll = path.join(dirPath, eintrag.name);
        const rel = `${relPrefix}/${eintrag.name}`;
        if (eintrag.isDirectory()) {
          await this.sammleVerzeichnisRekursiv(voll, rel, ziel);
        } else if (eintrag.isFile()) {
          ziel.set(rel, await fs.readFile(voll));
        }
      }
    } catch {
      // Optionales Verzeichnis existiert nicht -> ignorieren
    }
  }

  async rollbackPlugin(pluginId: string): Promise<{ manifest: PluginManifest; version: string }> {
    const status = await this.repo.findePluginStatus(pluginId);
    if (!status) {
      throw new PluginInstallerFehler(404, `Plugin "${pluginId}" ist nicht installiert.`);
    }
    if (!status.previousVersion) {
      throw new PluginInstallerFehler(
        409,
        `Für "${pluginId}" liegt keine vorherige Version für ein Rollback vor.`
      );
    }

    const prevDir = path.resolve(this.config.pluginDataDir, pluginId, status.previousVersion);
    let manifest: PluginManifest = {
      ...status.manifest,
      version: status.previousVersion,
    };
    try {
      const raw = await fs.readFile(path.join(prevDir, 'plugin.manifest.json'), 'utf8');
      manifest = validierePluginManifest(JSON.parse(raw), {
        skipCompatibilityCheck: !istSemVerVersion(status.previousVersion),
        supportedSdkVersion: this.config.supportedSdkVersion,
        coreVersion: this.config.coreVersion,
      });
      manifest.version = status.previousVersion;
    } catch {
      // Fallback auf Metadaten-Version falls Katalog-Rollback
    }

    const rollbackTag = istSemVerVersion(status.previousVersion)
      ? `v${status.previousVersion}`
      : status.previousVersion;
    await this.repo.rollbackPluginVersion(
      pluginId,
      manifest,
      status.previousVersion,
      rollbackTag
    );
    this.updateCache = null;
    return { manifest, version: status.previousVersion };
  }

  async deinstallierePlugin(pluginId: string): Promise<void> {
    const geloescht = await this.repo.entferneInstalliertesPlugin(pluginId);
    if (!geloescht) {
      throw new PluginInstallerFehler(404, `Plugin "${pluginId}" ist nicht installiert.`);
    }
    const pluginDir = path.resolve(this.config.pluginDataDir, pluginId);
    await fs.rm(pluginDir, { recursive: true, force: true }).catch(() => undefined);
    this.updateCache = null;
  }

  async pruefeUpdates(optionen: { forceRefresh?: boolean } = {}): Promise<UpdatePruefErgebnis> {
    if (this.config.disableUpdateCheck) {
      return {
        deaktiviert: true,
        geprueftAm: new Date().toISOString(),
        coreUpdate: null,
        pluginUpdates: [],
        anzahlVerfuegbar: 0,
      };
    }

    if (
      !optionen.forceRefresh &&
      this.updateCache &&
      Date.now() < this.updateCache.ablaufMs
    ) {
      return this.updateCache.ergebnis;
    }

    let coreUpdate: CoreUpdateInfo = {
      aktuell: this.config.coreVersion,
      verfuegbar: null,
      updateVerfuegbar: false,
      releaseUrl: null,
      veroeffentlichtAm: null,
    };

    try {
      const coreRelease = await this.holeGitHubRelease(this.config.coreGithubRepo);
      const neusteCore = coreRelease.tag_name.replace(/^v/i, '');
      const istSemVerCore = /^\d+\.\d+\.\d+/.test(
        this.config.coreVersion.trim().replace(/^v/i, '')
      );
      const istNeuer = istSemVerCore && vergleicheSemVer(this.config.coreVersion, neusteCore) < 0;
      coreUpdate = {
        aktuell: this.config.coreVersion,
        verfuegbar: neusteCore,
        updateVerfuegbar: istNeuer,
        releaseUrl: coreRelease.html_url ?? null,
        veroeffentlichtAm: coreRelease.published_at ?? null,
        ...(istNeuer
          ? {
              hinweis: `${this.config.coreName} ${neusteCore} verfügbar (aktuell ${this.config.coreVersion}). Deployment-Image bzw. Release aktualisieren.`,
            }
          : {}),
      };
    } catch {
      // Offline / Rate-Limit -> leise ohne Fehler
    }

    const installierte = await this.repo.listeInstalliertePlugins();
    const pluginUpdates: PluginUpdateEintrag[] = [];

    for (const eintrag of installierte) {
      const quelle = parseGitHubPluginQuelle(eintrag.manifest.repositoryUrl || '');
      if (!quelle.ok || !quelle.repoUrl) continue;

      const repoSlug = quelle.repoUrl.replace(/^https:\/\/github\.com\//, '');
      try {
        const rel = await this.holeGitHubRelease(repoSlug);
        const neusteVersion = rel.tag_name.replace(/^v/i, '');
        const aktuell = eintrag.installedVersion || eintrag.manifest.version;
        const istSemVerPlugin =
          eintrag.installMode !== 'DEV_GIT' && istSemVerVersion(aktuell);
        const updateVerfuegbar =
          istSemVerPlugin && vergleicheSemVer(aktuell, neusteVersion) < 0;

        let sdkKompatibel = true;
        let coreKompatibel = true;
        const manifestAsset = (rel.assets ?? []).find((a) => a.name === 'plugin.manifest.json');
        if (manifestAsset) {
          try {
            const mRes = await this.fetchImpl(manifestAsset.browser_download_url);
            if (mRes.ok) {
              const mJson = (await mRes.json()) as {
                sdkVersion?: string;
                minCoreVersion?: string;
                maxCoreVersion?: string;
              };
              const komp = pruefePluginKompatibilitaet(
                {
                  id: eintrag.manifest.id,
                  sdkVersion: mJson.sdkVersion ?? eintrag.manifest.sdkVersion ?? '1.0',
                  minCoreVersion: mJson.minCoreVersion,
                  maxCoreVersion: mJson.maxCoreVersion,
                },
                {
                  supportedSdkVersion: this.config.supportedSdkVersion,
                  coreVersion: this.config.coreVersion,
                }
              );
              sdkKompatibel = komp.sdkKompatibel;
              coreKompatibel = komp.coreKompatibel;
            }
          } catch {
            // Optionaler Check
          }
        }

        pluginUpdates.push({
          pluginId: eintrag.manifest.id,
          name: eintrag.manifest.name,
          aktuell,
          verfuegbar: neusteVersion,
          updateVerfuegbar,
          sdkKompatibel,
          coreKompatibel,
          releaseTag: rel.tag_name,
          releaseUrl: rel.html_url ?? null,
        });
      } catch {
        // Offline oder privates/nicht-releastes Repo überspringen
      }
    }

    const anzahlVerfuegbar =
      (coreUpdate.updateVerfuegbar ? 1 : 0) +
      pluginUpdates.filter((p) => p.updateVerfuegbar).length;

    const ergebnis: UpdatePruefErgebnis = {
      deaktiviert: false,
      geprueftAm: new Date().toISOString(),
      coreUpdate,
      pluginUpdates,
      anzahlVerfuegbar,
    };

    this.updateCache = { ergebnis, ablaufMs: Date.now() + CACHE_TTL_MS };
    return ergebnis;
  }
}
