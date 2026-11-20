import { Check, Share2, X } from 'lucide-react';
import type { VideoReel } from '../../../shared/types.ts';
import { VERFUEGBARE_TAUSCH_TEAMS } from '../data/demoReels.ts';

interface TeamShareModalProps {
  reel: VideoReel;
  onSchliessen: () => void;
  onTeilenAendern: (reelId: string, teams: string[]) => void;
}

export function TeamShareModal({ reel, onSchliessen, onTeilenAendern }: TeamShareModalProps) {
  const toggleTeam = (teamName: string) => {
    const existiert = reel.sharedWithTeams.includes(teamName);
    const aktualisiert = existiert
      ? reel.sharedWithTeams.filter((t) => t !== teamName)
      : [...reel.sharedWithTeams, teamName];
    onTeilenAendern(reel.id, aktualisiert);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-share-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-[#232933] bg-[#13171D] p-6">
        <div className="flex items-start justify-between gap-4 border-b border-[#232933] pb-4">
          <div className="flex items-center gap-2.5">
            <Share2 className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <h2 id="team-share-title" className="text-base font-semibold text-white">
              Team-zu-Team Austausch
            </h2>
          </div>
          <button
            type="button"
            onClick={onSchliessen}
            aria-label="Dialog schließen"
            className="rounded p-1 text-[#8B949E] transition-colors hover:bg-[#1E2530] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="text-sm text-[#E6EDF3]">{reel.title}</div>
          <p className="text-xs leading-relaxed text-[#8B949E]">
            Nur das Videomaterial wird mit den ausgewählten Teams auf dieser Instanz geteilt. Deine
            Breakdowns, Play-Calls, Zeichnungen und Coach-Notizen bleiben strikt privat.
          </p>

          <div className="space-y-2">
            {VERFUEGBARE_TAUSCH_TEAMS.map((teamName) => {
              const aktiv = reel.sharedWithTeams.includes(teamName);
              return (
                <button
                  key={teamName}
                  type="button"
                  onClick={() => toggleTeam(teamName)}
                  className={`flex w-full items-center justify-between rounded-md border px-3.5 py-2.5 text-left text-sm transition-colors ${
                    aktiv
                      ? 'border-[#F59E0B]/60 bg-[#F59E0B]/10 text-white'
                      : 'border-[#232933] bg-[#0B0E11] text-[#E6EDF3] hover:border-[#36404F]'
                  }`}
                >
                  <span>{teamName}</span>
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      aktiv
                        ? 'border-[#F59E0B] bg-[#F59E0B] text-[#0B0E11]'
                        : 'border-[#36404F] bg-transparent'
                    }`}
                  >
                    {aktiv && <Check className="h-3 w-3" aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-[#232933] pt-4">
          <button
            type="button"
            onClick={onSchliessen}
            className="rounded-md bg-[#F59E0B] px-4 py-2 text-xs font-semibold text-[#0B0E11] transition-colors hover:bg-[#FBBF24]"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}
