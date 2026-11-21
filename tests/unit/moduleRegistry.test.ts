import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  erstelleCustomPluginManifest,
  istPluginFuerTeamAktiv,
  parseAktivierteModuleAusEnv,
  parseGitHubPluginQuelle,
} from '../../src/core/pluginRegistry.ts';
import {
  OFFIZIELLER_PLUGIN_KATALOG,
  STANDARD_AKTIVIERTE_PLUGIN_IDS,
  STANDARD_INSTALLIERTE_PLUGIN_IDS,
  VIDEO_STORE_MANIFEST,
} from '../../src/core/pluginStoreCatalog.ts';
import { fuegeNeueSaisonHinzu } from '../../src/core/seasonUtils.ts';
import { ermittleEintragSaison, filtereNachSaison } from '../../src/sdk/plugin.ts';
import { VIDEO_PLUGIN_MANIFEST } from '../../src/plugins/video-analysis/manifest.ts';
import type { VideoReel } from '../../src/plugins/video-analysis/types.ts';
import type { TeamKontext } from '../../src/shared/types.ts';

describe('SidelineOS Plugin-SDK, Store-Katalog & ENV-Aktivierung', () => {
  it('parst ENABLED_MODULES aus ENV kommagetrennt und ignoriert unbekannte IDs', () => {
    assert.deepEqual(
      parseAktivierteModuleAusEnv(
        'video-analysis, roster-attendance, unbekannt',
        STANDARD_INSTALLIERTE_PLUGIN_IDS,
        STANDARD_AKTIVIERTE_PLUGIN_IDS
      ),
      ['video-analysis', 'roster-attendance']
    );
  });

  it('fällt bei leerer oder fehlender ENV-Variable auf Standard-Plugins zurück', () => {
    assert.deepEqual(
      parseAktivierteModuleAusEnv(
        '',
        STANDARD_INSTALLIERTE_PLUGIN_IDS,
        STANDARD_AKTIVIERTE_PLUGIN_IDS
      ),
      STANDARD_AKTIVIERTE_PLUGIN_IDS
    );
    assert.deepEqual(
      parseAktivierteModuleAusEnv(
        undefined,
        STANDARD_INSTALLIERTE_PLUGIN_IDS,
        STANDARD_AKTIVIERTE_PLUGIN_IDS
      ),
      STANDARD_AKTIVIERTE_PLUGIN_IDS
    );
  });

  it('aktiviert ein Plugin für ein Team nur bei Installation + Instanz- und Team-Freigabe', () => {
    assert.equal(
      istPluginFuerTeamAktiv(
        'video-analysis',
        ['video-analysis', 'playbook'],
        ['video-analysis', 'playbook'],
        ['video-analysis']
      ),
      true
    );
    assert.equal(
      istPluginFuerTeamAktiv(
        'video-analysis',
        ['playbook'],
        ['video-analysis', 'playbook'],
        ['video-analysis']
      ),
      false
    );
    assert.equal(
      istPluginFuerTeamAktiv(
        'playbook',
        ['video-analysis', 'playbook'],
        ['video-analysis', 'playbook'],
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

  it('hält plugin.manifest.json, TypeScript-Manifest und Store-Katalog exakt synchron', () => {
    const jsonRoh = readFileSync(
      new URL('../../src/plugins/video-analysis/plugin.manifest.json', import.meta.url),
      'utf8'
    );
    const jsonManifest = JSON.parse(jsonRoh);
    assert.deepEqual(VIDEO_PLUGIN_MANIFEST, jsonManifest);
    assert.deepEqual(VIDEO_STORE_MANIFEST, VIDEO_PLUGIN_MANIFEST);
    assert.ok(OFFIZIELLER_PLUGIN_KATALOG.some((e) => e.manifest.id === 'video-analysis'));
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

  const demoReels: VideoReel[] = [
    {
      id: 'r1',
      teamId: 'team-test',
      title: 'Spiel 2026',
      category: 'GAME',
      eventDate: '2026-08-10',
      thumbnailUrl: '',
      angles: ['SIDELINE'],
      sourceMode: 'CLIP_FILE',
      playCount: 1,
      taggedCount: 0,
      visibility: 'COACHES_ONLY',
      teamFreigaben: [],
      shareLinks: [],
      draftNoteCount: 0,
      plays: [],
    },
    {
      id: 'r2',
      teamId: 'team-test',
      saison: '2025',
      title: 'Halbfinale 2025',
      category: 'GAME',
      eventDate: '2025-09-20',
      thumbnailUrl: '',
      angles: ['SIDELINE'],
      sourceMode: 'CLIP_FILE',
      playCount: 1,
      taggedCount: 1,
      visibility: 'ALL_PLAYERS',
      teamFreigaben: [],
      shareLinks: [],
      draftNoteCount: 0,
      plays: [],
    },
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
    assert.equal(ermittleEintragSaison(demoReels[0]), '2026');
    assert.equal(ermittleEintragSaison(demoReels[1]), '2025');
    assert.deepEqual(
      filtereNachSaison(demoReels, '2026').map((r) => r.id),
      ['r1']
    );
    assert.deepEqual(
      filtereNachSaison(demoReels, '2025').map((r) => r.id),
      ['r2']
    );
    assert.equal(filtereNachSaison(demoReels, 'ALL').length, 2);
  });
});
