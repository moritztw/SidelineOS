import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { DEMO_STANDARD_PASSWORT } from '../../src/core/authService.ts';
import {
  createVideoTranslator,
  VIDEO_WOERTERBUECHER,
} from '../../src/plugins/video-analysis/i18n.ts';
import type { PluginManifest, SidelineBackendPlugin } from '../../src/sdk/plugin.ts';
import {
  DEFAULT_BRAND,
  holeAktuelleBrandKonfig,
  setzeRuntimeBrandName,
  teileWortmarke,
} from '../../src/shared/brand.ts';
import {
  createPluginTranslator,
  interpoliereText,
  normalisiereSprache,
  uebersetzeSchluessel,
} from '../../src/shared/i18n.ts';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import { PluginBackendHost } from '../../src/server/plugins/backendHost.ts';

const TEST_PLUGIN_MANIFEST: PluginManifest = {
  id: 'video-analysis',
  name: 'Videoanalyse',
  kurzbeschreibung: 'Locale-Test-Plugin',
  version: '1.0.0',
  sdkVersion: '1.0',
  autor: 'Test',
  repositoryUrl: 'https://github.com/example/video',
  icon: 'film',
  status: 'AKTIV',
  standardAktiviert: true,
  permissions: ['team:read'],
  dbPrefix: 'mod_video_',
  s3Prefix: 'plugins/video-analysis/',
  settingsAnker: {},
};

describe('R1: Rebranding-Vorbereitung & i18n-Fundament', () => {
  after(() => {
    setzeRuntimeBrandName(null);
  });

  it('normalisiert Sprachcodes, interpoliert Platzhalter und fällt sicher auf DE zurück', () => {
    assert.equal(normalisiereSprache('en-US'), 'en');
    assert.equal(normalisiereSprache('DE_AT'), 'de');
    assert.equal(normalisiereSprache('fr-FR'), 'de');
    assert.equal(normalisiereSprache(undefined, 'en'), 'en');

    assert.equal(
      interpoliereText('Hallo {name}, {count} Plays', { name: 'Coach', count: 12 }),
      'Hallo Coach, 12 Plays'
    );

    const woerterbuecher = {
      de: { gruss: 'Hallo {name}', nurDe: 'Nur Deutsch' },
      en: { gruss: 'Hello {name}' },
    };

    assert.equal(uebersetzeSchluessel(woerterbuecher, 'en', 'gruss', { name: 'Max' }), 'Hello Max');
    assert.equal(uebersetzeSchluessel(woerterbuecher, 'en', 'nurDe'), 'Nur Deutsch');
    assert.equal(uebersetzeSchluessel(woerterbuecher, 'en', 'unbekannt.key'), 'unbekannt.key');

    const tDe = createPluginTranslator(VIDEO_WOERTERBUECHER, 'de');
    const tEn = createVideoTranslator('en');
    assert.equal(tDe('tab.dashboard'), 'Bibliothek');
    assert.equal(tEn('tab.dashboard'), 'Library');
  });

  it('trennt UI-Markennamen sauber von unveränderlichen SDK- & Paket-Kennungen', () => {
    setzeRuntimeBrandName(null);
    const standard = holeAktuelleBrandKonfig();
    assert.equal(standard.produktName, DEFAULT_BRAND.produktName);
    assert.equal(standard.coreName, 'SidelineOS-Core');
    assert.equal(standard.sdkScope, '@sidelineos/plugin-sdk');
    assert.equal(standard.paketFormat, 'sideline-plugin-v1');

    setzeRuntimeBrandName('TeamOS');
    const rebranded = holeAktuelleBrandKonfig();
    assert.equal(rebranded.produktName, 'TeamOS');
    assert.equal(rebranded.coreName, 'TeamOS-Core');
    assert.equal(rebranded.sdkScope, '@sidelineos/plugin-sdk');
    assert.equal(rebranded.paketFormat, 'sideline-plugin-v1');

    assert.deepEqual(teileWortmarke('SidelineOS'), { basis: 'Sideline', akzent: 'OS' });
    assert.deepEqual(teileWortmarke('CoachHub'), { basis: 'CoachHub', akzent: '' });
  });
});

describe('R1 API: Benutzer-Sprache, Capabilities & Plugin-Backend-Locale', () => {
  let db: CoreDatabaseClient;
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    const config = loadCoreConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-mindestens-32-zeichen-lang',
      APP_BRAND_NAME: 'TestClubOS',
      DEFAULT_LOCALE: 'de',
    });
    db = await erstelleDatenbankClient(config);
    await bootstrapCoreInstance(db, config, { seedDemoWennLeer: true });

    const pluginHost = new PluginBackendHost(db);
    const backendPlugin: SidelineBackendPlugin = {
      manifest: TEST_PLUGIN_MANIFEST,
      async handleRequest(_req, ctx) {
        return {
          status: 200,
          body: {
            locale: ctx.locale,
            teamId: ctx.team.id,
          },
        };
      },
    };
    await pluginHost.registriereBackendPlugin(backendPlugin);

    const { app } = erstelleCoreApp({ db, config, pluginHost });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    setzeRuntimeBrandName(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  });

  it('persistiert preferredLocale via PATCH /auth/me, prüft Sysadmin-Capabilities und leitet Locale an Plugins weiter', async () => {
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kennung: 'm.brenner', passwort: DEMO_STANDARD_PASSWORT }),
    });
    assert.equal(loginRes.status, 200);
    const loginData = (await loginRes.json()) as {
      token: string;
      user: { preferredLocale?: string };
      teams: Array<{ id: string }>;
    };
    assert.equal(loginData.user.preferredLocale, 'de');
    const authHeaders = {
      'content-type': 'application/json',
      authorization: `Bearer ${loginData.token}`,
    };

    // Ungültige Sprache wird abgelehnt (400)
    const invalidRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ preferredLocale: 'fr' }),
    });
    assert.equal(invalidRes.status, 400);

    // Wechsel auf EN wird persistiert
    const patchRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ preferredLocale: 'en' }),
    });
    assert.equal(patchRes.status, 200);
    const patchData = (await patchRes.json()) as { user: { preferredLocale?: string } };
    assert.equal(patchData.user.preferredLocale, 'en');

    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${loginData.token}` },
    });
    assert.equal(meRes.status, 200);
    const meData = (await meRes.json()) as { user: { preferredLocale?: string } };
    assert.equal(meData.user.preferredLocale, 'en');

    // Sysadmin-Overview liefert brandName & defaultLocale
    const sysRes = await fetch(`${baseUrl}/api/v1/sysadmin/overview`, {
      headers: { authorization: `Bearer ${loginData.token}` },
    });
    assert.equal(sysRes.status, 200);
    const sysData = (await sysRes.json()) as {
      capabilities: { brandName: string; defaultLocale: string };
    };
    assert.equal(sysData.capabilities.brandName, 'TestClubOS');
    assert.equal(sysData.capabilities.defaultLocale, 'de');

    // Backend-Plugin erhält automatisch ctx.locale === 'en'
    const teamId = loginData.teams[0]?.id ?? 'team-stallions-u19';
    const pluginRes = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/${encodeURIComponent(teamId)}/locale-probe`,
      { headers: { authorization: `Bearer ${loginData.token}` } }
    );
    assert.equal(pluginRes.status, 200);
    const pluginData = (await pluginRes.json()) as { locale: string; teamId: string };
    assert.equal(pluginData.locale, 'en');
    assert.equal(pluginData.teamId, teamId);
  });
});
