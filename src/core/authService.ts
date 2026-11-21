import type {
  AppRouteModus,
  BenutzerKonto,
  BenutzerProfil,
  TeamEinladung,
  TeamMitgliedschaft,
} from '../shared/types.ts';

export const DEMO_STANDARD_PASSWORT = 'sideline-demo';

/**
 * Parst Browser-Pfade (`/login`, `/invite/<token>`, `/share/<token>`) in typsichere App-Routen.
 */
export function parseAppRouteAusPfad(pathname: string): AppRouteModus {
  const bereinigt = pathname.trim().replace(/\/+$/, '') || '/';
  if (bereinigt === '/login') {
    return { art: 'login' };
  }
  const inviteMatch = bereinigt.match(/^\/invite\/([^/]+)$/);
  if (inviteMatch && inviteMatch[1]) {
    return { art: 'invite', token: decodeURIComponent(inviteMatch[1]) };
  }
  const shareMatch = bereinigt.match(/^\/share\/([^/]+)$/);
  if (shareMatch && shareMatch[1]) {
    return { art: 'share', token: decodeURIComponent(shareMatch[1]) };
  }
  return { art: 'app' };
}

export interface EinladungsPruefung {
  ok: boolean;
  status: 'VALID' | 'NOT_FOUND' | 'REVOKED' | 'EXPIRED';
  einladung?: TeamEinladung;
  fehler?: string;
}

/**
 * Validiert einen Einladungs-Token auf Existenz, Aktiv-Status und Ablaufdatum.
 */
export function pruefeEinladungsToken(
  einladungen: readonly TeamEinladung[],
  token: string,
  referenzDatum: Date = new Date()
): EinladungsPruefung {
  const bereinigt = token.trim();
  const treffer = einladungen.find((e) => e.token === bereinigt);
  if (!treffer) {
    return {
      ok: false,
      status: 'NOT_FOUND',
      fehler: 'Dieser Einladungslink ist ungültig oder existiert nicht mehr.',
    };
  }
  if (!treffer.aktiv) {
    return {
      ok: false,
      status: 'REVOKED',
      einladung: treffer,
      fehler: 'Diese Einladung wurde vom Team Admin widerrufen.',
    };
  }
  const heuteIso = referenzDatum.toISOString().slice(0, 10);
  if (treffer.gueltigBis < heuteIso) {
    return {
      ok: false,
      status: 'EXPIRED',
      einladung: treffer,
      fehler: `Diese Einladung ist am ${treffer.gueltigBis} abgelaufen.`,
    };
  }
  return {
    ok: true,
    status: 'VALID',
    einladung: treffer,
  };
}

/**
 * Authentifiziert einen Benutzer anhand von E-Mail oder Benutzername und Passwort.
 */
export function authentifiziereBenutzer(
  benutzerListe: readonly BenutzerKonto[],
  passwoerter: ReadonlyMap<string, string>,
  kennung: string,
  passwort: string
): { ok: boolean; benutzer?: BenutzerKonto; fehler?: string } {
  const norm = kennung.trim().toLowerCase();
  if (!norm || !passwort) {
    return {
      ok: false,
      fehler: 'Bitte Benutzername oder E-Mail sowie Passwort eingeben.',
    };
  }
  const treffer = benutzerListe.find(
    (b) => b.email.toLowerCase() === norm || b.benutzername.toLowerCase() === norm
  );
  if (!treffer) {
    return {
      ok: false,
      fehler: 'Anmeldedaten ungültig. Bitte Eingabe prüfen.',
    };
  }
  const erwartetesPasswort = passwoerter.get(treffer.uuid) ?? DEMO_STANDARD_PASSWORT;
  if (passwort !== erwartetesPasswort) {
    return {
      ok: false,
      fehler: 'Anmeldedaten ungültig. Bitte Eingabe prüfen.',
    };
  }
  return { ok: true, benutzer: treffer };
}

/**
 * Leitet aus einem Benutzerkonto und dessen aktiver Team-Mitgliedschaft ein BenutzerProfil ab.
 */
export function ermittleProfilAusKonto(
  benutzer: BenutzerKonto,
  aktivesTeamId: string,
  mitgliedschaften: readonly TeamMitgliedschaft[]
): BenutzerProfil {
  const aktiveMitgliedschaft =
    mitgliedschaften.find(
      (m) => m.userUuid === benutzer.uuid && m.teamId === aktivesTeamId && m.status === 'AKTIV'
    ) ??
    mitgliedschaften.find((m) => m.userUuid === benutzer.uuid && m.status === 'AKTIV') ??
    null;

  return {
    id: `auth-${benutzer.uuid}`,
    userUuid: benutzer.uuid,
    label: benutzer.vollerName,
    teamRolle: aktiveMitgliedschaft ? aktiveMitgliedschaft.rolle : null,
    istSysadmin: benutzer.istSysadmin,
  };
}
