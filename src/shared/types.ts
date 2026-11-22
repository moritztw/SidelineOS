import type { UnterstuetzteSprache } from './i18n.ts';

export type TeamRolle = 'TEAM_ADMIN' | 'COACH' | 'PLAYER';

export type SpielerUnit = 'OFFENSE' | 'DEFENSE' | 'SPECIAL_TEAMS';

/** Eindeutige Plugin-ID eines installierten Moduls (z. B. "video-analysis") */
export type PluginId = string;

export type CoreBereich =
  | 'hub'
  | 'settings-hub'
  | 'modul'
  | 'settings'
  | 'team-settings'
  | 'sysadmin';

export type AppRouteModus =
  | { art: 'app' }
  | { art: 'login' }
  | { art: 'invite'; token: string }
  | { art: 'share'; token: string };

/**
 * Angemeldetes Benutzerkonto (echte Berechtigungen).
 * Ein Konto kann mehrere Rollen gleichzeitig besitzen (z. B. Sysadmin + Team Admin).
 */
export interface BenutzerProfil {
  id: string;
  userUuid: string;
  label: string;
  teamRolle: TeamRolle | null;
  istSysadmin: boolean;
}

export interface ProfilCustomFeld {
  key: string;
  label: string;
  typ: 'text' | 'number' | 'select';
  pflicht?: boolean;
  optionen?: string[];
}

/**
 * Globales Benutzerkonto (unabhängig von einzelnen Teams – vorbereitet für späteren Server-/Team-Umzug).
 */
export interface BenutzerKonto {
  uuid: string;
  benutzername: string;
  vollerName: string;
  email: string;
  telefon?: string;
  trikotNummer?: string;
  position?: string;
  istSysadmin: boolean;
  erstelltAm: string;
  preferredLocale?: UnterstuetzteSprache;
  customProfilWerte: Record<string, string>;
}

/**
 * Team-Mitgliedschaft (trennt Benutzerkonto von der Team-Zugehörigkeit).
 */
export interface TeamMitgliedschaft {
  id: string;
  userUuid: string;
  teamId: string;
  rolle: TeamRolle;
  units: SpielerUnit[];
  status: 'AKTIV' | 'WARTET_AUF_FREIGABE';
  beigetretenAm: string;
}

export interface TeamEinladung {
  id: string;
  teamId: string;
  typ: 'EMAIL' | 'TEAM_LINK';
  zielEmail?: string;
  rolle: TeamRolle;
  units: SpielerUnit[];
  token: string;
  pfad: string;
  erstelltAm: string;
  gueltigBis: string;
  bestaetigungErforderlich: boolean;
  aktiv: boolean;
}

export interface S3Konfiguration {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  forcePathStyle: boolean;
  cleanupRetentionDays?: number;
  hatSecretKey?: boolean;
  konfiguriert?: boolean;
}

export interface SmtpKonfiguration {
  host: string;
  port: number;
  absender: string;
  benutzer: string;
  tlsAktiv: boolean;
  hatPasswort?: boolean;
  konfiguriert?: boolean;
}

export interface TeamKontext {
  id: string;
  name: string;
  kurzname: string;
  /** Aktuelle Saison des dauerhaft bestehenden Teams (alte Saisons bleiben abrufbar) */
  aktiveSaison: string;
  saisons: string[];
  primaerFarbe?: string;
  aktivierteModule: PluginId[];
  customProfilFelder: ProfilCustomFeld[];
}

export const TEAM_ROLLEN_LABELS: Record<TeamRolle, string> = {
  TEAM_ADMIN: 'Team Admin',
  COACH: 'Coach',
  PLAYER: 'Spieler',
};

export const TEAM_ROLLEN_LABELS_I18N: Record<UnterstuetzteSprache, Record<TeamRolle, string>> = {
  de: TEAM_ROLLEN_LABELS,
  en: {
    TEAM_ADMIN: 'Team Admin',
    COACH: 'Coach',
    PLAYER: 'Player',
  },
};

export const SPIELER_UNIT_LABELS: Record<SpielerUnit, string> = {
  OFFENSE: 'Offense',
  DEFENSE: 'Defense',
  SPECIAL_TEAMS: 'Special Teams',
};

export const SPIELER_UNIT_LABELS_I18N: Record<UnterstuetzteSprache, Record<SpielerUnit, string>> = {
  de: SPIELER_UNIT_LABELS,
  en: SPIELER_UNIT_LABELS,
};

export function holeRollenLabel(rolle: TeamRolle, locale?: string): string {
  const code: UnterstuetzteSprache = locale === 'en' ? 'en' : 'de';
  return TEAM_ROLLEN_LABELS_I18N[code][rolle];
}

export function holeUnitLabel(unit: SpielerUnit, locale?: string): string {
  const code: UnterstuetzteSprache = locale === 'en' ? 'en' : 'de';
  return SPIELER_UNIT_LABELS_I18N[code][unit];
}

export const DEMO_PROFILE: BenutzerProfil[] = [
  {
    id: 'profil-teamadmin-sysadmin',
    userUuid: 'usr-0001-headcoach',
    label: 'Team Admin + Sysadmin',
    teamRolle: 'TEAM_ADMIN',
    istSysadmin: true,
  },
  {
    id: 'profil-coach',
    userUuid: 'usr-0002-oc',
    label: 'Coach',
    teamRolle: 'COACH',
    istSysadmin: false,
  },
  {
    id: 'profil-player',
    userUuid: 'usr-0003-wr',
    label: 'Spieler',
    teamRolle: 'PLAYER',
    istSysadmin: false,
  },
  {
    id: 'profil-only-sysadmin',
    userUuid: 'usr-0004-sysop',
    label: 'Nur Sysadmin',
    teamRolle: null,
    istSysadmin: true,
  },
];
