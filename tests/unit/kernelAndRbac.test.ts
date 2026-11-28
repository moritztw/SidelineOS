import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import { CoreRepository } from '../../src/server/db/coreRepository.ts';
import { hashPasswort } from '../../src/server/security.ts';

async function starteTestServer(app: ReturnType<typeof erstelleCoreApp>['app']) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Test-Server-Adresse ungültig.');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

describe('Core v0.2.0 Kernel, Club->Team RBAC (#23), Archivierung (#25) & Onboarding (#26)', () => {
  let db: CoreDatabaseClient;
  let repo: CoreRepository;

  before(async () => {
    const config = loadCoreConfig({
      DATABASE_URL: '',
      PGLITE_DATA_DIR: '',
      SESSION_SECRET: 'test-secret-mindestens-32-zeichen-lang-1234',
    });
    db = await erstelleDatenbankClient(config);
    await bootstrapCoreInstance(db, config);
    repo = new CoreRepository(db);
  });

  after(async () => {
    await db.close();
  });

  it('erzwingt Club 1:n Team und kaskadiert CLUB_ADMIN unveränderlich zu TEAM_ADMIN (#23)', async () => {
    const club = await repo.erstelleClub({ slug: 'sc-nord', name: 'SC Nord' });
    const teamA = await repo.erstelleTeam({ clubId: club.id, slug: 'herren-1', name: 'Herren 1' });
    const teamB = await repo.erstelleTeam({ clubId: club.id, slug: 'u19', name: 'U19' });

    const adminUser = await repo.erstelleBenutzer(
      { benutzername: 'clubchef', vollerName: 'Club Chef', email: 'chef@scnord.de' },
      hashPasswort('Geheim1234!')
    );
    await repo.speichereClubMitgliedschaft({
      userUuid: adminUser.uuid,
      clubId: club.id,
      rolle: 'CLUB_ADMIN',
    });

    // Selbst ohne explizite team_membership ist der CLUB_ADMIN überall TEAM_ADMIN
    const berechtigungA = await repo.ermittleEffektiveTeamBerechtigung(adminUser.uuid, teamA.id);
    assert.ok(berechtigungA);
    assert.equal(berechtigungA.clubRolle, 'CLUB_ADMIN');
    assert.equal(berechtigungA.effektiveTeamRolle, 'TEAM_ADMIN');
    assert.equal(berechtigungA.istKaskadiertVonClubAdmin, true);

    // Selbst bei expliziter MEMBER-Rolle im Team bleibt die Kaskade auf TEAM_ADMIN bestehen
    await repo.speichereTeamMitgliedschaft({
      userUuid: adminUser.uuid,
      teamId: teamB.id,
      rolle: 'MEMBER',
      groups: ['offense', 'kapitaen'],
    });
    const berechtigungB = await repo.ermittleEffektiveTeamBerechtigung(adminUser.uuid, teamB.id);
    assert.ok(berechtigungB);
    assert.equal(berechtigungB.effektiveTeamRolle, 'TEAM_ADMIN');
    assert.equal(berechtigungB.istKaskadiertVonClubAdmin, true);
    assert.deepEqual(berechtigungB.groups, ['offense', 'kapitaen']);
  });

  it('unterstützt Team-Archivierung im Read-Only-Modus (#25)', async () => {
    const club = await repo.erstelleClub({ slug: 'sc-archiv', name: 'SC Archiv' });
    const team = await repo.erstelleTeam({ clubId: club.id, slug: 'saison-2024', name: 'Saison 2024' });
    const mitglied = await repo.erstelleBenutzer(
      { benutzername: 'archivar', vollerName: 'Archiv Nutzer', email: 'archivar@test.de' },
      hashPasswort('Geheim1234!')
    );
    await repo.speichereClubMitgliedschaft({
      userUuid: mitglied.uuid,
      clubId: club.id,
      rolle: 'CLUB_MEMBER',
    });
    await repo.speichereTeamMitgliedschaft({
      userUuid: mitglied.uuid,
      teamId: team.id,
      rolle: 'STAFF',
      groups: ['video'],
    });

    const archiviert = await repo.setzeTeamStatus(team.id, 'ARCHIVED');
    assert.equal(archiviert?.status, 'ARCHIVED');

    const aktiveListe = await repo.listeTeamsNachClub(club.id, { includeArchived: false });
    assert.equal(aktiveListe.length, 0);

    const alleListe = await repo.listeTeamsNachClub(club.id, { includeArchived: true });
    assert.equal(alleListe.length, 1);

    const berechtigung = await repo.ermittleEffektiveTeamBerechtigung(mitglied.uuid, team.id);
    assert.equal(berechtigung?.teamStatus, 'ARCHIVED');
    assert.equal(berechtigung?.istLesemodus, true);
  });

  it('löst eine Team-Einladung atomar in Club- + Team-Mitgliedschaft inklusive Gruppen auf (#26)', async () => {
    const club = await repo.erstelleClub({ slug: 'sv-onboarding', name: 'SV Onboarding' });
    const team = await repo.erstelleTeam({ clubId: club.id, slug: 'damen-1', name: 'Damen 1' });

    const { token } = await repo.erstelleEinladung({
      clubId: club.id,
      teamId: team.id,
      clubRolle: 'CLUB_MEMBER',
      teamRolle: 'MEMBER',
      groups: ['defense', 'neuzugang'],
      gueltigBis: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const neu = await repo.erstelleBenutzer(
      { benutzername: 'neuesmitglied', vollerName: 'Neues Mitglied', email: 'neu@sv.de' },
      hashPasswort('Geheim1234!')
    );

    const aktiv = await repo.findeAktiveEinladungNachToken(token);
    assert.ok(aktiv);
    const ergebnis = await repo.loeseEinladungFuerUserEin({
      userUuid: neu.uuid,
      einladung: aktiv,
    });
    assert.equal(ergebnis.clubMitgliedschaft.clubId, club.id);
    assert.equal(ergebnis.clubMitgliedschaft.rolle, 'CLUB_MEMBER');
    assert.equal(ergebnis.teamMitgliedschaft?.teamId, team.id);
    assert.equal(ergebnis.teamMitgliedschaft?.rolle, 'MEMBER');
    assert.deepEqual(ergebnis.teamMitgliedschaft?.groups, ['defense', 'neuzugang']);
  });

  it('erlaubt einmalige Ersteinrichtung per /api/v2/auth/bootstrap-admin und sperrt danach', async () => {
    const config = loadCoreConfig({
      DATABASE_URL: '',
      PGLITE_DATA_DIR: '',
      SESSION_SECRET: 'fresh-bootstrap-secret-32-chars-min',
    });
    const freshDb = await erstelleDatenbankClient(config);
    await bootstrapCoreInstance(freshDb, config);
    const { app } = erstelleCoreApp({ db: freshDb, config });
    const srv = await starteTestServer(app);

    try {
      const statusVorher = await fetch(`${srv.baseUrl}/api/v2/auth/bootstrap-status`).then((r) =>
        r.json()
      );
      assert.equal(statusVorher.ersteinrichtungOffen, true);

      const angelegt = await fetch(`${srv.baseUrl}/api/v2/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          benutzername: 'sysadmin',
          vollerName: 'Erst Admin',
          email: 'root@sideline.local',
          passwort: 'SehrSicheresPasswort123!',
        }),
      });
      assert.equal(angelegt.status, 201);

      const zweiterVersuch = await fetch(`${srv.baseUrl}/api/v2/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          benutzername: 'angreifer',
          vollerName: 'Angreifer',
          email: 'evil@sideline.local',
          passwort: 'SehrSicheresPasswort123!',
        }),
      });
      assert.equal(zweiterVersuch.status, 409);
    } finally {
      await srv.close();
      await freshDb.close();
    }
  });
});
