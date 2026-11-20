import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Film,
  Settings,
} from 'lucide-react';
import type {
  CoreBereich,
  ModulId,
  TeamKontext,
  TeamRolle,
} from '../../shared/types.ts';
import {
  SIDELINE_MODULE_REGISTRY,
  istModulFuerTeamAktiv,
} from '../moduleRegistry.ts';

interface SidelineHubViewProps {
  team: TeamKontext;
  aktiveTeamAnsicht: TeamRolle | null;
  globalAktivierteModule: ModulId[];
  ausstehendeAnfragenAnzahl: number;
  onModulOeffnen: (modulId: ModulId) => void;
  onBereichOeffnen: (bereich: CoreBereich) => void;
}

const MODUL_ICONS: Record<ModulId, typeof Film> = {
  'video-analysis': Film,
  playbook: BookOpen,
  'roster-attendance': ClipboardCheck,
};

/**
 * Aufgeräumte SidelineOS-Startseite:
 * Zeigt ausschließlich Kacheln für die freigeschalteten Module sowie eine Kachel "Einstellungen".
 * Nicht freigeschaltete Dienste werden vollständig ausgeblendet.
 */
export function SidelineHubView({
  team,
  aktiveTeamAnsicht,
  globalAktivierteModule,
  ausstehendeAnfragenAnzahl,
  onModulOeffnen,
  onBereichOeffnen,
}: SidelineHubViewProps) {
  const istTeamAdmin = aktiveTeamAnsicht === 'TEAM_ADMIN';

  const aktiveModule =
    aktiveTeamAnsicht === null
      ? []
      : SIDELINE_MODULE_REGISTRY.filter((modul) =>
          istModulFuerTeamAktiv(modul.id, globalAktivierteModule, team.aktivierteModule)
        );

  return (
    <section
      aria-label="SidelineOS Module und Einstellungen"
      className="mx-auto max-w-5xl py-4 sm:py-8"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {aktiveModule.map((modul) => {
          const Icon = MODUL_ICONS[modul.id];
          const istVorschau = modul.status === 'VORSCHAU';

          return (
            <button
              key={modul.id}
              type="button"
              onClick={() => onModulOeffnen(modul.id)}
              className="group flex min-h-[184px] flex-col justify-between rounded-xl border border-[#232933] bg-[#13171D] p-6 text-left transition-colors hover:border-[#F59E0B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F59E0B]"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="rounded-lg border border-[#232933] bg-[#0B0E11] p-3 text-[#F59E0B]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  {istVorschau && (
                    <span className="font-mono text-[11px] text-[#6E7681]">Vorschau</span>
                  )}
                </div>

                <h2 className="mt-5 text-base font-semibold text-white group-hover:text-[#F59E0B]">
                  {modul.name}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[#8B949E]">
                  {modul.kurzbeschreibung}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-end">
                <ArrowRight
                  className="h-4 w-4 text-[#6E7681] transition-transform group-hover:translate-x-0.5 group-hover:text-[#F59E0B]"
                  aria-hidden="true"
                />
              </div>
            </button>
          );
        })}

        {/* Kachel: Einstellungen (führt zur dedizierten Einstellungs-Übersichtsseite) */}
        <button
          type="button"
          onClick={() => onBereichOeffnen('settings-hub')}
          className="group flex min-h-[184px] flex-col justify-between rounded-xl border border-[#232933] bg-[#13171D] p-6 text-left transition-colors hover:border-[#F59E0B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F59E0B]"
        >
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="rounded-lg border border-[#232933] bg-[#0B0E11] p-3 text-[#E6EDF3] transition-colors group-hover:text-[#F59E0B]">
                <Settings className="h-5 w-5" aria-hidden="true" />
              </div>
              {istTeamAdmin && ausstehendeAnfragenAnzahl > 0 && (
                <span className="font-mono text-xs font-semibold text-[#F59E0B] tabular-nums">
                  {ausstehendeAnfragenAnzahl} offen
                </span>
              )}
            </div>

            <h2 className="mt-5 text-base font-semibold text-white group-hover:text-[#F59E0B]">
              Einstellungen
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#8B949E]">
              Profil, Zugangsdaten und freigegebene Verwaltungsbereiche.
            </p>
          </div>

          <div className="mt-5 flex items-center justify-end">
            <ArrowRight
              className="h-4 w-4 text-[#6E7681] transition-transform group-hover:translate-x-0.5 group-hover:text-[#F59E0B]"
              aria-hidden="true"
            />
          </div>
        </button>
      </div>
    </section>
  );
}
