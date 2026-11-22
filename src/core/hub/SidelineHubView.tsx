import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Film,
  Layers,
  Puzzle,
  Settings,
} from 'lucide-react';
import type { CoreBereich, PluginId, TeamRolle } from '../../shared/types.ts';
import type { PluginIconName, SidelinePlugin } from '../../sdk/plugin.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface SidelineHubViewProps {
  aktivePlugins: SidelinePlugin[];
  aktiveTeamAnsicht: TeamRolle | null;
  ausstehendeAnfragenAnzahl: number;
  onModulOeffnen: (pluginId: PluginId) => void;
  onBereichOeffnen: (bereich: CoreBereich) => void;
}

const ICON_MAP: Record<PluginIconName, typeof Film> = {
  film: Film,
  'book-open': BookOpen,
  'clipboard-check': ClipboardCheck,
  layers: Layers,
  puzzle: Puzzle,
};

/**
 * Aufgeräumte Core-Startseite:
 * Zeigt ausschließlich Kacheln für die freigeschalteten Plugins sowie eine Kachel "Einstellungen".
 * Nicht installierte oder deaktivierte Dienste werden vollständig ausgeblendet.
 */
export function SidelineHubView({
  aktivePlugins,
  aktiveTeamAnsicht,
  ausstehendeAnfragenAnzahl,
  onModulOeffnen,
  onBereichOeffnen,
}: SidelineHubViewProps) {
  const { t } = useI18n();
  const istTeamAdmin = aktiveTeamAnsicht === 'TEAM_ADMIN';

  return (
    <section
      aria-label={t('hub.ariaLabel')}
      className="mx-auto max-w-5xl py-4 sm:py-8"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {aktivePlugins.map((plugin) => {
          const { manifest } = plugin;
          const Icon = ICON_MAP[manifest.icon] ?? Puzzle;
          const istVorschau = manifest.status === 'VORSCHAU';

          return (
            <button
              key={manifest.id}
              type="button"
              onClick={() => onModulOeffnen(manifest.id)}
              className="group flex min-h-[184px] flex-col justify-between rounded-xl border border-[#232933] bg-[#13171D] p-6 text-left transition-colors hover:border-[#F59E0B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F59E0B]"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="rounded-lg border border-[#232933] bg-[#0B0E11] p-3 text-[#F59E0B]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  {istVorschau && (
                    <span className="font-mono text-[11px] text-[#6E7681]">
                      {t('hub.previewBadge')}
                    </span>
                  )}
                </div>

                <h2 className="mt-5 text-base font-semibold text-white group-hover:text-[#F59E0B]">
                  {manifest.name}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[#8B949E]">
                  {manifest.kurzbeschreibung}
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

        {/* Kachel: Einstellungen */}
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
                  {t('hub.openCount', { count: ausstehendeAnfragenAnzahl })}
                </span>
              )}
            </div>

            <h2 className="mt-5 text-base font-semibold text-white group-hover:text-[#F59E0B]">
              {t('hub.settingsTitle')}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#8B949E]">
              {t('hub.settingsDescription')}
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
