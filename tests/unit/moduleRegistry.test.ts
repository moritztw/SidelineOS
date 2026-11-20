import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_AKTIVIERTE_MODULE,
  istModulFuerTeamAktiv,
  parseAktivierteModuleAusEnv,
} from '../../src/core/moduleRegistry.ts';

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
