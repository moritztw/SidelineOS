import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  erstelleCustomPluginManifest,
  istPluginFuerTeamAktiv,
  parseGitHubPluginQuelle,
} from '../../src/core/pluginRegistry.ts';
import {
  OFFIZIELLER_PLUGIN_KATALOG,
  STANDARD_AKTIVIERTE_PLUGIN_IDS,
  STANDARD_INSTALLIERTE_PLUGIN_IDS,
} from '../../src/core/pluginStoreCatalog.ts';
import { fuegeNeueSaisonHinzu } from '../../src/core/seasonUtils.ts';
import { ermittleEintragSaison, filtereNachSaison } from '../../src/sdk/plugin.ts';
import type { TeamKontext } from '../../src/shared/types.ts';

describe('SidelineOS Plugin-SDK & Store-Katalog', () => {
  it('aktiviert ein Plugin für ein Team nur bei Installation + Instanz- und Team-Freigabe', () => {
    assert.equal(
      istPluginFuerTeamAktiv(
        'video-analysis',
        ['video-analysis', 'scouting'],
        ['video-analysis', 'scouting'],
        ['video-analysis']
      ),
      true
    );
    assert.equal(
      istPluginFuerTeamAktiv(
        'video-analysis',
        ['scouting'],
        ['video-analysis', 'scouting'],
        ['video-analysis']
      ),
      false
    );
    assert.equal(
      istPluginFuerTeamAktiv(
        'scouting',
        ['video-analysis', 'scouting'],
        ['video-analysis', 'scouting'],
        ['video-analysis']
      ),
      false
    );
  });

  it('validiert GitHub-Repository-URLs für den Plugin Store und erzeugt ein isoliertes Manifest', () => {
    const ungueltig = parseGitHubPluginQuelle('https://example.com/plugin');
    assert.equal(ungueltig.ok, false);

    const gueltig = parseGitHubPluginQuelle(
      'https://github.com/munich-stallions/sidelineos-plugin-scouting.git/'
    );
    assert.equal(gueltig.ok, true);
    assert.equal(gueltig.slug, 'scouting');
    assert.equal(
      gueltig.repoUrl,
      'https://github.com/munich-stallions/sidelineos-plugin-scouting'
    );

    const manifest = erstelleCustomPluginManifest(gueltig.repoUrl!, gueltig.slug!);
    assert.equal(manifest.id, 'scouting');
    assert.equal(manifest.dbPrefix, 'mod_scouting_');
    assert.equal(manifest.s3Prefix, 'plugins/scouting/');
  });

  it('startet mit leerem offiziellem Store-Katalog ohne vorinstallierte Module', () => {
    assert.deepEqual(STANDARD_INSTALLIERTE_PLUGIN_IDS, []);
    assert.deepEqual(STANDARD_AKTIVIERTE_PLUGIN_IDS, []);
    assert.deepEqual(OFFIZIELLER_PLUGIN_KATALOG, []);
  });
});

describe('Dauerhafte Multi-Saison-Teams & generische SDK-Saison-Filterung', () => {
  const basisTeam: TeamKontext = {
    id: 'team-test',
    name: 'Test Team',
    kurzname: 'Test',
    aktiveSaison: '2026',
    saisons: ['2026', '2025'],
    aktivierteModule: ['video-analysis'],
    customProfilFelder: [],
  };

  const eintraege = [
    { id: 'r1', eventDate: '2026-08-10' },
    { id: 'r2', saison: '2025', eventDate: '2025-09-20' },
  ];

  it('startet eine neue Saison ohne Team-Neuanlage und erhält alle Altsaisons', () => {
    const aktualisiert = fuegeNeueSaisonHinzu(basisTeam, '2027');
    assert.equal(aktualisiert.aktiveSaison, '2027');
    assert.deepEqual(aktualisiert.saisons, ['2027', '2026', '2025']);
  });

  it('verhindert Duplikate bei bereits bestehender Saison und schaltet aktiv um', () => {
    const aktualisiert = fuegeNeueSaisonHinzu(basisTeam, '2025');
    assert.equal(aktualisiert.aktiveSaison, '2025');
    assert.deepEqual(aktualisiert.saisons, ['2026', '2025']);
  });

  it('filtert Einträge sauber nach Saison inkl. Fallback auf eventDate und ALL-Ansicht', () => {
    assert.equal(ermittleEintragSaison(eintraege[0]), '2026');
    assert.equal(ermittleEintragSaison(eintraege[1]), '2025');
    assert.deepEqual(
      filtereNachSaison(eintraege, '2026').map((r) => r.id),
      ['r1']
    );
    assert.deepEqual(
      filtereNachSaison(eintraege, '2025').map((r) => r.id),
      ['r2']
    );
    assert.equal(filtereNachSaison(eintraege, 'ALL').length, 2);
  });
});
