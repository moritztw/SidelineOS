import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Film,
  Server,
  Sliders,
  Users,
} from 'lucide-react';
import type {
  BenutzerKonto,
  BenutzerProfil,
  CoreBereich,
  ModulId,
  TeamKontext,
  TeamRolle,
} from '../../shared/types.ts';
import { TEAM_ROLLEN_LABELS } from '../../shared/types.ts';
import {
  SIDELINE_MODULE_REGISTRY,
  istModulFuerTeamAktiv,
} from '../moduleRegistry.ts';

interface SidelineHubViewProps {
  team: TeamKontext;
  benutzer: BenutzerKonto | null;
  konto: BenutzerProfil;
  aktiveTeamAnsicht: TeamRolle;
  globalAktivierteModule: ModulId[];
  teamReelAnzahl: number;
  teamPlayAnzahl: number;
  ausstehendeAnfragenAnzahl: number;
  onModulOeffnen: (modulId: ModulId) => void;
  onBereichOeffnen: (bereich: CoreBereich) => void;
}

const MODUL_ICONS: Record<ModulId, typeof Film> = {
  'video-analysis': Film,
  playbook: BookOpen,
  'roster-attendance': ClipboardCheck,
};

export function SidelineHubView({
  team,
  benutzer,
  konto,
  aktiveTeamAnsicht,
  globalAktivierteModule,
  teamReelAnzahl,
  teamPlayAnzahl,
  ausstehendeAnfragenAnzahl,
  onModulOeffnen,
  onBereichOeffnen,
}: SidelineHubViewProps) {
  const istTeamAdmin = aktiveTeamAnsicht === 'TEAM_ADMIN';

  const aktiveModule = SIDELINE_MODULE_REGISTRY.filter((modul) =>
    istModulFuerTeamAktiv(modul.id, globalAktivierteModule, team.aktivierteModule)
  );
  const deaktivierteModule = SIDELINE_MODULE_REGISTRY.filter(
    (modul) => !istModulFuerTeamAktiv(modul.id, globalAktivierteModule, team.aktivierteModule)
  );

  return (
    <div className="space-y-8">
      {/* Kopfzeile der SidelineOS-Startseite */}
      <section className="rounded-lg border border-[#232933] bg-[#13171D] p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="font-mono text-xs text-[#F59E0B]">
              {team.name} · Saison {team.saison}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {benutzer ? `Willkommen, ${benutzer.vollerName}` : 'SidelineOS Übersicht'}
            </h1>
            <p className="max-w-2xl text-sm text-[#8B949E]">
              Zentrale Plattform für deine aktivierten Team-Module, dein Profil sowie die Team- und
              Instanzverwaltung. Aktive Ansicht:{' '}
              <span className="text-[#E6EDF3]">{TEAM_ROLLEN_LABELS[aktiveTeamAnsicht]}</span>.
            </p>
          </div>

          <div className="flex items-center gap-6 border-t border-[#232933] pt-3 sm:border-t-0 sm:pt-0">
            <div>
              <div className="text-[11px] text-[#8B949E]">Aktive Module</div>
              <div className="font-mono text-lg font-semibold text-white tabular-nums">
                {aktiveModule.length} / {SIDELINE_MODULE_REGISTRY.length}
              </div>
            </div>
            {istModulFuerTeamAktiv('video-analysis', globalAktivierteModule, team.aktivierteModule) && (
              <div>
                <div className="text-[11px] text-[#8B949E]">Tapes im Team</div>
                <div className="font-mono text-lg font-semibold text-white tabular-nums">
                  {teamReelAnzahl}{' '}
                  <span className="text-xs font-normal text-[#8B949E]">({teamPlayAnzahl} Plays)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Sektion 1: Aktivierte Module */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-white">Aktivierte Module</h2>
          {konto.istSysadmin && (
            <button
              type="button"
              onClick={() => onBereichOeffnen('sysadmin')}
              className="text-xs text-[#8B949E] transition-colors hover:text-[#F59E0B]"
            >
              Module im Sysadmin-Bereich verwalten
            </button>
          )}
        </div>

        {aktiveModule.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#232933] bg-[#13171D] p-10 text-center">
            <p className="text-sm font-medium text-[#E6EDF3]">
              Für dieses Team sind aktuell keine Module aktiviert.
            </p>
            <p className="mt-1 text-xs text-[#8B949E]">
              Aktiviere gewünschte Module im Sysadmin-Bereich oder über{' '}
              <span className="font-mono text-[#E6EDF3]">ENABLED_MODULES</span>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {aktiveModule.map((modul) => {
              const Icon = MODUL_ICONS[modul.id];
              const istVorschau = modul.status === 'VORSCHAU';

              return (
                <button
                  key={modul.id}
                  type="button"
                  onClick={() => onModulOeffnen(modul.id)}
                  className="group flex flex-col justify-between rounded-lg border border-[#232933] bg-[#13171D] p-5 text-left transition-colors hover:border-[#F59E0B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F59E0B]"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-2.5 text-[#F59E0B]">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <span
                        className={`font-mono text-[11px] ${
                          istVorschau ? 'text-[#8B949E]' : 'text-[#4ADE80]'
                        }`}
                      >
                        {istVorschau ? 'Testmodul · Vorschau' : `v${modul.version}`}
                      </span>
                    </div>

                    <h3 className="mt-4 text-base font-semibold text-white group-hover:text-[#F59E0B]">
                      {modul.name}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#8B949E]">
                      {modul.kurzbeschreibung}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-[#232933] pt-3 text-xs font-medium text-[#E6EDF3]">
                    <span>{istVorschau ? 'Vorschau öffnen' : 'Modul öffnen'}</span>
                    <ArrowRight
                      className="h-4 w-4 text-[#8B949E] transition-transform group-hover:translate-x-0.5 group-hover:text-[#F59E0B]"
                      aria-hidden="true"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {deaktivierteModule.length > 0 && (istTeamAdmin || konto.istSysadmin) && (
          <div className="rounded-md border border-[#232933] bg-[#0F1318] px-4 py-3 text-xs text-[#8B949E]">
            Nicht aktiviert für {team.name}:{' '}
            <span className="text-[#E6EDF3]">
              {deaktivierteModule.map((m) => m.name).join(', ')}
            </span>
            {konto.istSysadmin && (
              <>
                {' '}
                ·{' '}
                <button
                  type="button"
                  onClick={() => onBereichOeffnen('sysadmin')}
                  className="text-[#F59E0B] underline-offset-2 hover:underline"
                >
                  Jetzt aktivieren
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* Sektion 2: Zentrale Plattform-Bereiche (Einstellungen laufen hier zusammen) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Zentrale Verwaltung &amp; Einstellungen</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => onBereichOeffnen('settings')}
            className="group rounded-lg border border-[#232933] bg-[#13171D] p-5 text-left transition-colors hover:border-[#36404F]"
          >
            <div className="flex items-center gap-2.5 text-white">
              <Sliders className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
              <span className="text-sm font-semibold">Persönliche Einstellungen</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#8B949E]">
              Spielerprofil (Nummer, Position, Kontakte &amp; Custom-Felder), Passwort, E-Mail sowie
              persönliche Modul-Optionen (z. B. Film-Room-Hotkeys).
            </p>
          </button>

          {istTeamAdmin && (
            <button
              type="button"
              onClick={() => onBereichOeffnen('team-settings')}
              className="group rounded-lg border border-[#232933] bg-[#13171D] p-5 text-left transition-colors hover:border-[#36404F]"
            >
              <div className="flex items-center justify-between gap-2 text-white">
                <span className="inline-flex items-center gap-2.5">
                  <Users className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
                  <span className="text-sm font-semibold">Team-Einstellungen</span>
                </span>
                {ausstehendeAnfragenAnzahl > 0 && (
                  <span className="font-mono text-xs font-semibold text-[#F59E0B] tabular-nums">
                    {ausstehendeAnfragenAnzahl} offen
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#8B949E]">
                Mitglieder, Multi-Unit-Zuordnung, Einladungen (E-Mail &amp; Team-Link) inkl.
                Freigabe-Warteliste, Profil-Custom-Felder und Tagging-Schema.
              </p>
            </button>
          )}

          {konto.istSysadmin && (
            <button
              type="button"
              onClick={() => onBereichOeffnen('sysadmin')}
              className="group rounded-lg border border-[#232933] bg-[#13171D] p-5 text-left transition-colors hover:border-[#36404F]"
            >
              <div className="flex items-center gap-2.5 text-white">
                <Server className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
                <span className="text-sm font-semibold">Sysadmin &amp; Module</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#8B949E]">
                Module installieren/aktivieren, Teams und globale Konten verwalten, S3-Storage,
                SMTP und Cleanup-Schonfrist konfigurieren.
              </p>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
