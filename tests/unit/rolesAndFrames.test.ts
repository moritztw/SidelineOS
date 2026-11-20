import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FRAME_MS,
  STANDARD_HOTKEYS,
  aktualisiereBenutzerHotkey,
  darfAnsichtWechseln,
  ermittleWaehlbareTeamAnsichten,
  frameZuZeit,
  istGleicherFrame,
  zeitZuFrame,
} from '../../src/core/rolePermissions.ts';
import { DEMO_PROFILE } from '../../src/shared/types.ts';

describe('Rollen-Hierarchie & Ansichts-Umschalter', () => {
  it('Team Admin darf Team Admin, Coach und Spieler Ansicht nutzen', () => {
    const teamAdmin = DEMO_PROFILE.find((p) => p.teamRolle === 'TEAM_ADMIN')!;
    assert.deepEqual(ermittleWaehlbareTeamAnsichten(teamAdmin), [
      'TEAM_ADMIN',
      'COACH',
      'PLAYER',
    ]);
    assert.equal(darfAnsichtWechseln(teamAdmin), true);
  });

  it('Coach darf Coach und Spieler Ansicht nutzen', () => {
    const coach = DEMO_PROFILE.find((p) => p.teamRolle === 'COACH')!;
    assert.deepEqual(ermittleWaehlbareTeamAnsichten(coach), ['COACH', 'PLAYER']);
    assert.equal(darfAnsichtWechseln(coach), true);
  });

  it('Spieler hat keine untergeordneten Rollen -> Umschalter wird ausgeblendet', () => {
    const spieler = DEMO_PROFILE.find((p) => p.teamRolle === 'PLAYER')!;
    assert.deepEqual(ermittleWaehlbareTeamAnsichten(spieler), ['PLAYER']);
    assert.equal(darfAnsichtWechseln(spieler), false);
  });

  it('Reiner Sysadmin ohne Team-Rolle hat keine Team-Ansichten', () => {
    const nurSysadmin = DEMO_PROFILE.find((p) => p.teamRolle === null)!;
    assert.deepEqual(ermittleWaehlbareTeamAnsichten(nurSysadmin), []);
    assert.equal(darfAnsichtWechseln(nurSysadmin), false);
  });
});

describe('Exakte Frame-Bindung für Canvas-Zeichnungen', () => {
  it('rechnet Millisekunden deterministisch in 25fps-Frames (40 ms) um', () => {
    assert.equal(FRAME_MS, 40);
    assert.equal(zeitZuFrame(2400), 60);
    assert.equal(frameZuZeit(60), 2400);
  });

  it('zeigt Zeichnung ausschließlich auf demselben Frame und nicht auf Nachbarframes', () => {
    assert.equal(istGleicherFrame(2400, 2400), true);
    assert.equal(istGleicherFrame(2400, 2410), true);
    assert.equal(istGleicherFrame(2400, 2440), false);
    assert.equal(istGleicherFrame(2400, 2360), false);
  });
});

describe('Benutzerdefinierte Film-Room-Hotkeys', () => {
  it('übernimmt gültige neue Tastenbelegung normalisiert in Kleinbuchstaben', () => {
    const ergebnis = aktualisiereBenutzerHotkey(STANDARD_HOTKEYS, 'pen', 'B');
    assert.equal(ergebnis.ok, true);
    assert.equal(ergebnis.hotkeys.pen, 'b');
  });

  it('lehnt Doppelbelegungen mit verständlicher Fehlermeldung ab', () => {
    const ergebnis = aktualisiereBenutzerHotkey(STANDARD_HOTKEYS, 'pen', 'a');
    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.fehler ?? '', /bereits/i);
    assert.equal(ergebnis.hotkeys.pen, STANDARD_HOTKEYS.pen);
  });

  it('lehnt ungültige Sondertasten ab', () => {
    const ergebnis = aktualisiereBenutzerHotkey(STANDARD_HOTKEYS, 'arrow', 'Enter');
    assert.equal(ergebnis.ok, false);
    assert.equal(ergebnis.hotkeys.arrow, STANDARD_HOTKEYS.arrow);
  });
});
