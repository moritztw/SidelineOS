export type TeamRolle = 'TEAM_ADMIN' | 'COACH' | 'PLAYER';

/**
 * Multi-Rollen-Profil: Eine Person kann gleichzeitig Sysadmin, Team Admin und Coach sein
 * ODER ausschließlich Sysadmin ohne Zugriff auf Team-Inhalte.
 */
export interface BenutzerProfil {
  id: string;
  label: string;
  teamRolle: TeamRolle | null;
  istSysadmin: boolean;
}

export type NavigationsAnsicht =
  | 'dashboard'
  | 'cut-sync'
  | 'film-room'
  | 'playlists'
  | 'settings'
  | 'sysadmin';

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

/** Erlaubt sowohl Standard-Spalten als auch Custom-Feld-Keys des Team Admins */
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
  /** Gespeicherte Definitionen (Wörterbuch); neue Coach-Eingaben werden automatisch ergänzt */
  definitionen?: string[];
}

export interface TeamKontext {
  id: string;
  name: string;
  saison: string;
  kurzname: string;
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
  /** -50 bis -1 = eigene Hälfte, +49 bis +1 = gegnerische Hälfte */
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
  /** Werte für vom Team Admin angelegte Custom-Felder */
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

export interface NormPunkt {
  /** Normalisiert 0.0 bis 1.0 relativ zur Videofläche */
  x: number;
  y: number;
}

export interface CanvasZeichnung {
  id: string;
  /** Eindeutige Bindung an das Video / den Kamerawinkel, in dem gezeichnet wurde */
  angle: string;
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
  /** Individuell gewählte Breakdown-Felder; leer = nur Videomaterial */
  freigegebeneFelder: BreakdownFeldKey[];
  geteiltAm: string;
}

export interface ShareDownloadLink {
  id: string;
  token: string;
  /** Relativer Pfad wie /share/sl-8f2a9c */
  pfad: string;
  bezeichnung: string;
  erstelltAm: string;
  /** ISO-Zeitstempel für automatischen Link-Ablauf */
  gueltigBis: string;
  freigegebeneFelder: BreakdownFeldKey[];
  aktiv: boolean;
}

export interface VideoReel {
  id: string;
  teamId: string;
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

export const DEMO_PROFILE: BenutzerProfil[] = [
  {
    id: 'profil-teamadmin-sysadmin',
    label: 'Team Admin + Sysadmin',
    teamRolle: 'TEAM_ADMIN',
    istSysadmin: true,
  },
  {
    id: 'profil-coach',
    label: 'Coach',
    teamRolle: 'COACH',
    istSysadmin: false,
  },
  {
    id: 'profil-player',
    label: 'Spieler',
    teamRolle: 'PLAYER',
    istSysadmin: false,
  },
  {
    id: 'profil-only-sysadmin',
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
