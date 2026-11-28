import { Archive, HardDrive, Users } from 'lucide-react';
import type { SessionClubDTO, SessionTeamDTO } from '../apiClient.ts';
import { formatiereBytes } from '../layout/SystemBanner.tsx';

interface ClubAdminHostProps {
  club: SessionClubDTO | null;
  clubTeams: SessionTeamDTO[];
  hatClubAdminPlugins: boolean;
}

/**
 * Schlanker Core-Host für `/admin/club/overview` (#23, #24, #25):
 * Zeigt Vereins-Metadaten, Team-Status (aktiv vs. archiviert) und gemeinsamen Speicherpool.
 * Die eigentliche Vereins-, Team-, Mitglieder- und Einladungsverwaltung liefert `SidelineOS-org-admin`.
 */
export function ClubAdminHost({
  club,
  clubTeams,
  hatClubAdminPlugins,
}: ClubAdminHostProps) {
  if (!club) {
    return (
      <div className="rounded-lg border border-sl-border bg-sl-surface p-6 text-xs text-sl-muted">
        Kein aktiver Verein im aktuellen Benutzerkontext ausgewählt.
      </div>
    );
  }

  const aktiveTeams = clubTeams.filter((t) => t.status === 'ACTIVE');
  const archivierteTeams = clubTeams.filter((t) => t.status === 'ARCHIVED');
  const { speicher } = club;
  const balkenBreite = Math.min(100, speicher.auslastungProzent ?? 0);

  return (
    <section className="max-w-4xl space-y-6">
      <header className="border-b border-sl-border pb-4">
        <h1 className="font-display text-lg font-semibold text-sl-heading">{club.name}</h1>
        <p className="mt-1 text-xs text-sl-muted">
          Vereinsübersicht · Rolle: <span className="font-mono text-sl-primary">{club.clubRolle}</span>
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-sl-border bg-sl-surface p-4">
          <div className="flex items-center gap-2 text-xs text-sl-muted">
            <Users className="h-3.5 w-3.5 text-sl-accent" aria-hidden="true" />
            <span>Aktive Teams</span>
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-sl-heading tabular-nums">
            {aktiveTeams.length}
          </div>
        </div>

        <div className="rounded-lg border border-sl-border bg-sl-surface p-4">
          <div className="flex items-center gap-2 text-xs text-sl-muted">
            <Archive className="h-3.5 w-3.5 text-sl-subtle" aria-hidden="true" />
            <span>Archivierte Teams</span>
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-sl-heading tabular-nums">
            {archivierteTeams.length}
          </div>
        </div>

        <div className="rounded-lg border border-sl-border bg-sl-surface p-4">
          <div className="flex items-center gap-2 text-xs text-sl-muted">
            <HardDrive className="h-3.5 w-3.5 text-sl-accent" aria-hidden="true" />
            <span>Storage-Node</span>
          </div>
          <div className="mt-2 font-mono text-sm font-semibold text-sl-heading">
            {speicher.nodeId}
          </div>
        </div>
      </div>

      {/* Gemeinsamer Vereins-Speicherpool (#24) */}
      <div className="rounded-lg border border-sl-border bg-sl-surface p-5 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-sl-heading">Vereins-Speicherpool</h2>
          <span className="font-mono text-xs text-sl-primary tabular-nums">
            {formatiereBytes(speicher.usedBytes)} /{' '}
            {speicher.quotaBytes !== null ? formatiereBytes(speicher.quotaBytes) : 'Unbegrenzt'}
            {speicher.auslastungProzent !== null ? ` (${speicher.auslastungProzent} %)` : ''}
          </span>
        </div>

        {speicher.quotaBytes !== null && (
          <div className="h-2 w-full overflow-hidden rounded-sm bg-sl-canvas">
            <div
              className={`h-full transition-all ${
                speicher.hardLimitErreicht
                  ? 'bg-sl-danger'
                  : speicher.softLimitErreicht
                    ? 'bg-sl-accent'
                    : 'bg-sl-success'
              }`}
              style={{ width: `${balkenBreite}%` }}
            />
          </div>
        )}

        <p className="text-xs text-sl-muted">
          Alle Teams dieses Vereins teilen sich diesen Pool. Ab {speicher.softLimitPercent} % wird
          ein Warnbanner angezeigt; bei 100 % werden neue Uploads automatisch gestoppt, während
          Downloads und Lesefunktionen offen bleiben.
        </p>
      </div>

      {!hatClubAdminPlugins && (
        <div className="rounded-lg border border-sl-border bg-sl-surface p-5 text-xs leading-relaxed text-sl-muted">
          Für die vollständige Verwaltung von Teams, Vereinsmitgliedern, Rollen, Gruppen und
          Einladungslinks installiere das System-Plugin{' '}
          <span className="font-mono text-sl-primary">SidelineOS-org-admin</span>.
        </div>
      )}
    </section>
  );
}
