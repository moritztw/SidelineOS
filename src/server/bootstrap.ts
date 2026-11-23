import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  INITIALE_BENUTZER,
  INITIALE_EINLADUNGEN,
  INITIALE_MITGLIEDSCHAFTEN,
  INITIALE_TEAMS,
} from '../core/demoOrgData.ts';
import { DEMO_STANDARD_PASSWORT } from '../core/authService.ts';
import type { CoreServerConfig } from './config.ts';
import type { CoreDatabaseClient } from './db/client.ts';
import { CoreRepository } from './db/coreRepository.ts';
import { hashPasswort } from './security.ts';

export interface BootstrapErgebnis {
  initialAdminErstellt: boolean;
  demoDatenGesetzt: boolean;
  anzahlBenutzer: number;
}

const CORE_MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '001_core.sql',
    sql: fs.readFileSync(new URL('./db/migrations/001_core.sql', import.meta.url), 'utf8'),
  },
  {
    name: '002_system_settings.sql',
    sql: fs.readFileSync(
      new URL('./db/migrations/002_system_settings.sql', import.meta.url),
      'utf8'
    ),
  },
  {
    name: '003_core_migrations_and_cleanup.sql',
    sql: fs.readFileSync(
      new URL('./db/migrations/003_core_migrations_and_cleanup.sql', import.meta.url),
      'utf8'
    ),
  },
  {
    name: '004_user_locale.sql',
    sql: fs.readFileSync(
      new URL('./db/migrations/004_user_locale.sql', import.meta.url),
      'utf8'
    ),
  },
  {
    name: '005_notifications.sql',
    sql: fs.readFileSync(
      new URL('./db/migrations/005_notifications.sql', import.meta.url),
      'utf8'
    ),
  },
];

async function fuehreCoreMigrationenAus(db: CoreDatabaseClient): Promise<void> {
  // 001..003 sind idempotent (IF NOT EXISTS) und legen `core.schema_migrations` an
  for (const migration of CORE_MIGRATIONS) {
    await db.exec(migration.sql);
  }

  for (const migration of CORE_MIGRATIONS) {
    const checksum = crypto.createHash('sha256').update(migration.sql).digest('hex');
    const vorhanden = await db.query<{ checksum: string }>(
      `SELECT checksum FROM core.schema_migrations WHERE migration_name = $1 LIMIT 1`,
      [migration.name]
    );
    if (vorhanden.rows.length === 0) {
      await db.query(
        `INSERT INTO core.schema_migrations (migration_name, checksum) VALUES ($1, $2)`,
        [migration.name, checksum]
      );
    }
  }
}

/**
 * Führt Core-Schema-Migrationen aus, registriert installierte Store-Plugins und
 * legt beim Erststart (ohne UI-Wizard) entweder den ENV-Sysadmin oder im lokalen
 * Entwicklungsmodus optional Demo-Daten an.
 */
export async function bootstrapCoreInstance(
  db: CoreDatabaseClient,
  config: CoreServerConfig,
  optionen: { seedDemoWennLeer?: boolean } = {}
): Promise<BootstrapErgebnis> {
  await fuehreCoreMigrationenAus(db);

  const repo = new CoreRepository(db);

  // Veraltete Katalog-Platzhalter aus früheren Alpha-Ständen bereinigen (echte Bundles bleiben unberührt)
  await db.query(`DELETE FROM core.installed_plugins WHERE install_mode = 'CATALOG'`);

  const vorhandeneBenutzer = await repo.zaehleBenutzer();
  if (vorhandeneBenutzer > 0) {
    return {
      initialAdminErstellt: false,
      demoDatenGesetzt: false,
      anzahlBenutzer: vorhandeneBenutzer,
    };
  }

  // Produktiver ENV-Bootstrap: erster Sysadmin ohne Browser-Wizard
  if (config.initialSysadmin) {
    await repo.erstelleBenutzer(
      {
        uuid: 'usr-sysadmin-init',
        benutzername: config.initialSysadmin.username,
        vollerName: 'System-Administrator',
        email: config.initialSysadmin.email,
        istSysadmin: true,
        erstelltAm: new Date().toISOString().slice(0, 10),
        preferredLocale: config.defaultLocale,
        customProfilWerte: {},
      },
      hashPasswort(config.initialSysadmin.password)
    );

    return {
      initialAdminErstellt: true,
      demoDatenGesetzt: false,
      anzahlBenutzer: 1,
    };
  }

  // Entwicklungs-/Preview-Seed ausschließlich wenn explizit gewünscht und nicht Produktion
  const darfDemoSeeden =
    optionen.seedDemoWennLeer ?? config.nodeEnv !== 'production';

  if (!darfDemoSeeden) {
    return {
      initialAdminErstellt: false,
      demoDatenGesetzt: false,
      anzahlBenutzer: 0,
    };
  }

  const demoHash = hashPasswort(DEMO_STANDARD_PASSWORT);
  for (const user of INITIALE_BENUTZER) {
    await repo.erstelleBenutzer(user, demoHash);
  }
  for (const team of INITIALE_TEAMS) {
    await repo.erstelleTeam(team);
  }
  for (const mitglied of INITIALE_MITGLIEDSCHAFTEN) {
    await repo.speichereMitgliedschaft(mitglied);
  }
  for (const einladung of INITIALE_EINLADUNGEN) {
    await repo.erstelleEinladung(einladung);
  }

  return {
    initialAdminErstellt: false,
    demoDatenGesetzt: true,
    anzahlBenutzer: INITIALE_BENUTZER.length,
  };
}
