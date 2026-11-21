import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import zlib from 'node:zlib';
import { DEMO_STANDARD_PASSWORT } from '../../src/core/authService.ts';
import type { PluginManifest, SidelineBackendPlugin } from '../../src/sdk/plugin.ts';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import { CoreRepository } from '../../src/server/db/coreRepository.ts';
import { PluginBackendHost } from '../../src/server/plugins/backendHost.ts';
import {
  erzeugeTarGzBuffer,
  entpackeTarGzSicher,
  PluginInstallerFehler,
  PluginInstallerService,
  validierePluginManifest,
  vergleicheSemVer,
} from '../../src/server/services/pluginInstaller.ts';
import { S3BrokerService } from '../../src/server/services/s3Broker.ts';
import { S3CleanupService } from '../../src/server/services/s3CleanupService.ts';

function extrahiereCookieHeader(setCookie: string | null): string {
  if (!setCookie) return '';
  return setCookie.split(';')[0] ?? '';
}

function erzeugeTarMitSymlink(): Buffer {
  const header = Buffer.alloc(512, 0);
  Buffer.from('evil-link', 'utf8').copy(header, 0);
  Buffer.from('0000777\0', 'ascii').copy(header, 100);
  Buffer.from('0000000\0', 'ascii').copy(header, 108);
  Buffer.from('0000000\0', 'ascii').copy(header, 116);
  Buffer.from('00000000000\0', 'ascii').copy(header, 124);
  Buffer.from('00000000000\0', 'ascii').copy(header, 136);
  Buffer.from('        ', 'ascii').copy(header, 148);
  header[156] = '2'.charCodeAt(0); // Symlink
  Buffer.from('/etc/passwd', 'utf8').copy(header, 157);
  Buffer.from('ustar\0', 'ascii').copy(header, 257);
  Buffer.from('00', 'ascii').copy(header, 263);
  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += header[i];
  Buffer.from(sum.toString(8).padStart(6, '0') + '\0 ', 'ascii').copy(header, 148);
  return zlib.gzipSync(Buffer.concat([header, Buffer.alloc(1024, 0)]));
}

describe('Core-Phase 3: SDK, Plugin-Installer, Updates, Rollback & S3-Cleanup', () => {
  let tmpDataDir: string;
  let db: CoreDatabaseClient;
  let repo: CoreRepository;
  let mockGitHubServer: http.Server;
  let mockGitHubBaseUrl: string;
  let coreServer: http.Server;
  let baseUrl: string;
  let sysadminCookie: string;
  let coachCookie: string;
  let geloeschteS3Keys: string[] = [];

  // Steuerbare Mock-Release-Payloads für Offline-Tests
  let aktivePluginReleaseVersion = '0.1.0';
  let aktuellesShaSollFehlschlagen = false;
  let aktuellesSdkSollInkompatibelSein = false;
  let coreNeuesteVersion = '0.3.0';

  const erstelleTestBundle = (params: {
    id: string;
    name: string;
    version: string;
    sdkVersion?: string;
    mitMigration?: boolean;
  }) => {
    const manifest = {
      id: params.id,
      name: params.name,
      kurzbeschreibung: 'Test-Plugin für Phase 3',
      version: params.version,
      sdkVersion: params.sdkVersion ?? '1.0',
      autor: 'SidelineOS Test',
      repositoryUrl: `https://github.com/sidelineos/${params.id}`,
      icon: 'puzzle',
      status: 'AKTIV',
      standardAktiviert: false,
      permissions: ['team:read', 'db:plugin-tables'],
      dbPrefix: `mod_${params.id.replace(/-/g, '_')}_`,
      s3Prefix: `plugins/${params.id}/`,
      settingsAnker: {},
    };
    const dateien: Record<string, string> = {
      'plugin.manifest.json': JSON.stringify(manifest, null, 2),
      'dist/index.js': `export const version = "${params.version}";`,
    };
    if (params.mitMigration) {
      dateien['migrations/001_init.sql'] = `
        CREATE TABLE IF NOT EXISTS mod_${params.id.replace(/-/g, '_')}_items (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          titel TEXT NOT NULL
        );
      `;
    }
    const tarGz = erzeugeTarGzBuffer(dateien);
    const sha256 = crypto.createHash('sha256').update(tarGz).digest('hex');
    return { manifest, tarGz, sha256 };
  };

  before(async () => {
    tmpDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sidelineos-p3-'));

    // 1. Lokaler Mock-GitHub-API + Asset-Server (100% offline)
    mockGitHubServer = http.createServer((req, res) => {
      const urlPath = req.url ?? '';

      if (urlPath.startsWith('/repos/sidelineos/sidelineos-core/releases/latest')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            tag_name: `v${coreNeuesteVersion}`,
            html_url: `https://github.com/sidelineos/sidelineos-core/releases/tag/v${coreNeuesteVersion}`,
            published_at: '2026-05-01T12:00:00Z',
            assets: [],
          })
        );
        return;
      }

      if (
        urlPath.startsWith('/repos/sidelineos/scouting-demo/releases/latest') ||
        urlPath.startsWith('/repos/sidelineos/scouting-demo/releases/tags/')
      ) {
        const tag = urlPath.includes('/tags/')
          ? decodeURIComponent(urlPath.split('/tags/')[1] ?? `v${aktivePluginReleaseVersion}`)
          : `v${aktivePluginReleaseVersion}`;
        const version = tag.replace(/^v/, '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            tag_name: tag,
            html_url: `https://github.com/sidelineos/scouting-demo/releases/tag/${tag}`,
            published_at: '2026-05-01T12:00:00Z',
            assets: [
              {
                name: 'sideline-plugin-v1.tar.gz',
                browser_download_url: `${mockGitHubBaseUrl}/assets/scouting-demo/${version}/sideline-plugin-v1.tar.gz`,
              },
              {
                name: 'sideline-plugin-v1.tar.gz.sha256',
                browser_download_url: `${mockGitHubBaseUrl}/assets/scouting-demo/${version}/sideline-plugin-v1.tar.gz.sha256`,
              },
              {
                name: 'plugin.manifest.json',
                browser_download_url: `${mockGitHubBaseUrl}/assets/scouting-demo/${version}/plugin.manifest.json`,
              },
            ],
          })
        );
        return;
      }

      const assetMatch = urlPath.match(/^\/assets\/scouting-demo\/([^/]+)\/(.+)$/);
      if (assetMatch) {
        const version = assetMatch[1];
        const fileName = assetMatch[2];
        const bundle = erstelleTestBundle({
          id: 'scouting-demo',
          name: 'Scouting Demo',
          version,
          sdkVersion: aktuellesSdkSollInkompatibelSein ? '2.0' : '1.0',
          mitMigration: true,
        });

        if (fileName === 'sideline-plugin-v1.tar.gz') {
          res.writeHead(200, { 'Content-Type': 'application/gzip' });
          res.end(bundle.tarGz);
          return;
        }
        if (fileName === 'sideline-plugin-v1.tar.gz.sha256') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(
            aktuellesShaSollFehlschlagen
              ? '0000000000000000000000000000000000000000000000000000000000000000  sideline-plugin-v1.tar.gz\n'
              : `${bundle.sha256}  sideline-plugin-v1.tar.gz\n`
          );
          return;
        }
        if (fileName === 'plugin.manifest.json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(bundle.manifest));
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not Found' }));
    });

    await new Promise<void>((resolve) => {
      mockGitHubServer.listen(0, '127.0.0.1', () => resolve());
    });
    const ghAddr = mockGitHubServer.address();
    assert.ok(ghAddr && typeof ghAddr === 'object');
    mockGitHubBaseUrl = `http://127.0.0.1:${ghAddr.port}`;

    // 2. Core-App mit Development-Konfig (inkl. DEV_ALLOW_GIT_INSTALL=true) starten
    const config = loadCoreConfig({
      NODE_ENV: 'development',
      APP_URL: 'https://sideline.example.org',
      SESSION_SECRET: 'phase3-test-session-secret-mindestens-32-chars',
      ENABLED_MODULES: 'video-analysis,playbook',
      CORE_VERSION: '0.1.0',
      PLUGIN_DATA_DIR: tmpDataDir,
      DEV_ALLOW_GIT_INSTALL: 'true',
      GITHUB_API_BASE_URL: mockGitHubBaseUrl,
      CORE_GITHUB_REPO: 'sidelineos/sidelineos-core',
      S3_ENDPOINT: 'http://127.0.0.1:9000',
      S3_BUCKET: 'sidelineos-test',
      S3_ACCESS_KEY: 'test-access-key',
      S3_SECRET_KEY: 'test-secret-key-1234',
    });

    db = await erstelleDatenbankClient(config);
    await bootstrapCoreInstance(db, config, { seedDemoWennLeer: true });
    repo = new CoreRepository(db);

    const s3Broker = new S3BrokerService(repo, config, {
      clientFactory: () => ({
        async send(command: unknown) {
          const cmd = command as { constructor: { name: string }; input: { Key?: string } };
          if (cmd.constructor.name === 'DeleteObjectCommand' && cmd.input.Key) {
            geloeschteS3Keys.push(cmd.input.Key);
          }
          return { $metadata: { httpStatusCode: 200 } };
        },
      }),
    });
    const s3Cleanup = new S3CleanupService(db, s3Broker);

    const pluginInstaller = new PluginInstallerService(db, repo, config, {
      commandRunner: async (cmd, args, opts) => {
        if (cmd === 'git' && args[0] === 'clone') {
          const targetDir = args[args.length - 1];
          await fs.mkdir(path.join(targetDir, 'dist'), { recursive: true });
          await fs.mkdir(path.join(targetDir, 'migrations'), { recursive: true });
          await fs.writeFile(
            path.join(targetDir, 'plugin.manifest.json'),
            JSON.stringify({
              id: 'dev-analytics',
              name: 'Dev Analytics',
              kurzbeschreibung: 'Aus Git geklontes Dev-Plugin',
              version: '0.4.0-dev',
              sdkVersion: '1.0',
              autor: 'Verein Dev',
              repositoryUrl: 'https://github.com/verein/sidelineos-plugin-dev-analytics',
              icon: 'layers',
              status: 'AKTIV',
              standardAktiviert: false,
              permissions: ['team:read', 'db:plugin-tables'],
              dbPrefix: 'mod_dev_analytics_',
              settingsAnker: {},
            }),
            'utf8'
          );
          await fs.writeFile(path.join(targetDir, 'package-lock.json'), '{}', 'utf8');
        }
        if (cmd === 'npm' && opts.cwd && args.includes('build')) {
          await fs.writeFile(path.join(opts.cwd, 'dist', 'index.js'), 'export default {};', 'utf8');
          await fs.writeFile(
            path.join(opts.cwd, 'migrations', '001_dev.sql'),
            'CREATE TABLE IF NOT EXISTS mod_dev_analytics_runs (id TEXT PRIMARY KEY);',
            'utf8'
          );
        }
        return { stdout: '', stderr: '' };
      },
    });

    const pluginHost = new PluginBackendHost(db, s3Broker, s3Cleanup);
    const videoManifest: PluginManifest = {
      id: 'video-analysis',
      name: 'Videoanalyse',
      kurzbeschreibung: 'Test',
      version: '0.1.0',
      sdkVersion: '1.0',
      autor: 'Test',
      repositoryUrl: 'https://github.com/sidelineos/scouting-demo',
      icon: 'film',
      status: 'AKTIV',
      standardAktiviert: true,
      permissions: ['team:read', 's3:team-rw', 's3:cleanup-queue', 'db:plugin-tables'],
      dbPrefix: 'mod_video_',
      s3Prefix: 'plugins/video-analysis/',
      settingsAnker: {},
    };
    const playbookManifest: PluginManifest = {
      ...videoManifest,
      id: 'playbook',
      name: 'Playbook',
      permissions: ['team:read', 'db:plugin-tables'],
      dbPrefix: 'mod_playbook_',
      s3Prefix: 'plugins/playbook/',
    };

    const dummyPlugin = (manifest: PluginManifest): SidelineBackendPlugin => ({
      manifest,
      async handleRequest() {
        return { status: 200, body: { ok: true } };
      },
    });
    await pluginHost.registriereBackendPlugin(dummyPlugin(videoManifest));
    await pluginHost.registriereBackendPlugin(dummyPlugin(playbookManifest));
    await repo.setzeTeamModulAktiv('team-stallions-seniors', 'playbook', true);

    const { app } = erstelleCoreApp({
      db,
      config,
      pluginHost,
      s3Broker,
      s3Cleanup,
      pluginInstaller,
    });
    coreServer = http.createServer(app);
    await new Promise<void>((resolve) => {
      coreServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = coreServer.address();
    assert.ok(addr && typeof addr === 'object');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Einmalig als Sysadmin & Coach einloggen
    const loginSys = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ kennung: 'sysadmin', passwort: DEMO_STANDARD_PASSWORT }),
    });
    sysadminCookie = extrahiereCookieHeader(loginSys.headers.get('set-cookie'));

    const loginCoach = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ kennung: 't.richter', passwort: DEMO_STANDARD_PASSWORT }),
    });
    coachCookie = extrahiereCookieHeader(loginCoach.headers.get('set-cookie'));
  });

  after(async () => {
    await new Promise<void>((resolve) => coreServer.close(() => resolve()));
    await new Promise<void>((resolve) => mockGitHubServer.close(() => resolve()));
    await db.close();
    await fs.rm(tmpDataDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('vergleicht SemVer-Versionen inklusive Prerelease und v-Präfix korrekt', () => {
    assert.equal(vergleicheSemVer('0.1.0', '0.2.0'), -1);
    assert.equal(vergleicheSemVer('v0.2.0', '0.2.0'), 0);
    assert.equal(vergleicheSemVer('1.0.0-alpha.1', '1.0.0'), -1);
    assert.equal(vergleicheSemVer('1.2.0', '1.1.9'), 1);
  });

  it('validiert plugin.manifest.json streng (reservierte IDs, dbPrefix, SDK-Kompatibilität)', () => {
    assert.throws(
      () =>
        validierePluginManifest(
          { id: 'sysadmin', name: 'Bad', version: '1.0.0', sdkVersion: '1.0', dbPrefix: 'mod_sys_' },
          '1.0'
        ),
      (err: unknown) => err instanceof PluginInstallerFehler && err.status === 400
    );

    assert.throws(
      () =>
        validierePluginManifest(
          { id: 'valid-plugin', name: 'BadPrefix', version: '1.0.0', sdkVersion: '1.0', dbPrefix: 'wrong_' },
          '1.0'
        ),
      (err: unknown) => err instanceof PluginInstallerFehler && err.status === 400
    );

    assert.throws(
      () =>
        validierePluginManifest(
          { id: 'valid-plugin', name: 'NewSDK', version: '1.0.0', sdkVersion: '2.0', dbPrefix: 'mod_valid_' },
          '1.0'
        ),
      (err: unknown) => err instanceof PluginInstallerFehler && err.status === 409
    );
  });

  it('blockiert Path-Traversal (Zip-Slip) und Symlinks beim Entpacken von .tar.gz-Archiven', () => {
    const boesartigesTar = erzeugeTarGzBuffer({
      '../ausbruch.txt': 'evil',
    });
    assert.throws(
      () => entpackeTarGzSicher(boesartigesTar),
      (err: unknown) => err instanceof PluginInstallerFehler && err.status === 400
    );

    const symlinkTar = erzeugeTarMitSymlink();
    assert.throws(
      () => entpackeTarGzSicher(symlinkTar),
      (err: unknown) => err instanceof PluginInstallerFehler && err.status === 400
    );
  });

  it('installiert verifiziertes GitHub-Release-Bundle (SHA-256 + Schema-Migration) und lehnt manipulated SHA / falsches SDK ab', async () => {
    // 1.manipuliertes SHA-256 ablehnen
    aktuellesShaSollFehlschlagen = true;
    const shaFail = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-release`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ repoUrl: 'https://github.com/sidelineos/scouting-demo' }),
    });
    assert.equal(shaFail.status, 400);
    aktuellesShaSollFehlschlagen = false;

    // 2. Inkompatibles SDK ablehnen
    aktuellesSdkSollInkompatibelSein = true;
    const sdkFail = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-release`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ repoUrl: 'https://github.com/sidelineos/scouting-demo' }),
    });
    assert.equal(sdkFail.status, 409);
    aktuellesSdkSollInkompatibelSein = false;

    // 3. Reguläre Installation v0.1.0 inkl. Plugin-DB-Migration
    const okRes = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-release`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ repoUrl: 'https://github.com/sidelineos/scouting-demo' }),
    });
    assert.equal(okRes.status, 200);
    const body = (await okRes.json()) as {
      manifest: PluginManifest;
      migrationenAusgefuehrt: number;
    };
    assert.equal(body.manifest.id, 'scouting-demo');
    assert.equal(body.manifest.version, '0.1.0');
    assert.equal(body.migrationenAusgefuehrt, 1);

    // Isolierte Plugin-Tabelle wurde im Schema plugin_scouting_demo angelegt
    const schemaCheck = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'plugin_scouting_demo' AND table_name = 'mod_scouting_demo_items'
       ) AS exists`
    );
    assert.equal(schemaCheck.rows[0]?.exists, true);
  });

  it('erkennt Core- & Plugin-Updates, aktualisiert auf v0.2.0 und ermöglicht Rollback auf v0.1.0', async () => {
    aktivePluginReleaseVersion = '0.2.0';
    coreNeuesteVersion = '0.3.0';

    const updateRes = await fetch(`${baseUrl}/api/v1/sysadmin/updates?refresh=true`, {
      headers: { Cookie: sysadminCookie },
    });
    assert.equal(updateRes.status, 200);
    const updateBody = (await updateRes.json()) as {
      coreUpdate: { updateVerfuegbar: boolean; aktuell: string; verfuegbar: string };
      pluginUpdates: Array<{ pluginId: string; updateVerfuegbar: boolean; verfuegbar: string }>;
      anzahlVerfuegbar: number;
    };
    assert.equal(updateBody.coreUpdate.updateVerfuegbar, true);
    assert.equal(updateBody.coreUpdate.aktuell, '0.1.0');
    assert.equal(updateBody.coreUpdate.verfuegbar, '0.3.0');
    const scoutingUpdate = updateBody.pluginUpdates.find((p) => p.pluginId === 'scouting-demo');
    assert.ok(scoutingUpdate);
    assert.equal(scoutingUpdate.updateVerfuegbar, true);
    assert.equal(scoutingUpdate.verfuegbar, '0.2.0');
    assert.ok(updateBody.anzahlVerfuegbar >= 2);

    // Update installieren
    const upgRes = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-release`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ repoUrl: 'https://github.com/sidelineos/scouting-demo' }),
    });
    assert.equal(upgRes.status, 200);

    // Rollback auf 0.1.0 durchführen
    const rbRes = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/scouting-demo/rollback`, {
      method: 'POST',
      headers: { Cookie: sysadminCookie, 'X-Requested-With': 'XMLHttpRequest' },
    });
    assert.equal(rbRes.status, 200);
    const rbBody = (await rbRes.json()) as { version: string; manifest: PluginManifest };
    assert.equal(rbBody.version, '0.1.0');
    assert.equal(rbBody.manifest.version, '0.1.0');
  });

  it('unterstützt Offline-.tar.gz-Upload und saubere Deinstallation', async () => {
    const offlineBundle = erstelleTestBundle({
      id: 'offline-stats',
      name: 'Offline Stats',
      version: '1.0.0',
      mitMigration: true,
    });

    const uploadRes = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-upload`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        contentBase64: offlineBundle.tarGz.toString('base64'),
        expectedSha256: offlineBundle.sha256,
      }),
    });
    assert.equal(uploadRes.status, 200);
    const uploadJson = (await uploadRes.json()) as { manifest: PluginManifest; sha256: string };
    assert.equal(uploadJson.manifest.id, 'offline-stats');
    assert.equal(uploadJson.sha256, offlineBundle.sha256);

    const delRes = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/offline-stats`, {
      method: 'DELETE',
      headers: { Cookie: sysadminCookie, 'X-Requested-With': 'XMLHttpRequest' },
    });
    assert.equal(delRes.status, 200);
  });

  it('erlaubt Dev-Git-Clone nur im Dev-Modus, validiert Branch-Namen und blockiert ihn in Production mit 403', async () => {
    // 1. Flag-Injection im Branch blockieren
    const badBranch = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-dev-git`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        repoUrl: 'https://github.com/verein/sidelineos-plugin-dev-analytics',
        branch: '--upload-pack=whoami',
      }),
    });
    assert.equal(badBranch.status, 400);

    // 2. Erfolgreicher Dev-Clone & Build
    const okDev = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-dev-git`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        repoUrl: 'https://github.com/verein/sidelineos-plugin-dev-analytics',
        branch: 'feature/metrics',
      }),
    });
    assert.equal(okDev.status, 200);
    const okDevBody = (await okDev.json()) as { manifest: PluginManifest; branch: string };
    assert.equal(okDevBody.manifest.id, 'dev-analytics');
    assert.equal(okDevBody.branch, 'feature/metrics');

    const status = await repo.findePluginStatus('dev-analytics');
    assert.equal(status?.installMode, 'DEV_GIT');
    assert.equal(status?.releaseTag, 'dev:feature/metrics');

    // 3. In Production strikt 403 erzwingen
    const prodConfig = loadCoreConfig({
      NODE_ENV: 'production',
      APP_URL: 'https://prod.example.org',
      SESSION_SECRET: 'prod-secret-mindestens-32-zeichen-lang-xyz',
      DATABASE_URL: 'postgresql://unused',
      PLUGIN_DATA_DIR: tmpDataDir,
      DEV_ALLOW_GIT_INSTALL: 'true', // muss in production trotzdem false bleiben
    });
    const prodInstaller = new PluginInstallerService(db, repo, prodConfig);
    await assert.rejects(
      () =>
        prodInstaller.installiereDevAusGit({
          repoUrl: 'https://github.com/verein/sidelineos-plugin-dev-analytics',
        }),
      (err: unknown) => err instanceof PluginInstallerFehler && err.status === 403
    );
  });

  it('verwaltet S3-Cleanup-Queue mit Permission-Prüfung, anonymisierter Sysadmin-Statistik und Schonfrist-Löschung', async () => {
    // 1. Plugin ohne s3:cleanup-queue erhält 403
    const denied = await fetch(
      `${baseUrl}/api/v1/plugins/playbook/teams/team-stallions-seniors/_s3/cleanup-queue`,
      {
        method: 'POST',
        headers: {
          Cookie: coachCookie,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ objectPaths: ['old/file.json'] }),
      }
    );
    assert.equal(denied.status, 403);

    // 2. Plugin mit s3:cleanup-queue merkt 2 Objekte vor
    const queued = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/team-stallions-seniors/_s3/cleanup-queue`,
      {
        method: 'POST',
        headers: {
          Cookie: coachCookie,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          objectPaths: ['games/secret-playbook-tape.mp4', 'games/cut-2.mp4'],
          reason: 'video-deleted',
        }),
      }
    );
    assert.equal(queued.status, 200);
    const queuedJson = (await queued.json()) as { queued: number };
    assert.equal(queuedJson.queued, 2);

    // 3. Anonymisierte Statistik darf weder Dateinamen noch Team-ID enthalten
    const statRes = await fetch(`${baseUrl}/api/v1/sysadmin/s3/cleanup`, {
      headers: { Cookie: sysadminCookie },
    });
    assert.equal(statRes.status, 200);
    const statText = await statRes.text();
    assert.equal(statText.includes('secret-playbook-tape'), false);
    assert.equal(statText.includes('team-stallions-seniors'), false);
    const statJson = JSON.parse(statText) as {
      statistik: { wartendeObjekte: number; faelligeObjekte: number; schonfristTage: number };
    };
    assert.equal(statJson.statistik.wartendeObjekte, 2);
    assert.equal(statJson.statistik.faelligeObjekte, 0);

    // 4. Ein Objekt überfällig machen -> nur fälliges Objekt wird aus S3 entfernt
    await db.query(
      `UPDATE core.s3_cleanup_queue
       SET delete_after = NOW() - INTERVAL '1 hour'
       WHERE s3_key LIKE '%secret-playbook-tape.mp4'`
    );

    geloeschteS3Keys = [];
    const runRes = await fetch(`${baseUrl}/api/v1/sysadmin/s3/cleanup/run`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ auchVorfristig: false }),
    });
    assert.equal(runRes.status, 200);
    const runJson = (await runRes.json()) as {
      geloescht: number;
      statistik: { wartendeObjekte: number; faelligeObjekte: number };
    };
    assert.equal(runJson.geloescht, 1);
    assert.equal(runJson.statistik.wartendeObjekte, 1);
    assert.equal(geloeschteS3Keys.length, 1);
    assert.ok(geloeschteS3Keys[0]?.endsWith('secret-playbook-tape.mp4'));
  });
});
