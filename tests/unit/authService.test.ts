import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_STANDARD_PASSWORT,
  authentifiziereBenutzer,
  ermittleEigeneTeams,
  ermittleProfilAusKonto,
  parseAppRouteAusPfad,
  pruefeEinladungsToken,
} from '../../src/core/authService.ts';
import type {
  BenutzerKonto,
  TeamEinladung,
  TeamKontext,
  TeamMitgliedschaft,
} from '../../src/shared/types.ts';

const TEST_BENUTZER: BenutzerKonto[] = [
  {
    uuid: 'usr-coach-1',
    benutzername: 'm.brenner',
    vollerName: 'Markus Brenner',
    email: 'headcoach@stallions-football.de',
    istSysadmin: true,
    erstelltAm: '2025-01-10',
    customProfilWerte: {},
  },
  {
    uuid: 'usr-player-1',
    benutzername: 'j.weber',
    vollerName: 'Jonas Weber',
    email: 'j.weber@stallions-football.de',
    istSysadmin: false,
    erstelltAm: '2025-03-01',
    customProfilWerte: {},
  },
];

const TEST_EINLADUNGEN: TeamEinladung[] = [
  {
    id: 'inv-valid',
    teamId: 'team-seniors',
    typ: 'TEAM_LINK',
    rolle: 'PLAYER',
    units: ['OFFENSE'],
    token: 'team-seniors-2026-x9k2',
    pfad: '/invite/team-seniors-2026-x9k2',
    erstelltAm: '2026-04-01',
    gueltigBis: '2026-12-31',
    bestaetigungErforderlich: true,
    aktiv: true,
  },
  {
    id: 'inv-revoked',
    teamId: 'team-seniors',
    typ: 'EMAIL',
    zielEmail: 'alt@verein.de',
    rolle: 'PLAYER',
    units: ['DEFENSE'],
    token: 'revoked-token',
    pfad: '/invite/revoked-token',
    erstelltAm: '2026-01-01',
    gueltigBis: '2026-12-31',
    bestaetigungErforderlich: false,
    aktiv: false,
  },
  {
    id: 'inv-expired',
    teamId: 'team-seniors',
    typ: 'TEAM_LINK',
    rolle: 'PLAYER',
    units: ['OFFENSE'],
    token: 'expired-token',
    pfad: '/invite/expired-token',
    erstelltAm: '2025-01-01',
    gueltigBis: '2025-02-01',
    bestaetigungErforderlich: false,
    aktiv: true,
  },
];

const TEST_MITGLIEDSCHAFTEN: TeamMitgliedschaft[] = [
  {
    id: 'mem-1',
    userUuid: 'usr-coach-1',
    teamId: 'team-seniors',
    rolle: 'TEAM_ADMIN',
    units: ['OFFENSE', 'DEFENSE'],
    status: 'AKTIV',
    beigetretenAm: '2025-01-10',
  },
  {
    id: 'mem-2',
    userUuid: 'usr-player-1',
    teamId: 'team-seniors',
    rolle: 'PLAYER',
    units: ['OFFENSE'],
    status: 'WARTET_AUF_FREIGABE',
    beigetretenAm: '2026-04-12',
  },
];

test('parseAppRouteAusPfad erkennt /, /login, /invite/<token> und /share/<token>', () => {
  assert.deepEqual(parseAppRouteAusPfad('/'), { art: 'app' });
  assert.deepEqual(parseAppRouteAusPfad(''), { art: 'app' });
  assert.deepEqual(parseAppRouteAusPfad('/login/'), { art: 'login' });
  assert.deepEqual(parseAppRouteAusPfad('/invite/abc-123/'), {
    art: 'invite',
    token: 'abc-123',
  });
  assert.deepEqual(parseAppRouteAusPfad('/share/sl-8f2a9c4k'), {
    art: 'share',
    token: 'sl-8f2a9c4k',
  });
});

test('pruefeEinladungsToken prüft Gültigkeit, Widerruf und Ablaufdatum', () => {
  const referenz = new Date('2026-06-01T12:00:00.000Z');

  const okRes = pruefeEinladungsToken(TEST_EINLADUNGEN, 'team-seniors-2026-x9k2', referenz);
  assert.equal(okRes.ok, true);
  assert.equal(okRes.status, 'VALID');

  const notFound = pruefeEinladungsToken(TEST_EINLADUNGEN, 'unbekannt', referenz);
  assert.equal(notFound.ok, false);
  assert.equal(notFound.status, 'NOT_FOUND');

  const revoked = pruefeEinladungsToken(TEST_EINLADUNGEN, 'revoked-token', referenz);
  assert.equal(revoked.ok, false);
  assert.equal(revoked.status, 'REVOKED');

  const expired = pruefeEinladungsToken(TEST_EINLADUNGEN, 'expired-token', referenz);
  assert.equal(expired.ok, false);
  assert.equal(expired.status, 'EXPIRED');
});

test('authentifiziereBenutzer unterstützt E-Mail, Benutzername und individuelle Passwörter', () => {
  const passwoerter = new Map<string, string>([['usr-player-1', 'GeheimesPasswort123!']]);

  const byMail = authentifiziereBenutzer(
    TEST_BENUTZER,
    passwoerter,
    'HeadCoach@Stallions-Football.de',
    DEMO_STANDARD_PASSWORT
  );
  assert.equal(byMail.ok, true);
  assert.equal(byMail.benutzer?.uuid, 'usr-coach-1');

  const byUser = authentifiziereBenutzer(
    TEST_BENUTZER,
    passwoerter,
    'j.weber',
    'GeheimesPasswort123!'
  );
  assert.equal(byUser.ok, true);
  assert.equal(byUser.benutzer?.uuid, 'usr-player-1');

  const wrongPw = authentifiziereBenutzer(TEST_BENUTZER, passwoerter, 'j.weber', 'falsch');
  assert.equal(wrongPw.ok, false);

  const emptyInput = authentifiziereBenutzer(TEST_BENUTZER, passwoerter, '', '');
  assert.equal(emptyInput.ok, false);
});

test('ermittleProfilAusKonto liefert aktive Team-Rolle und ignoriert wartende Freigaben', () => {
  const coachProfil = ermittleProfilAusKonto(
    TEST_BENUTZER[0],
    'team-seniors',
    TEST_MITGLIEDSCHAFTEN
  );
  assert.equal(coachProfil.teamRolle, 'TEAM_ADMIN');
  assert.equal(coachProfil.istSysadmin, true);

  const wartenderSpieler = ermittleProfilAusKonto(
    TEST_BENUTZER[1],
    'team-seniors',
    TEST_MITGLIEDSCHAFTEN
  );
  assert.equal(wartenderSpieler.teamRolle, null);
  assert.equal(wartenderSpieler.istSysadmin, false);

  const fremdesTeam = ermittleProfilAusKonto(
    TEST_BENUTZER[0],
    'team-fremd',
    TEST_MITGLIEDSCHAFTEN
  );
  assert.equal(fremdesTeam.teamRolle, null);
});

test('ermittleEigeneTeams filtert strikt auf aktive Mitgliedschaften und blendet fremde Teams für Sysadmins aus', () => {
  const alleTeams: TeamKontext[] = [
    {
      id: 'team-seniors',
      name: 'Munich Stallions',
      kurzname: 'Seniors',
      aktiveSaison: '2026',
      saisons: ['2026'],
      aktivierteModule: [],
      customProfilFelder: [],
    },
    {
      id: 'team-u19',
      name: 'Munich Stallions U19',
      kurzname: 'U19',
      aktiveSaison: '2026',
      saisons: ['2026'],
      aktivierteModule: [],
      customProfilFelder: [],
    },
    {
      id: 'team-fremd',
      name: 'Fremdes Team',
      kurzname: 'Fremd',
      aktiveSaison: '2026',
      saisons: ['2026'],
      aktivierteModule: [],
      customProfilFelder: [],
    },
  ];

  // Sysadmin mit nur 1 aktiver Mitgliedschaft sieht keine fremden Teams (kein Umschalter)
  const sysadminEigene = ermittleEigeneTeams(TEST_BENUTZER[0], alleTeams, TEST_MITGLIEDSCHAFTEN);
  assert.deepEqual(
    sysadminEigene.map((t) => t.id),
    ['team-seniors']
  );

  // Wartende Mitgliedschaft zählt nicht als eigenes Team
  const wartendEigene = ermittleEigeneTeams(TEST_BENUTZER[1], alleTeams, TEST_MITGLIEDSCHAFTEN);
  assert.deepEqual(wartendEigene, []);

  // Erst ab >= 2 aktiven Mitgliedschaften stehen mehrere Teams zur Auswahl
  const mehrfacheMitgliedschaften: TeamMitgliedschaft[] = [
    ...TEST_MITGLIEDSCHAFTEN,
    {
      id: 'mem-3',
      userUuid: 'usr-coach-1',
      teamId: 'team-u19',
      rolle: 'COACH',
      units: ['OFFENSE'],
      status: 'AKTIV',
      beigetretenAm: '2026-01-12',
    },
  ];
  const multiEigene = ermittleEigeneTeams(TEST_BENUTZER[0], alleTeams, mehrfacheMitgliedschaften);
  assert.deepEqual(
    multiEigene.map((t) => t.id),
    ['team-seniors', 'team-u19']
  );
});
