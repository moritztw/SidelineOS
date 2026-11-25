import { ArrowLeft, ArrowRight, Server, Sliders, Users } from 'lucide-react';
import type {
  BenutzerKonto,
  BenutzerProfil,
  CoreBereich,
  TeamKontext,
  TeamRolle,
} from '../../shared/types.ts';
import { holeRollenLabel } from '../../shared/types.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface SettingsHubViewProps {
  team: TeamKontext;
  benutzer: BenutzerKonto | null;
  konto: BenutzerProfil;
  aktiveTeamAnsicht: TeamRolle | null;
  ausstehendeAnfragenAnzahl: number;
  ausstehendeUpdatesAnzahl?: number;
  onBereichOeffnen: (bereich: CoreBereich) => void;
}

/**
 * Zentrale Einstellungs-Übersichtsseite hinter der Kachel "Einstellungen".
 * Zeigt ausschließlich die Einstellungsbereiche an, für die der Benutzer berechtigt ist.
 */
export function SettingsHubView({
  team,
  benutzer,
  konto,
  aktiveTeamAnsicht,
  ausstehendeAnfragenAnzahl,
  ausstehendeUpdatesAnzahl = 0,
  onBereichOeffnen,
}: SettingsHubViewProps) {
  const { locale, t } = useI18n();
  const hatTeamZugriff = aktiveTeamAnsicht !== null;
  const istTeamAdmin = aktiveTeamAnsicht === 'TEAM_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          {hatTeamZugriff && (
            <button
              type="button"
              onClick={() => onBereichOeffnen('hub')}
              className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-sl-muted transition-colors hover:text-sl-accent"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t('settingsHub.backHome')}
            </button>
          )}
          <h1 className="text-xl font-bold tracking-tight text-sl-heading">{t('settingsHub.title')}</h1>
          <p className="text-xs text-sl-muted">
            {benutzer ? benutzer.vollerName : konto.label}
            {hatTeamZugriff && (
              <>
                {' '}
                · {team.name} · {holeRollenLabel(aktiveTeamAnsicht, locale)}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {hatTeamZugriff && (
          <button
            type="button"
            onClick={() => onBereichOeffnen('settings')}
            className="group flex min-h-[188px] flex-col justify-between rounded-lg border border-sl-border bg-sl-surface p-6 text-left transition-colors hover:border-sl-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent"
          >
            <div>
              <div className="inline-flex rounded-md border border-sl-border bg-sl-canvas p-2.5 text-sl-accent">
                <Sliders className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-sl-heading group-hover:text-sl-accent">
                {t('settingsHub.userTitle')}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-sl-muted">
                {t('settingsHub.userDesc')}
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-sl-border pt-3 text-xs font-medium text-sl-primary">
              <span>{t('settingsHub.openAction')}</span>
              <ArrowRight
                className="h-4 w-4 text-sl-muted transition-transform group-hover:translate-x-0.5 group-hover:text-sl-accent"
                aria-hidden="true"
              />
            </div>
          </button>
        )}

        {istTeamAdmin && (
          <button
            type="button"
            onClick={() => onBereichOeffnen('team-settings')}
            className="group flex min-h-[188px] flex-col justify-between rounded-lg border border-sl-border bg-sl-surface p-6 text-left transition-colors hover:border-sl-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-md border border-sl-border bg-sl-canvas p-2.5 text-sl-accent">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </div>
                {ausstehendeAnfragenAnzahl > 0 && (
                  <span className="font-mono text-xs font-semibold text-sl-accent tabular-nums">
                    {t('hub.openCount', { count: ausstehendeAnfragenAnzahl })}
                  </span>
                )}
              </div>
              <h2 className="mt-4 text-base font-semibold text-sl-heading group-hover:text-sl-accent">
                {t('settingsHub.teamTitle')}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-sl-muted">
                {t('settingsHub.teamDesc')}
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-sl-border pt-3 text-xs font-medium text-sl-primary">
              <span>{t('settingsHub.openAction')}</span>
              <ArrowRight
                className="h-4 w-4 text-sl-muted transition-transform group-hover:translate-x-0.5 group-hover:text-sl-accent"
                aria-hidden="true"
              />
            </div>
          </button>
        )}

        {konto.istSysadmin && (
          <button
            type="button"
            onClick={() => onBereichOeffnen('sysadmin')}
            className="group flex min-h-[188px] flex-col justify-between rounded-lg border border-sl-border bg-sl-surface p-6 text-left transition-colors hover:border-sl-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-md border border-sl-border bg-sl-canvas p-2.5 text-sl-accent">
                  <Server className="h-5 w-5" aria-hidden="true" />
                </div>
                {ausstehendeUpdatesAnzahl > 0 && (
                  <span className="font-mono text-xs font-semibold text-sl-accent tabular-nums">
                    {ausstehendeUpdatesAnzahl}{' '}
                    {ausstehendeUpdatesAnzahl === 1
                      ? t('settingsHub.updateSingular')
                      : t('settingsHub.updatePlural')}
                  </span>
                )}
              </div>
              <h2 className="mt-4 text-base font-semibold text-sl-heading group-hover:text-sl-accent">
                {t('settingsHub.sysadminTitle')}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-sl-muted">
                {t('settingsHub.sysadminDesc')}
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-sl-border pt-3 text-xs font-medium text-sl-primary">
              <span>{t('settingsHub.openAction')}</span>
              <ArrowRight
                className="h-4 w-4 text-sl-muted transition-transform group-hover:translate-x-0.5 group-hover:text-sl-accent"
                aria-hidden="true"
              />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
