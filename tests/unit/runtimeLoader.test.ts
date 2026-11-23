import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEMO_STANDARD_PASSWORT } from '../../src/core/authService.ts';
import type { PluginManifest } from '../../src/sdk/plugin.ts';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig, type CoreServerConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import type { CoreRepository } from '../../src/server/db/coreRepository.ts';
import type { PluginRuntimeLoader } from '../../src/server/plugins/runtimeLoader.ts';
import { erzeugeTarGzBuffer } from '../../src/server/services/pluginInstaller.ts';

const execFileAsync = promisify(execFile);

function extrahiereCookieHeader(setCookie: string | null): string {
  if (!setCookie) return '';
  return setCookie.split(';')[0] ?? '';
}

function erstelleRuntimeTestBundle(params: {
  id: string;
  name: string;
  version: string;
  mitPublicShare?: boolean;
}) {
  const permissions = params.mitPublicShare
    ? ['team:read', 'db:plugin-tables', 'share:public-links']
    : ['team:read', 'db:plugin-tables'];

  const manifest: PluginManifest = {
    id: params.id,
    name: params.name,
    kurzbeschreibung: 'Dynamisch geladenes Laufzeit-Testplugin',
    version: params.version,
    sdkVersion: '1.0',
    autor: 'SidelineOS Runtime Test',
    repositoryUrl: `https://github.com/sidelineos/${params.id}`,
    icon: 'film',
    status: 'AKTIV',
    standardAktiviert: false,
    permissions: permissions as PluginManifest['permissions'],
    dbPrefix: `mod_${params.id.replace(/-/g, '_')}_`,
    s3Prefix: `plugins/${params.id}/`,
    settingsAnker: {},
  };

  const serverJs = `
const manifest = ${JSON.stringify(manifest)};
export default {
  manifest,
  async handleRequest(req, ctx) {
    if (req.method === 'GET' && req.path === '/ping') {
      return {
        status: 200,
        body: { ok: true, pluginId: ctx.pluginId, teamId: ctx.team.id, role: ctx.teamRolle, version: manifest.version }
      };
    }
    return { status: 404, body: { fehler: 'Unbekannte Plugin-Route' } };
  },
  async handlePublicRequest(req, db) {
    if (req.method === 'GET' && req.path === '/preview') {
      return { status: 200, body: { ok: true, schema: db.schemaName, version: manifest.version } };
    }
    return { status: 404, body: { fehler: 'Unbekannte Public-Route' } };
  }
};
`.trim();

  const clientJs = `
import { createPluginTranslator } from '@sidelineos/plugin-sdk';
const manifest = ${JSON.stringify(manifest)};
export default {
  manifest,
  defaultTab: 'overview',
  getTabs: () => [{ id: 'overview', label: 'Übersicht' }],
  renderMainView: () => createPluginTranslator({ de: { title: 'Test' }, en: { title: 'Test' } })('de')('title'),
  ${params.mitPublicShare ? 'renderPublicShareView: ({ token }) => token,' : ''}
};
`.trim();

  const clientCss = `.sideline-test-${params.id} { color: #F59E0B; }\n`;

  const dateien: Record<string, string> = {
    'plugin.manifest.json': JSON.stringify(manifest, null, 2),
    'migrations/001_init.sql': `
      CREATE TABLE IF NOT EXISTS mod_${params.id.replace(/-/g, '_')}_entries (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
    'dist/server.js': serverJs,
    'dist/client.js': clientJs,
    'dist/client.css': clientCss,
  };

  return {
    manifest,
    tarGz: erzeugeTarGzBuffer(dateien),
  };
}

describe('Dynamischer Plugin-Runtime-Loader (Backend, Shared ESM Shims & Client-Bundles)', () => {
  let tmpDataDir: string;
  let config: CoreServerConfig;
  let db: CoreDatabaseClient;
  let repo: CoreRepository;
  let runtimeLoader: PluginRuntimeLoader;
  let coreServer: http.Server;
  let baseUrl: string;
  let sysadminCookie: string;
  let coachCookie: string;

  before(async () => {
    try {
      tmpDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sidelineos-rt-'));
      config = loadCoreConfig({
        NODE_ENV: 'development',
        APP_URL: 'https://sideline.example.org',
        SESSION_SECRET: 'runtime-loader-test-secret-mindestens-32-chars',
        CORE_VERSION: '0.1.0-alpha.1',
        PLUGIN_DATA_DIR: tmpDataDir,
        DISABLE_UPDATE_CHECK: 'true',
      });

      db = await erstelleDatenbankClient(config);
      await bootstrapCoreInstance(db, config, { seedDemoWennLeer: true });

      const created = erstelleCoreApp({ db, config });
      repo = created.repo;
      runtimeLoader = created.runtimeLoader;

      coreServer = http.createServer(created.app);
      await new Promise<void>((resolve) => {
        coreServer.listen(0, '127.0.0.1', () => resolve());
      });
      const addr = coreServer.address();
      assert.ok(addr && typeof addr === 'object');
      baseUrl = `http://127.0.0.1:${addr.port}`;

      const loginSys = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ kennung: 'sysadmin', passwort: DEMO_STANDARD_PASSWORT }),
      });
      assert.equal(loginSys.status, 200);
      sysadminCookie = extrahiereCookieHeader(loginSys.headers.get('set-cookie'));

      const loginCoach = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ kennung: 't.richter', passwort: DEMO_STANDARD_PASSWORT }),
      });
      assert.equal(loginCoach.status, 200);
      coachCookie = extrahiereCookieHeader(loginCoach.headers.get('set-cookie'));
    } catch (err) {
      if (coreServer) await new Promise<void>((resolve) => coreServer.close(() => resolve()));
      if (db) await db.close();
      if (tmpDataDir) await fs.rm(tmpDataDir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  });

  after(async () => {
    if (coreServer) await new Promise<void>((resolve) => coreServer.close(() => resolve()));
    if (db) await db.close();
    if (tmpDataDir) await fs.rm(tmpDataDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('liefert valide Shared-ESM-Shims aus und weist unbekannte Shims mit 404 ab', async () => {
    const erwartungen: Array<{ shim: string; exports: string[] }> = [
      { shim: 'react.js', exports: ['useState', 'useEffect', 'createElement'] },
      { shim: 'react-jsx-runtime.js', exports: ['jsx', 'jsxs', 'Fragment'] },
      { shim: 'react-dom.js', exports: ['createPortal'] },
      { shim: 'react-dom-client.js', exports: ['createRoot'] },
      { shim: 'lucide-react.js', exports: ['Film', 'Puzzle'] },
      { shim: 'sdk.js', exports: ['createPluginTranslator', 'filtereNachSaison'] },
    ];

    for (const eintrag of erwartungen) {
      const res = await fetch(`${baseUrl}/api/v1/plugins/runtime/_shared/${eintrag.shim}`);
      assert.equal(res.status, 200, `Shim ${eintrag.shim} muss 200 liefern`);
      assert.match(res.headers.get('content-type') ?? '', /application\/javascript/);
      const code = await res.text();
      assert.match(code, /export default /);
      for (const exp of eintrag.exports) {
        assert.ok(
          code.includes(`export const ${exp} =`),
          `Shim ${eintrag.shim} muss Export "${exp}" enthalten`
        );
      }

      // Syntax-Validierung mit `node --check` auf temporärer .mjs-Datei
      const checkDatei = path.join(tmpDataDir, `check-${eintrag.shim.replace('.js', '.mjs')}`);
      await fs.writeFile(checkDatei, code, 'utf8');
      await execFileAsync(process.execPath, ['--check', checkDatei]);
    }

    const unknownRes = await fetch(`${baseUrl}/api/v1/plugins/runtime/_shared/unbekannt.js`);
    assert.equal(unknownRes.status, 404);
  });

  it('lädt Backend & Client-Bundle bei Upload-Installation live ohne Neustart, schützt Manifest/Pfade und entlädt bei Deaktivierung/Deinstallation', async () => {
    const publicBundle = erstelleRuntimeTestBundle({
      id: 'rt-video',
      name: 'Runtime Video',
      version: '0.2.0',
      mitPublicShare: true,
    });
    const privateBundle = erstelleRuntimeTestBundle({
      id: 'rt-playbook',
      name: 'Runtime Playbook',
      version: '1.0.0',
      mitPublicShare: false,
    });

    // 1. Beide Plugins per Offline-Upload installieren
    for (const bundle of [publicBundle, privateBundle]) {
      const upRes = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-upload`, {
        method: 'POST',
        headers: {
          Cookie: sysadminCookie,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ contentBase64: bundle.tarGz.toString('base64') }),
      });
      assert.equal(upRes.status, 200);
    }

    // 2. Live-Backend-Registrierung im Health-Endpunkt prüfen (ohne Server-Neustart)
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(healthRes.status, 200);
    const health = (await healthRes.json()) as { plugins: string[] };
    assert.ok(health.plugins.includes('rt-video'));
    assert.ok(health.plugins.includes('rt-playbook'));

    // 3. Team-Freigabe setzen und geschütztes + öffentliches Plugin-Gateway aufrufen
    const teamToggle = await fetch(
      `${baseUrl}/api/v1/sysadmin/teams/team-stallions-seniors/plugins/rt-video`,
      {
        method: 'PATCH',
        headers: {
          Cookie: sysadminCookie,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ enabled: true }),
      }
    );
    assert.equal(teamToggle.status, 200);

    const pingRes = await fetch(
      `${baseUrl}/api/v1/plugins/rt-video/teams/team-stallions-seniors/ping`,
      { headers: { Cookie: coachCookie } }
    );
    assert.equal(pingRes.status, 200);
    const pingJson = (await pingRes.json()) as { ok: boolean; pluginId: string; version: string };
    assert.equal(pingJson.ok, true);
    assert.equal(pingJson.pluginId, 'rt-video');
    assert.equal(pingJson.version, '0.2.0');

    const pubGatewayRes = await fetch(`${baseUrl}/api/v1/public/plugins/rt-video/preview`);
    assert.equal(pubGatewayRes.status, 200);
    const pubGatewayJson = (await pubGatewayRes.json()) as { ok: boolean; schema: string };
    assert.equal(pubGatewayJson.ok, true);
    assert.equal(pubGatewayJson.schema, 'plugin_rt_video');

    // 4. Runtime-Manifest erfordert Auth; Public-Manifest filtert strikt nach share:public-links
    const unauthManifest = await fetch(`${baseUrl}/api/v1/plugins/runtime/manifest`);
    assert.equal(unauthManifest.status, 401);

    const coachManifestRes = await fetch(`${baseUrl}/api/v1/plugins/runtime/manifest`, {
      headers: { Cookie: coachCookie },
    });
    assert.equal(coachManifestRes.status, 200);
    const coachManifest = (await coachManifestRes.json()) as {
      installedPluginIds: string[];
      enabledPluginIds: string[];
      bundles: Array<{ pluginId: string; version: string; clientUrl: string; cssUrl?: string }>;
    };
    assert.ok(coachManifest.installedPluginIds.includes('rt-video'));
    assert.ok(coachManifest.installedPluginIds.includes('rt-playbook'));
    const videoEntry = coachManifest.bundles.find((b) => b.pluginId === 'rt-video');
    assert.ok(videoEntry);
    assert.equal(videoEntry.clientUrl, '/api/v1/plugins/runtime/bundles/rt-video/0.2.0/client.js');
    assert.equal(videoEntry.cssUrl, '/api/v1/plugins/runtime/bundles/rt-video/0.2.0/client.css');

    const publicManifestRes = await fetch(`${baseUrl}/api/v1/plugins/runtime/public-manifest`);
    assert.equal(publicManifestRes.status, 200);
    const publicManifest = (await publicManifestRes.json()) as {
      bundles: Array<{ pluginId: string }>;
    };
    assert.deepEqual(
      publicManifest.bundles.map((b) => b.pluginId),
      ['rt-video']
    );

    // 5. Client-JS & CSS korrekt mit MIME-Type & nosniff ausliefern + Traversal blockieren
    const jsRes = await fetch(`${baseUrl}${videoEntry.clientUrl}`);
    assert.equal(jsRes.status, 200);
    assert.match(jsRes.headers.get('content-type') ?? '', /application\/javascript/);
    assert.equal(jsRes.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await jsRes.text(), /createPluginTranslator/);

    const cssRes = await fetch(`${baseUrl}${videoEntry.cssUrl}`);
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get('content-type') ?? '', /text\/css/);
    assert.match(await cssRes.text(), /\.sideline-test-rt-video/);

    const traversalRes = await fetch(
      `${baseUrl}/api/v1/plugins/runtime/bundles/rt-video/0.2.0/..%2fplugin.manifest.json`
    );
    assert.equal(traversalRes.status, 400);
    assert.equal(runtimeLoader.loesePluginVersionVerzeichnisAuf('rt-video', '../evil'), null);
    assert.equal(runtimeLoader.loesePluginVersionVerzeichnisAuf('../evil', '0.2.0'), null);

    // 6. Boot-Reload auf einer frischen Core-App-Instanz verifizieren (simuliert Server-Neustart)
    const bootedApp = erstelleCoreApp({ db, config });
    assert.deepEqual(bootedApp.pluginHost.listeRegistrierteIds(), []);
    const bootErgebnis = await bootedApp.runtimeLoader.ladeAlleInstalliertenBackendPlugins();
    assert.ok(bootErgebnis.geladen.includes('rt-video'));
    assert.ok(bootErgebnis.geladen.includes('rt-playbook'));
    assert.equal(bootErgebnis.fehler.length, 0);
    assert.ok(bootedApp.pluginHost.listeRegistrierteIds().includes('rt-video'));

    // 7. Globales Deaktivieren entlädt live & sperrt Bundle-Download; Re-Aktivieren lädt erneut
    const disableRes = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/rt-video/global`, {
      method: 'PATCH',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ enabledGlobally: false }),
    });
    assert.equal(disableRes.status, 200);

    const healthDisabled = (await (await fetch(`${baseUrl}/api/v1/health`)).json()) as {
      plugins: string[];
    };
    assert.equal(healthDisabled.plugins.includes('rt-video'), false);

    const disabledBundleRes = await fetch(`${baseUrl}${videoEntry.clientUrl}`);
    assert.equal(disabledBundleRes.status, 404);

    const disabledGatewayRes = await fetch(
      `${baseUrl}/api/v1/plugins/rt-video/teams/team-stallions-seniors/ping`,
      { headers: { Cookie: coachCookie } }
    );
    assert.equal(disabledGatewayRes.status, 403);

    const enableRes = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/rt-video/global`, {
      method: 'PATCH',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ enabledGlobally: true }),
    });
    assert.equal(enableRes.status, 200);

    const pingAfterReenable = await fetch(
      `${baseUrl}/api/v1/plugins/rt-video/teams/team-stallions-seniors/ping`,
      { headers: { Cookie: coachCookie } }
    );
    assert.equal(pingAfterReenable.status, 200);

    // 8. Deinstallation entlädt Backend-Plugin und entfernt Bundle-Zugriff
    const delRes = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/rt-video`, {
      method: 'DELETE',
      headers: { Cookie: sysadminCookie, 'X-Requested-With': 'XMLHttpRequest' },
    });
    assert.equal(delRes.status, 200);
    assert.equal(await repo.findePluginStatus('rt-video'), null);
    assert.equal((await fetch(`${baseUrl}${videoEntry.clientUrl}`)).status, 404);
  });
});
