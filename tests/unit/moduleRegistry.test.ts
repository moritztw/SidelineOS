import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_AKTIVIERTE_MODULE,
  istModulFuerTeamAktiv,
  parseAktivierteModuleAusEnv,
} from '../../src/core/moduleRegistry.ts';
import {
  ermittleReelSaison,
  filtereReelsNachSaison,
  fuegeNeueSaisonHinzu,
} from '../../src/core/seasonUtils.ts';
import type { TeamKontext, VideoReel } from '../../src/shared/types.ts';

describe('SidelineOS Modul-Registry & ENV-Aktivierung', () => {
  it('parst ENABLED_MODULES aus ENV kommagetrennt und ignoriert unbekannte IDs', () => {
    assert.deepEqual(
      parseAktivierteModuleAusEnv('video-analysis, roster-attendance, unbekannt'),
      ['video-analysis', 'roster-attendance']
    );
  });

  it('fällt bei leerer oder fehlender ENV-Variable auf Standard-Module zurück', () => {
    assert.deepEqual(parseAktivierteModuleAusEnv(''), STANDARD_AKTIVIERTE_MODULE);
    assert.deepEqual(parseAktivierteModuleAusEnv(undefined), STANDARD_AKTIVIERTE_MODULE);
  });

  it('aktiviert ein Modul für ein Team nur bei Freigabe auf beiden Ebenen (Instanz + Team)', () => {
    assert.equal(
      istModulFuerTeamAktiv('video-analysis', ['video-analysis', 'playbook'], ['video-analysis']),
      true
    );
    assert.equal(
      istModulFuerTeamAktiv('playbook', ['video-analysis', 'playbook'], ['video-analysis']),
      false
    );
    assert.equal(
      istModulFuerTeamAktiv('roster-attendance', ['video-analysis'], ['roster-attendance']),
      false
    );
  });
});

describe('Dauerhafte Multi-Saison-Teams & Saison-Filterung', () => {
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

  it('filtert Reels sauber nach Saison inkl. Fallback auf eventDate und ALL-Ansicht', () => {
    assert.equal(ermittleReelSaison(demoReels[0]), '2026');
    assert.equal(ermittleReelSaison(demoReels[1]), '2025');
    assert.deepEqual(
      filtereReelsNachSaison(demoReels, '2026').map((r) => r.id),
      ['r1']
    );
    assert.deepEqual(
      filtereReelsNachSaison(demoReels, '2025').map((r) => r.id),
      ['r2']
    );
    assert.equal(filtereReelsNachSaison(demoReels, 'ALL').length, 2);
  });
});
