import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  darfAnsichtWechseln,
  ermittleWaehlbareTeamAnsichten,
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
