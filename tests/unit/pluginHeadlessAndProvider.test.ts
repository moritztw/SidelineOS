import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactNode } from 'react';
import {
  ermittlePluginProviderKontext,
  istPluginAufHubSichtbar,
} from '../../src/core/pluginRegistry.ts';
import { istGueltigesFrontendPlugin } from '../../src/plugins/pluginLoader.ts';
import { validierePluginManifest } from '../../src/server/services/pluginInstaller.ts';
import type {
  PluginManifest,
  PluginProviderProps,
  SidelinePlugin,
} from '../../src/sdk/plugin.ts';
import type { BenutzerKonto, TeamKontext } from '../../src/shared/types.ts';

function erstelleBasisManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'theme-nordic',
    name: 'Nordic Theme',
    kurzbeschreibung: 'Helles Theme-Plugin ohne eigene Hauptansicht.',
    version: '1.0.0',
    sdkVersion: '1.0',
    autor: 'Test',
    repositoryUrl: 'https://github.com/example/SidelineOS-theme-nordic',
    icon: 'layers',
    status: 'AKTIV',
    standardAktiviert: false,
    permissions: ['team:read'],
    dbPrefix: 'mod_theme_nordic_',
    settingsAnker: {},
    ...overrides,
  };
}

const TEST_BENUTZER: BenutzerKonto = {
  uuid: 'usr-1',
  benutzername: 'coach',
  vollerName: 'Max Coach',
  email: 'coach@example.com',
  istSysadmin: true,
  erstelltAm: '2026-01-01T00:00:00Z',
  preferredLocale: 'de',
  customProfilWerte: {},
};

const TEST_TEAM: TeamKontext = {
  id: 'team-1',
  name: 'Munich Stallions',
  kurzname: 'Stallions',
  aktiveSaison: '2026',
  saisons: ['2026', '2025'],
  primaerFarbe: '#F59E0B',
  aktivierteModule: ['theme-nordic'],
  customProfilFelder: [],
};

describe('Headless-/Theme-Plugins & Manifest hideHubTile (PR2)', () => {
  it('validierePluginManifest bewahrt hideHubTile boolean und lässt es weg wenn nicht gesetzt', () => {
    const mitHide = validierePluginManifest(
      erstelleBasisManifest({ hideHubTile: true })
    );
    assert.equal(mitHide.hideHubTile, true);

    const mitShow = validierePluginManifest(
      erstelleBasisManifest({ hideHubTile: false })
    );
    assert.equal(mitShow.hideHubTile, false);

    const ohneHide = validierePluginManifest(erstelleBasisManifest());
    assert.equal('hideHubTile' in ohneHide, false);
  });

  it('istGueltigesFrontendPlugin akzeptiert Voll-Plugins, Provider-Plugins, Settings-Plugins und Share-Plugins', () => {
    const vollPlugin: SidelinePlugin = {
      manifest: erstelleBasisManifest({ id: 'scouting', dbPrefix: 'mod_scouting_' }),
      defaultTab: 'overview',
      getTabs: () => [{ id: 'overview', label: 'Übersicht' }],
      renderMainView: () => null,
    };
    assert.equal(istGueltigesFrontendPlugin(vollPlugin), true);

    const themeProviderPlugin: SidelinePlugin = {
      manifest: erstelleBasisManifest({ hideHubTile: true }),
      Provider: ({ children, ctx }: PluginProviderProps) => {
        void ctx?.istGlobalAktiv;
        return children;
      },
    };
    assert.equal(istGueltigesFrontendPlugin(themeProviderPlugin), true);

    // Abwärtskompatibilität: klassischer Provider ohne ctx-Parameter
    const altProviderPlugin: SidelinePlugin = {
      manifest: erstelleBasisManifest({ id: 'legacy-provider', dbPrefix: 'mod_legacy_' }),
      Provider: ({ children }: { children: ReactNode }) => children,
    };
    assert.equal(istGueltigesFrontendPlugin(altProviderPlugin), true);

    const settingsOnlyPlugin: SidelinePlugin = {
      manifest: erstelleBasisManifest({ id: 'settings-only', dbPrefix: 'mod_settings_only_' }),
      settingsPanels: {
        user: ({ ctx }) => ctx.locale,
      },
    };
    assert.equal(istGueltigesFrontendPlugin(settingsOnlyPlugin), true);

    const shareOnlyPlugin: SidelinePlugin = {
      manifest: erstelleBasisManifest({ id: 'share-only', dbPrefix: 'mod_share_only_' }),
      renderPublicShareView: () => null,
    };
    assert.equal(istGueltigesFrontendPlugin(shareOnlyPlugin), true);
  });

  it('istGueltigesFrontendPlugin lehnt leere oder ungültige Plugin-Exports ab', () => {
    assert.equal(istGueltigesFrontendPlugin(null), false);
    assert.equal(
      istGueltigesFrontendPlugin({ manifest: erstelleBasisManifest() }),
      false
    );
    assert.equal(
      istGueltigesFrontendPlugin({
        manifest: erstelleBasisManifest(),
        Provider: 'kein-component',
      }),
      false
    );
    assert.equal(
      istGueltigesFrontendPlugin({
        manifest: erstelleBasisManifest(),
        defaultTab: 123,
        renderMainView: () => null,
      }),
      false
    );
    assert.equal(
      istGueltigesFrontendPlugin({
        manifest: erstelleBasisManifest(),
        settingsPanels: { team: 42 },
      }),
      false
    );
  });

  it('istPluginAufHubSichtbar blendet hideHubTile und Plugins ohne renderMainView aus', () => {
    const sichtbar: SidelinePlugin = {
      manifest: erstelleBasisManifest({ id: 'scouting', dbPrefix: 'mod_scouting_' }),
      renderMainView: () => null,
    };
    assert.equal(istPluginAufHubSichtbar(sichtbar), true);

    const verstecktPerFlag: SidelinePlugin = {
      manifest: erstelleBasisManifest({ hideHubTile: true }),
      renderMainView: () => null,
    };
    assert.equal(istPluginAufHubSichtbar(verstecktPerFlag), false);

    const headlessOhneView: SidelinePlugin = {
      manifest: erstelleBasisManifest(),
      Provider: ({ children }: PluginProviderProps) => children,
    };
    assert.equal(istPluginAufHubSichtbar(headlessOhneView), false);
  });

  it('ermittlePluginProviderKontext liefert Live-Team-Status bzw. Null-Team auf Login/Sysadmin', () => {
    const imTeamAktiv = ermittlePluginProviderKontext({
      pluginId: 'theme-nordic',
      installierteIds: ['theme-nordic'],
      globalAktivierteIds: ['theme-nordic'],
      routeArt: 'app',
      bereich: 'hub',
      locale: 'de',
      benutzer: TEST_BENUTZER,
      aktivesTeam: TEST_TEAM,
      aktiveTeamAnsicht: 'COACH',
      gewaehlteSaison: '2026',
    });
    assert.equal(imTeamAktiv.istGlobalAktiv, true);
    assert.equal(imTeamAktiv.istFuerAktivesTeamAktiv, true);
    assert.equal(imTeamAktiv.team?.id, 'team-1');
    assert.equal(imTeamAktiv.aktiveTeamAnsicht, 'COACH');
    assert.equal(imTeamAktiv.gewaehlteSaison, '2026');

    const imTeamInaktiv = ermittlePluginProviderKontext({
      pluginId: 'theme-nordic',
      installierteIds: ['theme-nordic'],
      globalAktivierteIds: ['theme-nordic'],
      routeArt: 'app',
      bereich: 'hub',
      locale: 'en',
      benutzer: TEST_BENUTZER,
      aktivesTeam: { ...TEST_TEAM, aktivierteModule: [] },
      aktiveTeamAnsicht: 'PLAYER',
      gewaehlteSaison: 'ALL',
    });
    assert.equal(imTeamInaktiv.istGlobalAktiv, true);
    assert.equal(imTeamInaktiv.istFuerAktivesTeamAktiv, false);
    assert.equal(imTeamInaktiv.team?.id, 'team-1');
    assert.equal(imTeamInaktiv.gewaehlteSaison, 'ALL');

    const imSysadmin = ermittlePluginProviderKontext({
      pluginId: 'theme-nordic',
      installierteIds: ['theme-nordic'],
      globalAktivierteIds: ['theme-nordic'],
      routeArt: 'app',
      bereich: 'sysadmin',
      locale: 'de',
      benutzer: TEST_BENUTZER,
      aktivesTeam: TEST_TEAM,
      aktiveTeamAnsicht: 'TEAM_ADMIN',
      gewaehlteSaison: '2026',
    });
    assert.equal(imSysadmin.istGlobalAktiv, true);
    assert.equal(imSysadmin.istFuerAktivesTeamAktiv, false);
    assert.equal(imSysadmin.team, null);
    assert.equal(imSysadmin.aktiveTeamAnsicht, null);
    assert.equal(imSysadmin.gewaehlteSaison, null);

    const aufLogin = ermittlePluginProviderKontext({
      pluginId: 'theme-nordic',
      installierteIds: ['theme-nordic'],
      globalAktivierteIds: ['theme-nordic'],
      routeArt: 'login',
      bereich: 'hub',
      locale: 'de',
      benutzer: null,
      aktivesTeam: TEST_TEAM,
      aktiveTeamAnsicht: 'TEAM_ADMIN',
      gewaehlteSaison: '2026',
    });
    assert.equal(aufLogin.istGlobalAktiv, true);
    assert.equal(aufLogin.istFuerAktivesTeamAktiv, false);
    assert.equal(aufLogin.team, null);
    assert.equal(aufLogin.benutzer, null);
  });
});
