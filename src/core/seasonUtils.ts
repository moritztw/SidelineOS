import type { TeamKontext } from '../shared/types.ts';
export { ermittleEintragSaison, filtereNachSaison } from '../sdk/plugin.ts';

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
