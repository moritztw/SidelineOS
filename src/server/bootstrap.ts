import fs from 'node:fs';
import {
  INITIALE_BENUTZER,
  INITIALE_EINLADUNGEN,
  INITIALE_MITGLIEDSCHAFTEN,
  INITIALE_TEAMS,
} from '../core/demoOrgData.ts';
import { DEMO_STANDARD_PASSWORT } from '../core/authService.ts';
import { OFFIZIELLER_PLUGIN_KATALOG } from '../core/pluginStoreCatalog.ts';
import type { CoreServerConfig } from './config.ts';
import type { CoreDatabaseClient } from './db/client.ts';
import { CoreRepository } from './db/coreRepository.ts';
import { hashPasswort } from './security.ts';

export interface BootstrapErgebnis {
  initialAdminErstellt: boolean;
  demoDatenGesetzt: boolean;
  anzahlBenutzer: number;
}

const CORE_MIGRATION_001 = fs.readFileSync(
  new URL('./db/migrations/001_core.sql', import.meta.url),
  'utf8'
);

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
  await db.exec(CORE_MIGRATION_001);

  const repo = new CoreRepository(db);

  // Store-Basisplugins idempotent registrieren
  for (const eintrag of OFFIZIELLER_PLUGIN_KATALOG) {
    const globalAn = config.enabledModules.includes(eintrag.manifest.id);
    await repo.registrierePlugin(eintrag, globalAn);
  }

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
