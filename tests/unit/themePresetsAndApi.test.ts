import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { DEMO_STANDARD_PASSWORT } from '../../src/core/authService.ts';
import { istGueltigesFrontendPlugin } from '../../src/plugins/pluginLoader.ts';
import {
  CORE_STANDARD_THEME_PRESET,
  STANDARD_THEME_REF,
  bereinigePluginThemePresets,
  loeseAktivesThemeAuf,
  parseThemeRef,
  sammleVerfuegbareThemes,
  validiereThemeTokenWert,
  type PluginManifest,
} from '../../src/sdk/plugin.ts';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import { CoreRepository } from '../../src/server/db/coreRepository.ts';
import { PluginBackendHost } from '../../src/server/plugins/backendHost.ts';
import { validierePluginManifest } from '../../src/server/services/pluginInstaller.ts';

const DAYLIGHT_THEME_MANIFEST: PluginManifest = {
  id: 'daylight-theme',
  name: 'Daylight Theme Pack',
  kurzbeschreibung: 'Helles Theme-Preset ohne eigene Hauptansicht.',
  version: '1.0.0',
  sdkVersion: '1.0',
  autor: 'Test',
  repositoryUrl: 'https://github.com/example/daylight-theme',
  icon: 'layers',
  status: 'AKTIV',
  standardAktiviert: true,
  hideHubTile: true,
  permissions: [],
  dbPrefix: 'mod_daylight_theme_',
  settingsAnker: {},
  themes: [
    {
      id: 'daylight',
      name: 'Daylight (Hell)',
      beschreibung: 'Hoher Kontrast bei Sonnenlicht',
      colorScheme: 'light',
      tokens: {
        '--sl-bg-canvas': '#F8FAFC',
        '--sl-bg-surface': '#FFFFFF',
        '--sl-text-heading': '#0F172A',
        '--sl-text-primary': '#1E293B',
      },
    },
    {
      id: 'night-blue',
      name: 'Night Blue',
      colorScheme: 'dark',
      overrideTeamAccent: true,
      tokens: {
        '--sl-bg-canvas': '#060D1A',
        '--sl-accent': '#38BDF8',
      },
    },
  ],
};

const HIDDEN_DISABLED_THEME_MANIFEST: PluginManifest = {
  ...DAYLIGHT_THEME_MANIFEST,
  id: 'disabled-theme',
  name: 'Disabled Theme',
  dbPrefix: 'mod_disabled_theme_',
  themes: [
    {
      id: 'solar',
      name: 'Solar',
      colorScheme: 'light',
      tokens: {
        '--sl-bg-canvas': '#FFFBEB',
      },
    },
  ],
};

describe('PR3: Theme-Presets, Sanitization & Loader-Vertrag', () => {
  it('akzeptiert nur gültige --sl-*-Tokens mit Hex-Farben oder dark/light und blockt Injection', () => {
    assert.equal(validiereThemeTokenWert('--sl-bg-canvas', '#fff'), '#FFFFFF');
    assert.equal(validiereThemeTokenWert('--sl-bg-surface', '#1e293b80'), '#1E293B80');
    assert.equal(validiereThemeTokenWert('--sl-color-scheme', 'LIGHT'), 'light');

    assert.equal(validiereThemeTokenWert('--sl-bg-canvas', 'url(https://evil.test)'), null);
    assert.equal(validiereThemeTokenWert('--sl-bg-canvas', '#FFF; color: red'), null);
    assert.equal(validiereThemeTokenWert('--sl-color-scheme', 'sepia'), null);
    assert.equal(validiereThemeTokenWert('--evil-custom', '#FFFFFF'), null);
    assert.equal(validiereThemeTokenWert('__proto__', '#FFFFFF'), null);
  });

  it('bereinigt Plugin-Theme-Presets, dedupliziert IDs und setzt Fallback --sl-color-scheme', () => {
    const roh = JSON.parse(`
      [
        {
          "id": "Daylight",
          "name": "Daylight Hell",
          "colorScheme": "light",
          "overrideTeamAccent": true,
          "tokens": {
            "--sl-bg-canvas": "#f8fafc",
            "--sl-text-primary": "expression(alert(1))",
            "background": "red"
          }
        },
        {
          "id": "daylight",
          "name": "Duplikat",
          "colorScheme": "dark",
          "tokens": {}
        },
        {
          "id": "../bad",
          "name": "Ungültig",
          "colorScheme": "dark",
          "tokens": {}
        }
      ]
    `);

    const bereinigt = bereinigePluginThemePresets(roh);
    assert.equal(bereinigt.length, 1);
    assert.equal(bereinigt[0].id, 'daylight');
    assert.equal(bereinigt[0].colorScheme, 'light');
    assert.equal(bereinigt[0].overrideTeamAccent, true);
    assert.deepEqual(bereinigt[0].tokens, {
      '--sl-bg-canvas': '#F8FAFC',
      '--sl-color-scheme': 'light',
    });
  });

  it('löst Theme-Präferenz nach Priorität Benutzer -> Instanz -> Core auf und fällt sicher zurück', () => {
    const verfuegbareThemes = sammleVerfuegbareThemes([
      {
        pluginId: DAYLIGHT_THEME_MANIFEST.id,
        pluginName: DAYLIGHT_THEME_MANIFEST.name,
        themes: DAYLIGHT_THEME_MANIFEST.themes,
      },
    ]);

    const coreFallback = loeseAktivesThemeAuf({
      userPreferredTheme: undefined,
      instanceDefaultTheme: STANDARD_THEME_REF,
      verfuegbareThemes,
    });
    assert.equal(coreFallback.themeRef, STANDARD_THEME_REF);
    assert.equal(coreFallback.quelle, 'instance');
    assert.equal(coreFallback.preset, CORE_STANDARD_THEME_PRESET);

    const instanzPreset = loeseAktivesThemeAuf({
      userPreferredTheme: '',
      instanceDefaultTheme: 'daylight-theme:daylight',
      verfuegbareThemes,
    });
    assert.equal(instanzPreset.themeRef, 'daylight-theme:daylight');
    assert.equal(instanzPreset.quelle, 'instance');

    const userOverrideCore = loeseAktivesThemeAuf({
      userPreferredTheme: 'core:default',
      instanceDefaultTheme: 'daylight-theme:daylight',
      verfuegbareThemes,
    });
    assert.equal(userOverrideCore.themeRef, 'core:default');
    assert.equal(userOverrideCore.quelle, 'user');

    const userOverridePlugin = loeseAktivesThemeAuf({
      userPreferredTheme: 'daylight-theme:night-blue',
      instanceDefaultTheme: 'daylight-theme:daylight',
      verfuegbareThemes,
    });
    assert.equal(userOverridePlugin.themeRef, 'daylight-theme:night-blue');
    assert.equal(userOverridePlugin.quelle, 'user');

    // Benutzer wählt entferntes Plugin -> fällt auf Instanz-Standard zurück
    const entferntesPluginFallback = loeseAktivesThemeAuf({
      userPreferredTheme: 'disabled-theme:solar',
      instanceDefaultTheme: 'daylight-theme:daylight',
      verfuegbareThemes,
    });
    assert.equal(entferntesPluginFallback.themeRef, 'daylight-theme:daylight');
    assert.equal(entferntesPluginFallback.quelle, 'instance');

    assert.equal(parseThemeRef('core:other'), null);
    assert.deepEqual(parseThemeRef('daylight-theme:daylight'), {
      typ: 'plugin',
      pluginId: 'daylight-theme',
      themeId: 'daylight',
    });
  });

  it('validierePluginManifest bewahrt bereinigte themes und akzeptiert deklarative Theme-Plugins im Loader', () => {
    const validiert = validierePluginManifest({
      ...DAYLIGHT_THEME_MANIFEST,
      themes: [
        {
          id: 'daylight',
          name: 'Daylight',
          colorScheme: 'light',
          tokens: {
            '--sl-bg-canvas': '#fff',
            '--evil-var': 'javascript:alert(1)',
          },
        },
      ],
    });

    assert.equal(validiert.themes?.length, 1);
    assert.deepEqual(validiert.themes?.[0].tokens, {
      '--sl-bg-canvas': '#FFFFFF',
      '--sl-color-scheme': 'light',
    });

    // Deklaratives Theme-Plugin ohne Provider und ohne renderMainView
    assert.equal(
      istGueltigesFrontendPlugin({
        manifest: DAYLIGHT_THEME_MANIFEST,
      }),
      true
    );

    // Ohne irgendeine Fähigkeit oder Theme bleibt es ungültig
    assert.equal(
      istGueltigesFrontendPlugin({
        manifest: { ...DAYLIGHT_THEME_MANIFEST, themes: [] },
      }),
      false
    );
  });
});

describe('PR3: Theme-Persistence & API-Endpunkte (/runtime/themes, /sysadmin/theme, /auth/me)', () => {
  let db: CoreDatabaseClient;
  let repo: CoreRepository;
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    const config = loadCoreConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-mindestens-32-zeichen-lang',
    });
    db = await erstelleDatenbankClient(config);
    await bootstrapCoreInstance(db, config, { seedDemoWennLeer: true });
    repo = new CoreRepository(db);

    await repo.registrierePlugin(
      {
        manifest: DAYLIGHT_THEME_MANIFEST,
        quelle: 'OFFICIAL_GITHUB',
        verifiziert: true,
        releaseTag: 'v1.0.0',
        paketFormat: 'sideline-plugin-v1',
      },
      true
    );
    await repo.registrierePlugin(
      {
        manifest: HIDDEN_DISABLED_THEME_MANIFEST,
        quelle: 'CUSTOM_GITHUB',
        verifiziert: false,
        releaseTag: 'v1.0.0',
        paketFormat: 'sideline-plugin-v1',
      },
      false // global deaktiviert
    );

    const pluginHost = new PluginBackendHost(db);
    const { app } = erstelleCoreApp({ config, db, pluginHost });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    await db.close();
  });

  it('liefert öffentlich nur global aktive Plugin-Themes und unterstützt Sysadmin + User Theme-Persistenz', async () => {
    // 1. Public runtime themes ohne Login
    const pubRes = await fetch(`${baseUrl}/api/v1/plugins/runtime/themes`);
    assert.equal(pubRes.status, 200);
    const pubJson = (await pubRes.json()) as {
      instanceDefaultTheme: string;
      plugins: Array<{ pluginId: string; themes: Array<{ id: string }> }>;
    };
    assert.equal(pubJson.instanceDefaultTheme, 'core:default');
    assert.equal(pubJson.plugins.length, 1);
    assert.equal(pubJson.plugins[0].pluginId, 'daylight-theme');
    assert.equal(pubJson.plugins[0].themes.length, 2);

    // 2. Login Sysadmin (m.brenner) & Nicht-Sysadmin (t.richter)
    const sysLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kennung: 'm.brenner', passwort: DEMO_STANDARD_PASSWORT }),
    });
    assert.equal(sysLoginRes.status, 200);
    const sysLogin = (await sysLoginRes.json()) as {
      token: string;
      instanceDefaultTheme: string;
    };
    assert.equal(sysLogin.instanceDefaultTheme, 'core:default');

    const userLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kennung: 't.richter', passwort: DEMO_STANDARD_PASSWORT }),
    });
    assert.equal(userLoginRes.status, 200);
    const userLogin = (await userLoginRes.json()) as { token: string };

    // 3. Nicht-Sysadmin darf PUT /sysadmin/theme nicht aufrufen (403)
    const forbiddenPut = await fetch(`${baseUrl}/api/v1/sysadmin/theme`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        authorization: `Bearer ${userLogin.token}`,
      },
      body: JSON.stringify({ themeRef: 'daylight-theme:daylight' }),
    });
    assert.equal(forbiddenPut.status, 403);

    // 4. Sysadmin setzt ungültiges/deaktiviertes Theme -> 400 / 409 / 404
    const badFormatPut = await fetch(`${baseUrl}/api/v1/sysadmin/theme`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        authorization: `Bearer ${sysLogin.token}`,
      },
      body: JSON.stringify({ themeRef: 'bad format!' }),
    });
    assert.equal(badFormatPut.status, 400);

    const disabledPut = await fetch(`${baseUrl}/api/v1/sysadmin/theme`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        authorization: `Bearer ${sysLogin.token}`,
      },
      body: JSON.stringify({ themeRef: 'disabled-theme:solar' }),
    });
    assert.equal(disabledPut.status, 409);

    const unknownPresetPut = await fetch(`${baseUrl}/api/v1/sysadmin/theme`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        authorization: `Bearer ${sysLogin.token}`,
      },
      body: JSON.stringify({ themeRef: 'daylight-theme:nicht-vorhanden' }),
    });
    assert.equal(unknownPresetPut.status, 404);

    // 5. Sysadmin setzt Instanz-Standard auf daylight-theme:daylight
    const validPut = await fetch(`${baseUrl}/api/v1/sysadmin/theme`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        authorization: `Bearer ${sysLogin.token}`,
      },
      body: JSON.stringify({ themeRef: 'daylight-theme:daylight' }),
    });
    assert.equal(validPut.status, 200);
    const putData = (await validPut.json()) as { defaultTheme: string };
    assert.equal(putData.defaultTheme, 'daylight-theme:daylight');

    // Public Endpoint & /sysadmin/overview & /auth/me reflektieren Instanz-Standard
    const pubAfter = (await (await fetch(`${baseUrl}/api/v1/plugins/runtime/themes`)).json()) as {
      instanceDefaultTheme: string;
    };
    assert.equal(pubAfter.instanceDefaultTheme, 'daylight-theme:daylight');

    const overviewRes = await fetch(`${baseUrl}/api/v1/sysadmin/overview`, {
      headers: { authorization: `Bearer ${sysLogin.token}` },
    });
    assert.equal(overviewRes.status, 200);
    const overviewData = (await overviewRes.json()) as {
      capabilities: { defaultTheme: string };
    };
    assert.equal(overviewData.capabilities.defaultTheme, 'daylight-theme:daylight');

    // 6. Benutzer speichert eigene Theme-Präferenz über PATCH /api/v1/auth/me
    const patchUserRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        authorization: `Bearer ${userLogin.token}`,
      },
      body: JSON.stringify({ preferredTheme: 'daylight-theme:night-blue' }),
    });
    assert.equal(patchUserRes.status, 200);
    const patchUserJson = (await patchUserRes.json()) as {
      user: { preferredTheme?: string };
    };
    assert.equal(patchUserJson.user.preferredTheme, 'daylight-theme:night-blue');

    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${userLogin.token}` },
    });
    assert.equal(meRes.status, 200);
    const meJson = (await meRes.json()) as {
      instanceDefaultTheme: string;
      user: { preferredTheme?: string };
    };
    assert.equal(meJson.instanceDefaultTheme, 'daylight-theme:daylight');
    assert.equal(meJson.user.preferredTheme, 'daylight-theme:night-blue');

    // 7. Benutzer setzt Präferenz per null zurück -> folgt wieder Instanz-Standard
    const resetUserRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        authorization: `Bearer ${userLogin.token}`,
      },
      body: JSON.stringify({ preferredTheme: null }),
    });
    assert.equal(resetUserRes.status, 200);
    const resetUserJson = (await resetUserRes.json()) as {
      user: { preferredTheme?: string };
    };
    assert.equal(resetUserJson.user.preferredTheme, undefined);
  });
});
