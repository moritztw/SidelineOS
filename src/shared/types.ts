export type TeamRolle = 'TEAM_ADMIN' | 'COACH' | 'PLAYER';

export type SpielerUnit = 'OFFENSE' | 'DEFENSE' | 'SPECIAL_TEAMS';

export type ModulId = 'video-analysis' | 'playbook' | 'roster-attendance';

export type CoreBereich =
  | 'hub'
  | 'settings-hub'
  | 'modul'
  | 'settings'
  | 'team-settings'
  | 'sysadmin';

export type VideoModulTab = 'dashboard' | 'cut-sync' | 'film-room' | 'playlists';

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
}

export interface SmtpKonfiguration {
  host: string;
  port: number;
  absender: string;
  benutzer: string;
  tlsAktiv: boolean;
}

export type ReelKategorie = 'GAME' | 'PRACTICE' | 'SCOUTING' | 'SELF_SCOUT' | 'CUSTOM';

export type SpielerFreigabe =
  | 'COACHES_ONLY'
  | 'ALL_PLAYERS'
  | 'UNIT_OFFENSE'
  | 'UNIT_DEFENSE'
  | 'UNIT_SPECIAL_TEAMS';

export type QuellModus = 'CLIP_FILE' | 'TIME_SLICE';

export type OdkWert = 'O' | 'D' | 'K';
export type HashWert = 'L' | 'M' | 'R';
export type RichtungsWert = 'L' | 'R' | 'M';
export type DefStaerkeWert = 'L' | 'R';
export type PlayTyp = 'RUN' | 'PASS' | 'SPECIAL' | 'PENALTY';

export type StandardBreakdownFeldKey =
  | 'odk'
  | 'down'
  | 'distance'
  | 'yard_line'
  | 'hash'
  | 'play_type'
  | 'off_pers'
  | 'off_form'
  | 'off_strg'
  | 'backfield'
  | 'motion'
  | 'off_play'
  | 'rpo'
  | 'play_dir'
  | 'result'
  | 'gn_ls'
  | 'def_str'
  | 'def_front'
  | 'def_pers'
  | 'coverage'
  | 'stunt'
  | 'blitz';

export type BreakdownFeldKey = StandardBreakdownFeldKey | (string & {});

export type TagFeldTyp = 'select' | 'combobox' | 'number' | 'text';

export interface TagFeldKonfig {
  key: BreakdownFeldKey;
  label: string;
  kurz: string;
  gruppe: 'SITUATION' | 'OFFENSE' | 'RESULT' | 'DEFENSE' | 'CUSTOM';
  typ: TagFeldTyp;
  aktiv: boolean;
  istCustom?: boolean;
  definitionen?: string[];
}

export interface TeamKontext {
  id: string;
  name: string;
  kurzname: string;
  /** Aktuelle Saison des langlebigen Teams (alte Saisons bleiben abrufbar) */
  aktiveSaison: string;
  saisons: string[];
  primaerFarbe?: string;
  aktivierteModule: ModulId[];
  customProfilFelder: ProfilCustomFeld[];
}

export interface PlayQuelle {
  file: string;
  source_mode?: QuellModus;
  start_ms: number;
  end_ms: number;
  /** Optionaler Zeitversatz in ms relativ zum Master-Winkel (Standard: nicht gesetzt / 0) */
  offset_ms?: number;
}

export interface PlayBreakdown {
  odk?: OdkWert;
  down?: 1 | 2 | 3 | 4;
  distance?: number;
  yard_line?: number;
  hash?: HashWert;
  play_type?: PlayTyp;
  off_pers?: string;
  off_form?: string;
  off_strg?: RichtungsWert;
  backfield?: string;
  motion?: string;
  off_play?: string;
  rpo?: string;
  play_dir?: RichtungsWert;
  result?: string;
  gn_ls?: number;
  def_str?: DefStaerkeWert;
  def_front?: string;
  def_pers?: string;
  coverage?: string;
  stunt?: string;
  blitz?: string;
  custom?: Record<string, string | number | undefined>;
}

export interface CoachNotiz {
  id?: string;
  timestamp_ms: number;
  text: string;
  status: 'DRAFT' | 'PUBLISHED';
  autorRolle?: 'COACH' | 'PLAYER';
}

export type ZeichenWerkzeug = 'select' | 'pen' | 'arrow' | 'spotlight' | 'text';
export type ZeichnungsTyp = 'pen' | 'arrow' | 'spotlight' | 'text';
export type KommentarEcke = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type HotkeyAktion =
  | 'select'
  | 'pen'
  | 'arrow'
  | 'spotlight'
  | 'text'
  | 'undo'
  | 'toggleDrawBar'
  | 'toggleFullscreen'
  | 'switchAngle';

export type BenutzerHotkeys = Record<HotkeyAktion, string>;

export interface NutzerEinstellungen {
  hotkeys: BenutzerHotkeys;
  standardKommentarEcke: KommentarEcke;
  standardAutoStop: boolean;
  standardGeschwindigkeit: 0.5 | 1 | 1.5;
}

export interface NormPunkt {
  x: number;
  y: number;
}

export interface CanvasZeichnung {
  id: string;
  /** Bindung an den Kamerawinkel / das konkrete Video */
  angle: string;
  /** Exakter Frame-Zeitstempel (quantisiert auf FRAME_MS) */
  timestamp_ms: number;
  werkzeug: ZeichnungsTyp;
  farbe: string;
  punkte: NormPunkt[];
  text?: string;
  status: 'DRAFT' | 'PUBLISHED';
}

export interface Spielzug {
  play_number: number;
  sources: Record<string, PlayQuelle | null>;
  breakdown?: PlayBreakdown;
  notes?: CoachNotiz[];
  drawings?: CanvasZeichnung[];
}

export interface TeamFreigabeEintrag {
  teamName: string;
  freigegebeneFelder: BreakdownFeldKey[];
  geteiltAm: string;
}

export interface ShareDownloadLink {
  id: string;
  token: string;
  pfad: string;
  bezeichnung: string;
  erstelltAm: string;
  gueltigBis: string;
  freigegebeneFelder: BreakdownFeldKey[];
  aktiv: boolean;
}

export interface VideoReel {
  id: string;
  teamId: string;
  /** Zugeordnete Saison (z. B. "2026" oder "2025"; Standard: Jahr aus eventDate) */
  saison?: string;
  title: string;
  category: ReelKategorie;
  eventDate: string;
  thumbnailUrl: string;
  angles: string[];
  sourceMode: QuellModus;
  playCount: number;
  taggedCount: number;
  visibility: SpielerFreigabe;
  teamFreigaben: TeamFreigabeEintrag[];
  shareLinks: ShareDownloadLink[];
  receivedFromTeam?: string;
  draftNoteCount: number;
  plays: Spielzug[];
}

export interface SidelineBundleV1 {
  schema_version: '1.0';
  reel: {
    title: string;
    category: ReelKategorie;
    event_date: string;
    visibility?: SpielerFreigabe;
  };
  angles: string[];
  plays: Spielzug[];
}

export interface ValidierungsErgebnis {
  ok: boolean;
  bundle?: SidelineBundleV1;
  fehler: string[];
  hinweise: string[];
}

export const KATEGORIE_LABELS: Record<ReelKategorie, string> = {
  GAME: 'Spiel',
  PRACTICE: 'Training',
  SCOUTING: 'Scouting',
  SELF_SCOUT: 'Self-Scout',
  CUSTOM: 'Sonstiges',
};

export const FREIGABE_LABELS: Record<SpielerFreigabe, string> = {
  COACHES_ONLY: 'Nur Coaches',
  ALL_PLAYERS: 'Alle Spieler',
  UNIT_OFFENSE: 'Offense',
  UNIT_DEFENSE: 'Defense',
  UNIT_SPECIAL_TEAMS: 'Special Teams',
};

export const TEAM_ROLLEN_LABELS: Record<TeamRolle, string> = {
  TEAM_ADMIN: 'Team Admin',
  COACH: 'Coach',
  PLAYER: 'Spieler',
};

export const SPIELER_UNIT_LABELS: Record<SpielerUnit, string> = {
  OFFENSE: 'Offense',
  DEFENSE: 'Defense',
  SPECIAL_TEAMS: 'Special Teams',
};

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

export const BASIS_TAGGING_FELDER: BreakdownFeldKey[] = [
  'odk',
  'down',
  'distance',
  'yard_line',
  'hash',
  'play_type',
];
