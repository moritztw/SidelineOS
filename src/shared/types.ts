import type { UnterstuetzteSprache } from './i18n.ts';

export type PluginId = string;

/** Rollen auf Vereinsebene (#23). Ein CLUB_ADMIN ist unveränderlich TEAM_ADMIN in allen Teams seines Vereins. */
export type ClubRolle = 'CLUB_ADMIN' | 'CLUB_MEMBER';

/** Rollen auf Teamebene (sportartneutral). */
export type TeamRolle = 'TEAM_ADMIN' | 'STAFF' | 'MEMBER';

export type MitgliedschaftStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED';

/** Team-Lebenszyklus (#25): Archivierte Teams bleiben im Lesemodus erhalten. */
export type TeamStatus = 'ACTIVE' | 'ARCHIVED';

export type ScopeTyp = 'club' | 'team';

export interface BenutzerKonto {
  uuid: string;
  benutzername: string;
  vollerName: string;
  email: string;
  istSysadmin: boolean;
  preferredLocale: UnterstuetzteSprache;
  preferredTheme?: string;
  metadata: Record<string, unknown>;
  erstelltAm: string;
}

/** Speicherstatus eines Vereins-Speicherpools (#21, #22, #24). */
export interface ClubSpeicherStatus {
  nodeId: string;
  quotaBytes: number | null;
  usedBytes: number;
  softLimitPercent: number;
  auslastungProzent: number | null;
  softLimitErreicht: boolean;
  hardLimitErreicht: boolean;
}

export interface ClubKontext {
  id: string;
  slug: string;
  name: string;
  speicher: ClubSpeicherStatus;
  metadata: Record<string, unknown>;
  erstelltAm: string;
}

export interface TeamKontext {
  id: string;
  clubId: string;
  slug: string;
  name: string;
  status: TeamStatus;
  akzentFarbe: string;
  metadata: Record<string, unknown>;
  erstelltAm: string;
}

export interface ClubMitgliedschaft {
  id: string;
  userUuid: string;
  clubId: string;
  rolle: ClubRolle;
  status: MitgliedschaftStatus;
  beigetretenAm: string;
}

export interface TeamMitgliedschaft {
  id: string;
  userUuid: string;
  teamId: string;
  rolle: TeamRolle;
  /** Frei konfigurierbare Gruppen-/Tag-Slugs (z. B. "offense", "torhueter", "u19-kader"). */
  groups: string[];
  status: MitgliedschaftStatus;
  beigetretenAm: string;
}

export interface EffektiveTeamBerechtigung {
  clubId: string;
  teamId: string;
  clubRolle: ClubRolle | null;
  effektiveTeamRolle: TeamRolle | null;
  istKaskadiertVonClubAdmin: boolean;
  groups: string[];
  teamStatus: TeamStatus;
  istLesemodus: boolean;
}

export interface EinladungEintrag {
  id: string;
  clubId: string;
  teamId: string | null;
  clubRolle: ClubRolle;
  teamRolle: TeamRolle;
  groups: string[];
  zielEmail?: string;
  bestaetigungErforderlich: boolean;
  gueltigBis: string;
  aktiv: boolean;
  erstelltAm: string;
}

export interface OeffentlicheEinladungInfo {
  id: string;
  clubId: string;
  clubName: string;
  teamId: string | null;
  teamName: string | null;
  clubRolle: ClubRolle;
  teamRolle: TeamRolle;
  groups: string[];
  zielEmail?: string;
  bestaetigungErforderlich: boolean;
  gueltigBis: string;
}

export type NotificationPrioritaet = 'info' | 'warning' | 'urgent';

export interface NotificationEintrag {
  id: string;
  userUuid: string;
  clubId?: string;
  teamId?: string;
  sourcePluginId: string;
  eventType: string;
  title: string;
  message: string;
  linkPath?: string;
  priority: NotificationPrioritaet;
  metadata: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
}

/** Verbindliche Top-Level-Bereiche der 4-Ebenen-Navigation (#23). */
export type CoreBereich = 'hub' | 'modul' | 'account' | 'club-admin' | 'system-admin';

export type AppRouteModus =
  | { art: 'app' }
  | { art: 'login' }
  | { art: 'invite'; token: string }
  | { art: 'share'; token: string };

/**
 * Berechnet die Speicherpool-Auslastung eines Clubs (#24).
 */
export function berechneClubSpeicherStatus(params: {
  nodeId: string;
  quotaBytes: number | null;
  usedBytes: number;
  softLimitPercent: number;
}): ClubSpeicherStatus {
  const usedBytes = Math.max(0, Math.floor(params.usedBytes || 0));
  const quotaBytes =
    typeof params.quotaBytes === 'number' && Number.isFinite(params.quotaBytes) && params.quotaBytes > 0
      ? Math.floor(params.quotaBytes)
      : null;
  const softLimitPercent =
    Number.isFinite(params.softLimitPercent) && params.softLimitPercent >= 50 && params.softLimitPercent <= 99
      ? Math.floor(params.softLimitPercent)
      : 90;

  if (quotaBytes === null) {
    return {
      nodeId: params.nodeId || 'default',
      quotaBytes: null,
      usedBytes,
      softLimitPercent,
      auslastungProzent: null,
      softLimitErreicht: false,
      hardLimitErreicht: false,
    };
  }

  const prozent = Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10);
  return {
    nodeId: params.nodeId || 'default',
    quotaBytes,
    usedBytes,
    softLimitPercent,
    auslastungProzent: prozent,
    softLimitErreicht: prozent >= softLimitPercent,
    hardLimitErreicht: usedBytes >= quotaBytes,
  };
}

/**
 * Setzt die unveränderliche Rollenkaskade (#23) durch:
 * Ein aktiver CLUB_ADMIN ist automatisch TEAM_ADMIN in jedem Team seines Clubs.
 */
export function ermittleEffektiveTeamRolle(params: {
  clubMitgliedschaft: ClubMitgliedschaft | null;
  teamMitgliedschaft: TeamMitgliedschaft | null;
}): {
  clubRolle: ClubRolle | null;
  effektiveTeamRolle: TeamRolle | null;
  istKaskadiertVonClubAdmin: boolean;
  groups: string[];
} {
  const clubAktiv =
    params.clubMitgliedschaft?.status === 'ACTIVE' ? params.clubMitgliedschaft : null;
  const teamAktiv =
    params.teamMitgliedschaft?.status === 'ACTIVE' ? params.teamMitgliedschaft : null;

  if (clubAktiv?.rolle === 'CLUB_ADMIN') {
    return {
      clubRolle: 'CLUB_ADMIN',
      effektiveTeamRolle: 'TEAM_ADMIN',
      istKaskadiertVonClubAdmin: true,
      groups: teamAktiv?.groups ? [...teamAktiv.groups] : [],
    };
  }

  return {
    clubRolle: clubAktiv?.rolle ?? null,
    effektiveTeamRolle: teamAktiv?.rolle ?? null,
    istKaskadiertVonClubAdmin: false,
    groups: teamAktiv?.groups ? [...teamAktiv.groups] : [],
  };
}

export function holeTeamRollenLabel(rolle: TeamRolle, locale: UnterstuetzteSprache = 'de'): string {
  if (locale === 'en') {
    switch (rolle) {
      case 'TEAM_ADMIN':
        return 'Team Admin';
      case 'STAFF':
        return 'Staff / Coach';
      case 'MEMBER':
        return 'Member';
    }
  }
  switch (rolle) {
    case 'TEAM_ADMIN':
      return 'Team-Admin';
    case 'STAFF':
      return 'Trainer / Staff';
    case 'MEMBER':
      return 'Mitglied';
  }
}

export function holeClubRollenLabel(rolle: ClubRolle, locale: UnterstuetzteSprache = 'de'): string {
  if (locale === 'en') {
    return rolle === 'CLUB_ADMIN' ? 'Club Admin' : 'Club Member';
  }
  return rolle === 'CLUB_ADMIN' ? 'Vereinsadmin' : 'Vereinsmitglied';
}
