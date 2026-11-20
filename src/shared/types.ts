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
  timestamp_ms: number;
  text: string;
  status: 'DRAFT' | 'PUBLISHED';
}

export interface Spielzug {
  play_number: number;
  sources: Record<string, PlayQuelle | null>;
  breakdown?: PlayBreakdown;
  notes?: CoachNotiz[];
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
  sharedWithTeams: string[];
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
