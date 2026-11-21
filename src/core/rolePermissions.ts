import type { BenutzerProfil, TeamRolle } from '../shared/types.ts';

/**
 * Liefert alle Team-Ansichten, in die ein angemeldetes Konto wechseln darf:
 * - Team Admin -> Team Admin, Coach, Spieler
 * - Coach      -> Coach, Spieler
 * - Spieler    -> nur Spieler (kein Umschalter nötig)
 * - Nur Sysadmin -> keine Team-Ansicht
 */
export function ermittleWaehlbareTeamAnsichten(konto: BenutzerProfil): TeamRolle[] {
  if (konto.teamRolle === 'TEAM_ADMIN') {
    return ['TEAM_ADMIN', 'COACH', 'PLAYER'];
  }
  if (konto.teamRolle === 'COACH') {
    return ['COACH', 'PLAYER'];
  }
  if (konto.teamRolle === 'PLAYER') {
    return ['PLAYER'];
  }
  return [];
}

/**
 * Prüft, ob der produktive Ansichts-Umschalter für das Konto angezeigt werden soll
 * (nur wenn das Konto mindestens eine untergeordnete Ansicht besitzt).
 */
export function darfAnsichtWechseln(konto: BenutzerProfil): boolean {
  return ermittleWaehlbareTeamAnsichten(konto).length > 1;
}
