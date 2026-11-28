/**
 * Optionales Entwicklungs-Seed-Skript (nicht Teil des Produktions-Cores!).
 * Aufruf: npm run seed:dev
 * Legt eine Beispiel-Struktur (Club -> aktives & archiviertes Team, Rollenkaskade, Einladung) an.
 */
import 'dotenv/config';
import { bootstrapCoreInstance } from '../src/server/bootstrap.ts';
import { loadCoreConfig } from '../src/server/config.ts';
import { erstelleDatenbankClient } from '../src/server/db/client.ts';
import { CoreRepository } from '../src/server/db/coreRepository.ts';
import { hashPasswort } from '../src/server/security.ts';

async function seedDev() {
  const config = loadCoreConfig();
  if (config.nodeEnv === 'production') {
    throw new Error('seed:dev darf nicht in Produktion ausgeführt werden.');
  }

  const db = await erstelleDatenbankClient(config);
  try {
    await bootstrapCoreInstance(db, config);
    const repo = new CoreRepository(db);

    if ((await repo.zaehleBenutzer()) > 0) {
      console.log('[seed:dev] Datenbank enthält bereits Benutzer – übersprungen.');
      return;
    }

    const devPassword = process.env.DEV_SEED_PASSWORD?.trim() || 'sideline-dev-2026';
    const hash = hashPasswort(devPassword);

    const sysadmin = await repo.erstelleBenutzer(
      {
        benutzername: 'sysadmin',
        vollerName: 'Jonas Keller (IT)',
        email: 'sysadmin@example.local',
        istSysadmin: true,
        preferredLocale: 'de',
      },
      hash
    );

    const clubAdmin = await repo.erstelleBenutzer(
      {
        benutzername: 'vorstand',
        vollerName: 'Markus Brenner',
        email: 'vorstand@example.local',
        istSysadmin: false,
        preferredLocale: 'de',
      },
      hash
    );

    const coach = await repo.erstelleBenutzer(
      {
        benutzername: 'coach',
        vollerName: 'Tobias Richter',
        email: 'coach@example.local',
        istSysadmin: false,
        preferredLocale: 'de',
      },
      hash
    );

    const club = await repo.erstelleClub({
      slug: 'demo-athletics',
      name: 'Demo Athletics Club',
      storageNodeId: 'default',
      storageQuotaBytes: 10 * 1024 * 1024 * 1024, // 10 GiB Pool
      storageSoftLimitPercent: 90,
    });

    const teamAktiv = await repo.erstelleTeam({
      clubId: club.id,
      slug: 'seniors',
      name: '1. Mannschaft',
      status: 'ACTIVE',
      akzentFarbe: '#F59E0B',
    });

    const teamArchiv = await repo.erstelleTeam({
      clubId: club.id,
      slug: 'u19-2025',
      name: 'U19 (Archiv 2025)',
      status: 'ARCHIVED',
      akzentFarbe: '#3B82F6',
    });

    // #23: CLUB_ADMIN erhält automatisch TEAM_ADMIN-Kaskade in beiden Teams
    await repo.speichereClubMitgliedschaft({
      userUuid: clubAdmin.uuid,
      clubId: club.id,
      rolle: 'CLUB_ADMIN',
    });

    await repo.speichereClubMitgliedschaft({
      userUuid: coach.uuid,
      clubId: club.id,
      rolle: 'CLUB_MEMBER',
    });
    await repo.speichereTeamMitgliedschaft({
      userUuid: coach.uuid,
      teamId: teamAktiv.id,
      rolle: 'STAFF',
      groups: ['offense', 'kader-a'],
    });
    await repo.speichereTeamMitgliedschaft({
      userUuid: coach.uuid,
      teamId: teamArchiv.id,
      rolle: 'STAFF',
      groups: ['archiv'],
    });

    const invite = await repo.erstelleEinladung({
      clubId: club.id,
      teamId: teamAktiv.id,
      clubRolle: 'CLUB_MEMBER',
      teamRolle: 'MEMBER',
      groups: ['neuzugang'],
      gueltigBis: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    });

    console.log('[seed:dev] Erfolgreich angelegt:');
    console.log(`  Sysadmin:   ${sysadmin.benutzername}`);
    console.log(`  Club-Admin: ${clubAdmin.benutzername}`);
    console.log(`  Staff:      ${coach.benutzername}`);
    console.log(`  Invite-URL: ${invite.pfad}`);
  } finally {
    await db.close();
  }
}

seedDev().catch((err) => {
  console.error('[seed:dev] Fehler:', err);
  process.exit(1);
});
