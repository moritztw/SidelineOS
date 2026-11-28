import crypto from 'node:crypto';
import fs from 'node:fs';
import type { CoreServerConfig } from './config.ts';
import type { CoreDatabaseClient } from './db/client.ts';
import { CoreRepository } from './db/coreRepository.ts';
import { hashPasswort } from './security.ts';

export interface BootstrapErgebnis {
  initialAdminErstellt: boolean;
  anzahlBenutzer: number;
}

const CORE_MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '001_core_v2.sql',
    sql: fs.readFileSync(new URL('./db/migrations/001_core_v2.sql', import.meta.url), 'utf8'),
  },
];

async function fuehreCoreMigrationenAus(db: CoreDatabaseClient): Promise<void> {
  for (const migration of CORE_MIGRATIONS) {
    await db.exec(migration.sql);
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
 * Führt Core-Schema-Migrationen v0.2.0 aus und legt bei gesetzten ENV-Variablen
 * den ersten Sysadmin an. Demo-Daten sind nicht mehr Teil des Cores (`npm run seed:dev`).
 */
export async function bootstrapCoreInstance(
  db: CoreDatabaseClient,
  config: CoreServerConfig
): Promise<BootstrapErgebnis> {
  await fuehreCoreMigrationenAus(db);

  const repo = new CoreRepository(db);
  const vorhandeneBenutzer = await repo.zaehleBenutzer();

  if (vorhandeneBenutzer === 0 && config.initialSysadmin) {
    await repo.erstelleBenutzer(
      {
        uuid: 'usr-sysadmin-init',
        benutzername: config.initialSysadmin.username,
        vollerName: 'System-Administrator',
        email: config.initialSysadmin.email,
        istSysadmin: true,
        preferredLocale: config.defaultLocale,
      },
      hashPasswort(config.initialSysadmin.password)
    );

    return {
      initialAdminErstellt: true,
      anzahlBenutzer: 1,
    };
  }

  return {
    initialAdminErstellt: false,
    anzahlBenutzer: vorhandeneBenutzer,
  };
}
