import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { DEMO_STANDARD_PASSWORT } from '../../src/core/authService.ts';
import {
  baueAppAnsichtPfad,
  baueRoutePfad,
  parseBrowserPfad,
} from '../../src/core/navigation.ts';
import type { PluginManifest, SidelineBackendPlugin, SpielerUnit } from '../../src/sdk/plugin.ts';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig, type CoreServerConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import { CoreRepository } from '../../src/server/db/coreRepository.ts';
import { PluginBackendHost } from '../../src/server/plugins/backendHost.ts';
import {
  PluginInstallerService,
  erzeugeTarGzBuffer,
} from '../../src/server/services/pluginInstaller.ts';

function extrahiereCookieHeader(setCookie: string | null): string {
  if (!setCookie) return '';
  return setCookie.split(';')[0] ?? '';
}

function erstelleUploadBundle(params: {
  id: string;
  version: string;
  serverJs: string;
  clientJs?: string;
  permissions?: PluginManifest['permissions'];
}) {
  const manifest: PluginManifest = {
    id: params.id,
    name: `Test ${params.id}`,
    kurzbeschreibung: 'Test-Plugin für Issues #17/#18',
    version: params.version,
    sdkVersion: '1.0',
    autor: 'SidelineOS Test',
    repositoryUrl: `https://github.com/example/${params.id}`,
    icon: 'film',
    status: 'AKTIV',
    standardAktiviert: false,
    permissions: params.permissions ?? ['team:read', 'db:plugin-tables'],
    dbPrefix: `mod_${params.id.replace(/-/g, '_')}_`,
    s3Prefix: `plugins/${params.id}/`,
    settingsAnker: {},
  };

  const clientJs =
    params.clientJs ??
    `
const manifest = ${JSON.stringify(manifest)};
export default {
  manifest,
  defaultTab: 'overview',
  getTabs: () => [{ id: 'overview', label: 'Übersicht' }],
  renderMainView: () => 'v:${params.version}',
};
`.trim();

  return {
    manifest,
    tarGz: erzeugeTarGzBuffer({
      'plugin.manifest.json': JSON.stringify(manifest, null, 2),
      'dist/server.js': params.serverJs,
      'dist/client.js': clientJs,
      'dist/client.css': `.plugin-${params.id} { color: #F59E0B; }\n`,
    }),
  };
}

describe('Issue #16: Sprechende URL-Navigation & Browser-History-Parser', () => {
  it('parst und serialisiert alle Core-Bereiche, Modul-Tabs und Public-Routen verlustfrei', () => {
    const faelle: Array<{
      pfad: string;
      erwarteterRueckpfad: string;
      routeArt: 'app' | 'login' | 'invite' | 'share';
      bereich: string;
      pluginId: string | null;
      pluginTab: string;
    }> = [
      {
        pfad: '/',
        erwarteterRueckpfad: '/',
        routeArt: 'app',
        bereich: 'hub',
        pluginId: null,
        pluginTab: '',
      },
      {
        pfad: '/settings',
        erwarteterRueckpfad: '/settings',
        routeArt: 'app',
        bereich: 'settings-hub',
        pluginId: null,
        pluginTab: '',
      },
      {
        pfad: '/settings/account/',
        erwarteterRueckpfad: '/settings/account',
        routeArt: 'app',
        bereich: 'settings',
        pluginId: null,
        pluginTab: '',
      },
      {
        pfad: '/settings/team',
        erwarteterRueckpfad: '/settings/team',
        routeArt: 'app',
        bereich: 'team-settings',
        pluginId: null,
        pluginTab: '',
      },
      {
        pfad: '/sysadmin',
        erwarteterRueckpfad: '/sysadmin',
        routeArt: 'app',
        bereich: 'sysadmin',
        pluginId: null,
        pluginTab: '',
      },
      {
        pfad: '/modules/video-analysis',
        erwarteterRueckpfad: '/modules/video-analysis',
        routeArt: 'app',
        bereich: 'modul',
        pluginId: 'video-analysis',
        pluginTab: '',
      },
      {
        pfad: '/modules/video-analysis/playlists?sort=asc',
        erwarteterRueckpfad: '/modules/video-analysis/playlists',
        routeArt: 'app',
        bereich: 'modul',
        pluginId: 'video-analysis',
        pluginTab: 'playlists',
      },
      {
        pfad: '/login',
        erwarteterRueckpfad: '/login',
        routeArt: 'login',
        bereich: 'hub',
        pluginId: null,
        pluginTab: '',
      },
      {
        pfad: '/invite/tok-123',
        erwarteterRueckpfad: '/invite/tok-123',
        routeArt: 'invite',
        bereich: 'hub',
        pluginId: null,
        pluginTab: '',
      },
      {
        pfad: '/share/shr-999',
        erwarteterRueckpfad: '/share/shr-999',
        routeArt: 'share',
        bereich: 'hub',
        pluginId: null,
        pluginTab: '',
      },
    ];

    for (const f of faelle) {
      const geparst = parseBrowserPfad(f.pfad);
      assert.equal(geparst.istBekannterAppPfad, true, f.pfad);
      assert.equal(geparst.routeModus.art, f.routeArt, f.pfad);
      assert.equal(geparst.ansicht.bereich, f.bereich, f.pfad);
      assert.equal(geparst.ansicht.pluginId, f.pluginId, f.pfad);
      assert.equal(geparst.ansicht.pluginTab, f.pluginTab, f.pfad);
      assert.equal(baueRoutePfad(geparst.routeModus, geparst.ansicht), f.erwarteterRueckpfad);
    }
  });

  it('markiert unbekannte Pfade sauber als Fallback auf Hub', () => {
    const unbekannt = parseBrowserPfad('/nicht-existent/foo/bar');
    assert.equal(unbekannt.istBekannterAppPfad, false);
    assert.equal(unbekannt.routeModus.art, 'app');
    assert.equal(unbekannt.ansicht.bereich, 'hub');
    assert.equal(baueAppAnsichtPfad(unbekannt.ansicht), '/');
  });
});

describe('Issues #17 & #18: Dev-Git-Reload, Cache-Control, userUnits & Public-Share S3 Read-Scope', () => {
  let tmpDataDir: string;
  let config: CoreServerConfig;
  let db: CoreDatabaseClient;
  let repo: CoreRepository;
  let pluginHost: PluginBackendHost;
  let coreServer: http.Server;
  let baseUrl: string;
  let sysadminCookie: string;
  let coachCookie: string;
  let coachTeamId: string;
  let zweitesTeamId: string;

  before(async () => {
    tmpDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sideline-issues-1718-'));
    config = loadCoreConfig({
      NODE_ENV: 'test',
      ALLOW_IN_MEMORY_DB: 'true',
      SEED_DEMO_DATA: 'true',
      DEV_ALLOW_GIT_INSTALL: 'true',
      PLUGIN_DATA_DIR: tmpDataDir,
      SESSION_SECRET: 'test-session-secret-issues-1718-minimum-32-chars',
      SETTINGS_ENCRYPTION_KEY: 'test-encryption-key-issues-1718-minimum-32-chars',
    });

    db = await erstelleDatenbankClient(config);
    repo = new CoreRepository(db);
    await bootstrapCoreInstance(db, config);

    const core = erstelleCoreApp({ db, config });
    const app = core.app;
    const s3Broker = core.s3Broker;
    pluginHost = core.pluginHost;

    // S3-Broker mit Test-Zugangsdaten konfigurieren (offline presigning funktioniert ohne Netzwerk)
    await s3Broker.speichereKonfig({
      endpoint: 'https://s3.test.local',
      region: 'eu-central-1',
      bucket: 'sideline-test-bucket',
      accessKey: 'test-access-key',
      secretKey: 'test-secret-key-123456',
      forcePathStyle: true,
    });

    // Zwei Teams prüfen/anlegen, damit Team-Isolation bei Public-Share-S3 getestet werden kann
    const teams = await repo.listeTeams();
    coachTeamId = teams[0]!.id;
    const zweitesTeam =
      teams[1] ??
      (await repo.erstelleTeam({
        id: 'team-isolated-test',
        name: 'Isolated Falcons',
        kurzname: 'FAL',
        aktiveSaison: '2026',
        saisons: ['2026'],
        primaerFarbe: '#22C55E',
        aktivierteModule: [],
        customProfilFelder: [],
      }));
    zweitesTeamId = zweitesTeam.id;

    // Plugin mit s3:team-rw + share:public-links registrieren (für Issue #18)
    const videoSharePlugin: SidelineBackendPlugin = {
      manifest: {
        id: 'test-video-share',
        name: 'Test Video Share',
        kurzbeschreibung: 'Testet userUnits und publicCtx S3-Signierung',
        version: '1.0.0',
        sdkVersion: '1.0',
        autor: 'Test',
        repositoryUrl: 'https://github.com/example/test-video-share',
        icon: 'film',
        status: 'AKTIV',
        standardAktiviert: true,
        permissions: ['team:read', 's3:team-rw', 'share:public-links', 'db:plugin-tables'],
        dbPrefix: 'mod_test_video_share_',
        s3Prefix: 'plugins/test-video-share/',
        settingsAnker: {},
      },
      async handleRequest(req, ctx) {
        if (req.method === 'GET' && req.path === '/whoami') {
          return {
            status: 200,
            body: {
              userUuid: ctx.user.uuid,
              teamRolle: ctx.teamRolle,
              userUnits: ctx.userUnits,
            },
          };
        }
        return { status: 404, body: { fehler: 'Unbekannt' } };
      },
      async handlePublicRequest(req, _db, publicCtx) {
        if (
          !publicCtx ||
          !publicCtx.createTeamS3ReadScope ||
          !publicCtx.getSignedDownloadUrlForTeam
        ) {
          return { status: 500, body: { fehler: 'publicCtx fehlt' } };
        }
        const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : coachTeamId;
        const objectPath =
          typeof req.query.objectPath === 'string' ? req.query.objectPath : '2026/game1.mp4';
        const mode = typeof req.query.mode === 'string' ? req.query.mode : 'scope';
        const expires = typeof req.query.expires === 'string' ? Number(req.query.expires) : 999999;

        try {
          if (mode === 'scope') {
            const scope = await publicCtx.createTeamS3ReadScope(teamId);
            const signed = await scope.getSignedDownloadUrl({
              objectPath,
              expiresInSeconds: expires,
            });
            return { status: 200, body: { mode, prefix: scope.prefix, signed } };
          }
          if (mode === 'object') {
            const signed = await publicCtx.getSignedDownloadUrlForTeam({
              teamId,
              objectPath,
              expiresInSeconds: expires,
            });
            return { status: 200, body: { mode, signed } };
          }
          const signed = await publicCtx.getSignedDownloadUrlForTeam(teamId, objectPath, expires);
          return { status: 200, body: { mode: 'positional', signed } };
        } catch (err) {
          return {
            status: 403,
            body: { fehler: err instanceof Error ? err.message : String(err) },
          };
        }
      },
    };

    // Plugin mit share:public-links OHNE s3:team-rw (darf KEIN publicCtx-S3 bekommen!)
    const publicNoS3Plugin: SidelineBackendPlugin = {
      manifest: {
        id: 'test-public-nos3',
        name: 'Test Public No S3',
        kurzbeschreibung: 'Public Share ohne S3-Permission',
        version: '1.0.0',
        sdkVersion: '1.0',
        autor: 'Test',
        repositoryUrl: 'https://github.com/example/test-public-nos3',
        icon: 'puzzle',
        status: 'AKTIV',
        standardAktiviert: true,
        permissions: ['share:public-links'],
        dbPrefix: 'mod_test_public_nos3_',
        settingsAnker: {},
      },
      async handlePublicRequest(_req, _db, publicCtx) {
        return {
          status: 200,
          body: {
            hasCreateScope: typeof publicCtx?.createTeamS3ReadScope === 'function',
            hasSignedUrlFn: typeof publicCtx?.getSignedDownloadUrlForTeam === 'function',
          },
        };
      },
    };

    await repo.speicherePluginInstallation({
      manifest: videoSharePlugin.manifest,
      source: 'CATALOG',
      releaseTag: 'v1.0.0',
      enabledGlobally: true,
      installMode: 'CATALOG',
    });
    await repo.speicherePluginInstallation({
      manifest: publicNoS3Plugin.manifest,
      source: 'CATALOG',
      releaseTag: 'v1.0.0',
      enabledGlobally: true,
      installMode: 'CATALOG',
    });
    await repo.setzeTeamModulAktiv(coachTeamId, videoSharePlugin.manifest.id, true);
    await repo.setzeTeamModulAktiv(zweitesTeamId, videoSharePlugin.manifest.id, false);
    await pluginHost.registriereBackendPlugin(videoSharePlugin);
    await pluginHost.registriereBackendPlugin(publicNoS3Plugin);

    coreServer = http.createServer(app);
    await new Promise<void>((resolve) => coreServer.listen(0, '127.0.0.1', resolve));
    const addr = coreServer.address();
    assert.ok(addr && typeof addr === 'object');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Sysadmin + Coach anmelden
    const sysRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ kennung: 'sysadmin', passwort: DEMO_STANDARD_PASSWORT }),
    });
    assert.equal(sysRes.status, 200);
    sysadminCookie = extrahiereCookieHeader(sysRes.headers.get('set-cookie'));

    const coachRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ kennung: 't.richter', passwort: DEMO_STANDARD_PASSWORT }),
    });
    assert.equal(coachRes.status, 200);
    coachCookie = extrahiereCookieHeader(coachRes.headers.get('set-cookie'));
  });

  after(async () => {
    await new Promise<void>((resolve) => coreServer.close(() => resolve()));
    await db.close();
    await fs.rm(tmpDataDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('Issue #18: übergibt userUnits exakt aus der Team-Mitgliedschaft an geschützte Backend-Plugins', async () => {
    const coachBenutzer = await repo.findeBenutzerMitHashNachKennung('t.richter');
    assert.ok(coachBenutzer);
    const mitgliedschaften = await repo.listeMitgliedschaften(coachTeamId);
    const coachMitglied = mitgliedschaften.find((m) => m.userUuid === coachBenutzer.konto.uuid);
    assert.ok(coachMitglied);
    const erwarteteUnits: SpielerUnit[] = ['DEFENSE', 'SPECIAL_TEAMS'];
    await repo.speichereMitgliedschaft({ ...coachMitglied, units: erwarteteUnits });

    const res = await fetch(
      `${baseUrl}/api/v1/plugins/test-video-share/teams/${encodeURIComponent(coachTeamId)}/whoami`,
      { headers: { Cookie: coachCookie } }
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as { userUnits: SpielerUnit[] };
    assert.deepEqual(json.userUnits, erwarteteUnits);
  });

  it('Issue #18: bietet publicCtx mit createTeamS3ReadScope & beiden getSignedDownloadUrlForTeam-Signaturen inkl. Security-Guards', async () => {
    // 1. createTeamS3ReadScope (SidelineOS-video Standard) + TTL-Cap auf 3600s
    const scopeRes = await fetch(
      `${baseUrl}/api/v1/public/plugins/test-video-share/stream?teamId=${encodeURIComponent(
        coachTeamId
      )}&mode=scope&objectPath=2026/film.mp4&expires=999999`
    );
    assert.equal(scopeRes.status, 200);
    const scopeJson = (await scopeRes.json()) as {
      prefix: string;
      signed: { url: string; key: string; expiresIn: number };
    };
    assert.equal(scopeJson.prefix, `teams/${coachTeamId}/plugins/test-video-share/`);
    assert.equal(scopeJson.signed.expiresIn, 3600);
    assert.match(scopeJson.signed.url, /X-Amz-Expires=3600/);
    assert.match(
      scopeJson.signed.url,
      new RegExp(`teams/${coachTeamId}/plugins/test-video-share/2026/film\\.mp4`)
    );

    // 2. getSignedDownloadUrlForTeam Objekt-Signatur (SidelineOS-video Fallback)
    const objRes = await fetch(
      `${baseUrl}/api/v1/public/plugins/test-video-share/stream?teamId=${encodeURIComponent(
        coachTeamId
      )}&mode=object&objectPath=2026/clip.mp4&expires=600`
    );
    assert.equal(objRes.status, 200);
    const objJson = (await objRes.json()) as {
      signed: { url: string; key: string; expiresIn: number };
    };
    assert.equal(objJson.signed.expiresIn, 600);
    assert.match(objJson.signed.url, /X-Amz-Expires=600/);

    // 3. getSignedDownloadUrlForTeam Positionale Signatur (Issue #18 Spezifikation)
    const posRes = await fetch(
      `${baseUrl}/api/v1/public/plugins/test-video-share/stream?teamId=${encodeURIComponent(
        coachTeamId
      )}&mode=positional&objectPath=2026/clip2.mp4&expires=300`
    );
    assert.equal(posRes.status, 200);
    const posJson = (await posRes.json()) as {
      signed: { url: string; key: string; expiresIn: number };
    };
    assert.equal(posJson.signed.expiresIn, 300);
    assert.match(posJson.signed.url, /X-Amz-Expires=300/);

    // 4. Security: Path Traversal blockieren
    const travRes = await fetch(
      `${baseUrl}/api/v1/public/plugins/test-video-share/stream?teamId=${encodeURIComponent(
        coachTeamId
      )}&mode=scope&objectPath=../andere-daten/secret.mp4`
    );
    assert.equal(travRes.status, 403);

    // 5. Security: Team ohne aktiviertes Plugin blockieren
    const wrongTeamRes = await fetch(
      `${baseUrl}/api/v1/public/plugins/test-video-share/stream?teamId=${encodeURIComponent(
        zweitesTeamId
      )}&mode=scope&objectPath=2026/film.mp4`
    );
    assert.equal(wrongTeamRes.status, 403);

    // 6. Security: Plugin ohne s3:team-rw erhält KEINE S3-Signierfunktionen in publicCtx
    const noS3Res = await fetch(`${baseUrl}/api/v1/public/plugins/test-public-nos3/check`);
    assert.equal(noS3Res.status, 200);
    const noS3Json = (await noS3Res.json()) as {
      hasCreateScope: boolean;
      hasSignedUrlFn: boolean;
    };
    assert.equal(noS3Json.hasCreateScope, false);
    assert.equal(noS3Json.hasSignedUrlFn, false);
  });

  it('Issue #17: setzt strikte Cache-Control-Header und liefert frischen cacheBuster nach Plugin-Update', async () => {
    const v1 = erstelleUploadBundle({
      id: 'hotreload-demo',
      version: '1.0.0',
      serverJs: `
export default {
  manifest: { id: 'hotreload-demo', name: 'Hot', kurzbeschreibung: '', version: '1.0.0', sdkVersion: '1.0', autor: 'T', repositoryUrl: '', icon: 'film', status: 'AKTIV', standardAktiviert: false, permissions: ['team:read'], dbPrefix: 'mod_hotreload_demo_', settingsAnker: {} },
  async handleRequest() { return { status: 200, body: { version: 'v1' } }; }
};
`.trim(),
    });

    const up1 = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: sysadminCookie,
      },
      body: JSON.stringify({ contentBase64: v1.tarGz.toString('base64') }),
    });
    assert.equal(up1.status, 200);
    await repo.setzeTeamModulAktiv(coachTeamId, 'hotreload-demo', true);

    const manifestRes1 = await fetch(`${baseUrl}/api/v1/plugins/runtime/manifest`, {
      headers: { Cookie: sysadminCookie },
    });
    assert.equal(manifestRes1.status, 200);
    assert.match(manifestRes1.headers.get('cache-control') ?? '', /no-store/);
    const manifestJson1 = (await manifestRes1.json()) as {
      bundles: Array<{ pluginId: string; clientUrl: string; cacheBuster?: string }>;
    };
    const eintrag1 = manifestJson1.bundles.find((b) => b.pluginId === 'hotreload-demo');
    assert.ok(eintrag1?.cacheBuster);

    const themesRes = await fetch(`${baseUrl}/api/v1/plugins/runtime/themes`);
    assert.equal(themesRes.status, 200);
    assert.match(themesRes.headers.get('cache-control') ?? '', /no-store/);

    const bundleRes = await fetch(`${baseUrl}${eintrag1!.clientUrl}`);
    assert.equal(bundleRes.status, 200);
    assert.match(bundleRes.headers.get('cache-control') ?? '', /no-cache/);

    // Gateway liefert v1
    const gw1 = await fetch(
      `${baseUrl}/api/v1/plugins/hotreload-demo/teams/${encodeURIComponent(coachTeamId)}/info`,
      { headers: { Cookie: coachCookie } }
    );
    assert.equal(gw1.status, 200);
    assert.equal(((await gw1.json()) as { version: string }).version, 'v1');

    // Defektes Backend-Bundle hochladen -> HTTP 422, lastError gespeichert, alter v1-Stand entladen!
    const broken = erstelleUploadBundle({
      id: 'hotreload-demo',
      version: '1.1.0',
      serverJs: `throw new Error('Syntax/Boot-Fehler im neuen Backend-Bundle');`,
    });

    const upBroken = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: sysadminCookie,
      },
      body: JSON.stringify({ contentBase64: broken.tarGz.toString('base64') }),
    });
    assert.equal(upBroken.status, 422);
    const brokenBody = (await upBroken.json()) as { fehler: string };
    assert.match(brokenBody.fehler, /Backend-Live-Reload ist fehlgeschlagen/i);

    // Alter v1-Stand darf NICHT still weiterlaufen (Backend-Handler ist entladen -> HTTP 501)
    const gwAfterBroken = await fetch(
      `${baseUrl}/api/v1/plugins/hotreload-demo/teams/${encodeURIComponent(coachTeamId)}/info`,
      { headers: { Cookie: coachCookie } }
    );
    assert.equal(gwAfterBroken.status, 501);

    // lastError ist in DB & Overview sichtbar
    const statusBroken = await repo.findePluginStatus('hotreload-demo');
    assert.ok(statusBroken?.lastError);

    // Reparierte v2 hochladen -> HTTP 200, lastError gelöscht, neuer Stand sofort aktiv, cacheBuster neu
    await new Promise((r) => setTimeout(r, 15));
    const v2 = erstelleUploadBundle({
      id: 'hotreload-demo',
      version: '1.2.0',
      serverJs: `
export default {
  manifest: { id: 'hotreload-demo', name: 'Hot', kurzbeschreibung: '', version: '1.2.0', sdkVersion: '1.0', autor: 'T', repositoryUrl: '', icon: 'film', status: 'AKTIV', standardAktiviert: false, permissions: ['team:read'], dbPrefix: 'mod_hotreload_demo_', settingsAnker: {} },
  async handleRequest() { return { status: 200, body: { version: 'v2' } }; }
};
`.trim(),
    });
    const up2 = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: sysadminCookie,
      },
      body: JSON.stringify({ contentBase64: v2.tarGz.toString('base64') }),
    });
    assert.equal(up2.status, 200);

    const statusV2 = await repo.findePluginStatus('hotreload-demo');
    assert.equal(statusV2?.lastError, null);

    const gw2 = await fetch(
      `${baseUrl}/api/v1/plugins/hotreload-demo/teams/${encodeURIComponent(coachTeamId)}/info`,
      { headers: { Cookie: coachCookie } }
    );
    assert.equal(gw2.status, 200);
    assert.equal(((await gw2.json()) as { version: string }).version, 'v2');

    const manifestRes2 = await fetch(`${baseUrl}/api/v1/plugins/runtime/manifest`, {
      headers: { Cookie: sysadminCookie },
    });
    const manifestJson2 = (await manifestRes2.json()) as {
      bundles: Array<{ pluginId: string; version: string; cacheBuster?: string }>;
    };
    const eintrag2 = manifestJson2.bundles.find((b) => b.pluginId === 'hotreload-demo');
    assert.equal(eintrag2?.version, '1.2.0');
    assert.ok(eintrag2?.cacheBuster);
    assert.notEqual(eintrag2?.cacheBuster, eintrag1?.cacheBuster);
  });

  it('Issue #17: installiereDevAusGit behält die tatsächlich installierte Fork-Repo-URL bei', async () => {
    const forkUrl = 'https://github.com/mein-fork/custom-dev-plugin';
    const installer = new PluginInstallerService(db, repo, config, {
      commandRunner: async (cmd, args, opts) => {
        if (cmd === 'git' && args[0] === 'clone') {
          const zielDir = args[args.length - 1]!;
          await fs.mkdir(path.join(zielDir, 'dist'), { recursive: true });
          await fs.writeFile(
            path.join(zielDir, 'plugin.manifest.json'),
            JSON.stringify({
              id: 'fork-dev-demo',
              name: 'Fork Dev Demo',
              kurzbeschreibung: 'Testet Repo-URL-Erhalt bei Forks',
              version: '0.1.0',
              sdkVersion: '1.0',
              autor: 'Upstream',
              repositoryUrl: 'https://github.com/upstream/original-repo',
              icon: 'puzzle',
              status: 'AKTIV',
              standardAktiviert: false,
              permissions: ['team:read'],
              dbPrefix: 'mod_fork_dev_demo_',
              settingsAnker: {},
            }),
            'utf8'
          );
          await fs.writeFile(
            path.join(zielDir, 'dist', 'client.js'),
            'export default { manifest: { id: "fork-dev-demo" }, renderMainView: () => "ok" };',
            'utf8'
          );
          return { stdout: '', stderr: '' };
        }
        if (cmd === 'git' && args[0] === 'symbolic-ref') {
          return { stdout: 'dev\n', stderr: '' };
        }
        if (cmd === 'git' && args[0] === 'rev-parse') {
          return { stdout: 'abc1234\n', stderr: '' };
        }
        if (cmd === 'npm' && opts.cwd) {
          return { stdout: 'ok', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    });

    const ergebnis = await installer.installiereDevAusGit({ repoUrl: forkUrl, branch: 'dev' });
    assert.equal(ergebnis.manifest.repositoryUrl, forkUrl);
    assert.equal(ergebnis.manifest.version, 'dev-abc1234');

    const gespeichert = await repo.findePluginStatus('fork-dev-demo');
    assert.equal(gespeichert?.manifest.repositoryUrl, forkUrl);
    assert.ok(gespeichert?.installedAt);
  });
});
