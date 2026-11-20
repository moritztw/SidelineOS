import type { TeamKontext, VideoReel } from '../shared/types.ts';

/**
 * Ermittelt die zugehörige Saison eines Reels.
 * Nutzt das explizite Feld `saison` oder leitet das Jahr aus `eventDate` ab.
 */
export function ermittleReelSaison(reel: Pick<VideoReel, 'saison' | 'eventDate'>): string {
  const explizit = reel.saison?.trim();
  if (explizit) return explizit;
  return reel.eventDate.slice(0, 4);
}

/**
 * Filtert Reels nach einer konkreten Saison (z. B. "2026" oder "2025").
 * Der Wert "ALL" liefert alle Saisons ungefiltert zurück.
 */
export function filtereReelsNachSaison(reels: VideoReel[], saison: string): VideoReel[] {
  if (!saison || saison === 'ALL') return reels;
  return reels.filter((reel) => ermittleReelSaison(reel) === saison);
}

/**
 * Startet eine neue Saison für ein dauerhaft bestehendes Team,
 * ohne das Team neu anzulegen oder ältere Saisons zu verlieren.
 */
export function fuegeNeueSaisonHinzu(team: TeamKontext, neueSaison: string): TeamKontext {
  const bereinigt = neueSaison.trim();
  if (!bereinigt) return team;

  const bereitsVorhanden = team.saisons.includes(bereinigt);
  const aktualisierteSaisons = bereitsVorhanden
    ? team.saisons
    : [...team.saisons, bereinigt].sort((a, b) => b.localeCompare(a));

  return {
    ...team,
    aktiveSaison: bereinigt,
    saisons: aktualisierteSaisons,
  };
}
