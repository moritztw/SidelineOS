export type BenutzerRolle = 'COACH' | 'PLAYER' | 'SYSADMIN';

export type NavigationsAnsicht =
  | 'dashboard'
  | 'cut-sync'
  | 'film-room'
  | 'playlists'
  | 'settings';

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
export type PlayTyp = 'RUN' | 'PASS' | 'SPECIAL' | 'PENALTY';

export type BreakdownFeldKey =
  | 'odk'
  | 'down'
  | 'distance'
  | 'yard_line'
  | 'hash'
  | 'play_type'
  | 'off_form'
  | 'def_front'
  | 'coverage'
  | 'result'
  | 'gn_ls';

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
  yard_line?: number;
  hash?: HashWert;
  play_type?: PlayTyp;
  off_form?: string;
  def_front?: string;
  coverage?: string;
  result?: string;
  gn_ls?: number;
}

export interface CoachNotiz {
  id?: string;
  timestamp_ms: number;
  text: string;
  status: 'DRAFT' | 'PUBLISHED';
  autorRolle?: 'COACH' | 'PLAYER';
}

export type ZeichenWerkzeug = 'pen' | 'arrow' | 'spotlight' | 'text';

export interface NormPunkt {
  /** Normalisiert 0.0 bis 1.0 relativ zur Videofläche */
  x: number;
  y: number;
}

export interface CanvasZeichnung {
  id: string;
  timestamp_ms: number;
  werkzeug: ZeichenWerkzeug;
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

export const BREAKDOWN_FELD_META: Array<{ key: BreakdownFeldKey; label: string; kurz: string }> = [
  { key: 'odk', label: 'ODK (Off/Def/Kick)', kurz: 'ODK' },
  { key: 'down', label: 'Down', kurz: 'DN' },
  { key: 'distance', label: 'Distance', kurz: 'DIST' },
  { key: 'yard_line', label: 'Yard Line', kurz: 'YD LN' },
  { key: 'hash', label: 'Hash', kurz: 'HASH' },
  { key: 'play_type', label: 'Play Type', kurz: 'PLAY TYPE' },
  { key: 'off_form', label: 'Offense Formation', kurz: 'OFF FORM' },
  { key: 'def_front', label: 'Defense Front', kurz: 'DEF FRONT' },
  { key: 'coverage', label: 'Coverage', kurz: 'COVERAGE' },
  { key: 'result', label: 'Result', kurz: 'RESULT' },
  { key: 'gn_ls', label: 'Gain / Loss', kurz: 'GN/LS' },
];

export const BASIS_TAGGING_FELDER: BreakdownFeldKey[] = [
  'odk',
  'down',
  'distance',
  'yard_line',
  'hash',
  'play_type',
];

export const ALLE_TAGGING_FELDER: BreakdownFeldKey[] = BREAKDOWN_FELD_META.map((f) => f.key);
