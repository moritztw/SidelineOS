import { AlertTriangle, Archive } from 'lucide-react';
import type { SessionClubDTO, SessionTeamDTO } from '../apiClient.ts';

interface SystemBannerProps {
  club: SessionClubDTO | null;
  team: SessionTeamDTO | null;
  onClubSpeicherOeffnen?: () => void;
}

export function formatiereBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KiB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MiB`;
  return `${(mb / 1024).toFixed(2)} GiB`;
}

/**
 * Globaler Core-System-Banner unterhalb der TopBar:
 * - #24: 90 %-Soft-Limit Warnung & 100 %-Hard-Limit Upload-Stopp für Club-/Team-Admins.
 * - #25: Hinweis auf aktiven Lesemodus bei archivierten Teams.
 */
export function SystemBanner({ club, team, onClubSpeicherOeffnen }: SystemBannerProps) {
  const istAdmin =
    club?.clubRolle === 'CLUB_ADMIN' || team?.effektiveTeamRolle === 'TEAM_ADMIN';

  const zeigeSpeicherWarnung =
    Boolean(istAdmin && club && (club.speicher.softLimitErreicht || club.speicher.hardLimitErreicht));
  const zeigeArchivHinweis = team?.status === 'ARCHIVED';

  if (!zeigeSpeicherWarnung && !zeigeArchivHinweis) return null;

  return (
    <div className="border-b border-sl-border bg-sl-surface">
      <div className="mx-auto flex max-w-[1440px] flex-col divide-y divide-sl-border px-4 sm:px-6">
        {zeigeSpeicherWarnung && club && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle
                className={`h-4 w-4 shrink-0 ${
                  club.speicher.hardLimitErreicht ? 'text-sl-danger-text' : 'text-sl-accent'
                }`}
                aria-hidden="true"
              />
              <span className="text-sl-primary">
                {club.speicher.hardLimitErreicht ? (
                  <>
                    <strong className="font-semibold text-sl-danger-text">
                      Speicherlimit erreicht (100 % · Upload-Stopp):
                    </strong>{' '}
                    Neue Uploads für {club.name} sind gesperrt; Lese- und Analysefunktionen bleiben verfügbar.
                  </>
                ) : (
                  <>
                    <strong className="font-semibold text-sl-warning-text">
                      Vereins-Speicherpool bei{' '}
                      <span className="font-mono tabular-nums">
                        {club.speicher.auslastungProzent ?? club.speicher.softLimitPercent} %
                      </span>
                      :
                    </strong>{' '}
                    <span className="font-mono tabular-nums">
                      {formatiereBytes(club.speicher.usedBytes)} /{' '}
                      {formatiereBytes(club.speicher.quotaBytes ?? 0)}
                    </span>{' '}
                    belegt.
                  </>
                )}
              </span>
            </div>
            {onClubSpeicherOeffnen && (
              <button
                type="button"
                onClick={onClubSpeicherOeffnen}
                className="text-xs font-medium text-sl-accent hover:text-sl-accent-hover whitespace-nowrap"
              >
                Speicher prüfen
              </button>
            )}
          </div>
        )}

        {zeigeArchivHinweis && team && (
          <div role="status" className="flex items-center gap-2.5 py-2 text-xs text-sl-muted">
            <Archive className="h-3.5 w-3.5 shrink-0 text-sl-subtle" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-sl-primary">Archiv-Lesemodus:</strong>{' '}
              Das Team „{team.name}“ ist archiviert. Historische Inhalte bleiben lesbar, Änderungen und Uploads sind gesperrt.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
