import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { parseGitHubPluginQuelle } from '../../core/pluginRegistry.ts';
import type { PluginManifest, PluginPermission } from '../../sdk/plugin.ts';
import type { CoreServerConfig } from '../config.ts';
import { fuehrePluginMigrationAus, type CoreDatabaseClient } from '../db/client.ts';
import type { CoreRepository } from '../db/coreRepository.ts';

const execFileAsync = promisify(execFile);

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
  options: { cwd?: string; timeoutMs?: number }
) => Promise<{ stdout: string; stderr: string }>;

function defaultCommandRunner(
  cmd: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(cmd, args, {
    cwd: options.cwd,
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

/**
 * Validiert ein `plugin.manifest.json` gegen das Core-SDK-Schema (`v1.0`).
 */
export function validierePluginManifest(
  raw: unknown,
  supportedSdkVersion = '1.0'
): PluginManifest {
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
  if (sdkVersion !== supportedSdkVersion) {
    throw new PluginInstallerFehler(
      409,
      `Inkompatible SDK-Version "${sdkVersion}" (Core unterstützt "${supportedSdkVersion}").`
    );
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
    sdkVersion: '1.0',
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

    const manifest = validierePluginManifest(rawManifest, this.config.supportedSdkVersion);
    if (!manifest.repositoryUrl && params.sourceUrl) {
      manifest.repositoryUrl = params.sourceUrl;
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

    const ergebnis = await this.installiereAusOfflineTarGz({
      tarGzBuffer,
      expectedSha256,
      sourceUrl: quelle.repoUrl,
      releaseTag: release.tag_name,
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
    if (this.config.nodeEnv === 'production' || !this.config.devAllowGitInstall) {
      throw new PluginInstallerFehler(
        403,
        'Dev-Git-Installation ist nur im Entwicklungsmodus mit DEV_ALLOW_GIT_INSTALL=true erlaubt.'
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
    await fs.mkdir(path.dirname(stagingDir), { recursive: true });

    try {
      const cloneArgs = ['clone', '--depth', '1'];
      if (branch) {
        cloneArgs.push('--branch', branch);
      }
      cloneArgs.push(`${quelle.repoUrl}.git`, stagingDir);
      await this.commandRunner('git', cloneArgs, {});

      const manifestRawStr = await fs.readFile(
        path.join(stagingDir, 'plugin.manifest.json'),
        'utf8'
      );
      const manifest = validierePluginManifest(
        JSON.parse(manifestRawStr),
        this.config.supportedSdkVersion
      );
      if (!manifest.repositoryUrl) {
        manifest.repositoryUrl = quelle.repoUrl;
      }

      // Lockfile prüfen für reproduzierbaren Dev-Build
      let hatLockfile = false;
      try {
        await fs.access(path.join(stagingDir, 'package-lock.json'));
        hatLockfile = true;
      } catch {
        hatLockfile = false;
      }

      await this.commandRunner(
        'npm',
        hatLockfile ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund'],
        { cwd: stagingDir }
      );
      await this.commandRunner('npm', ['run', 'build'], { cwd: stagingDir });

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

      await this.schreibeDateienAufPlatte(manifest.id, manifest.version, gesammelteDateien);
      const migrationenAusgefuehrt = await this.fuehreMigrationenAusDateienAus(
        manifest.id,
        gesammelteDateien
      );

      const effektiverBranch = branch || 'main';
      await this.repo.speicherePluginInstallation({
        manifest,
        source: 'DEV_GITHUB',
        releaseTag: `dev:${effektiverBranch}`,
        enabledGlobally: true,
        installMode: 'DEV_GIT',
        devBranch: effektiverBranch,
      });

      this.updateCache = null;
      return { manifest, branch: effektiverBranch, migrationenAusgefuehrt };
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
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
      manifest = validierePluginManifest(JSON.parse(raw), this.config.supportedSdkVersion);
    } catch {
      // Fallback auf Metadaten-Version falls Katalog-Rollback
    }

    await this.repo.rollbackPluginVersion(
      pluginId,
      manifest,
      status.previousVersion,
      `v${status.previousVersion}`
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
      const istNeuer = vergleicheSemVer(this.config.coreVersion, neusteCore) < 0;
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
        const updateVerfuegbar = vergleicheSemVer(aktuell, neusteVersion) < 0;

        let sdkKompatibel = true;
        const manifestAsset = (rel.assets ?? []).find((a) => a.name === 'plugin.manifest.json');
        if (manifestAsset) {
          try {
            const mRes = await this.fetchImpl(manifestAsset.browser_download_url);
            if (mRes.ok) {
              const mJson = (await mRes.json()) as { sdkVersion?: string };
              if (mJson.sdkVersion && mJson.sdkVersion !== this.config.supportedSdkVersion) {
                sdkKompatibel = false;
              }
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
