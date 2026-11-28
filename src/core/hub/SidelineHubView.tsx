import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Film,
  GitBranch,
  HardDrive,
  Layers,
  Mail,
  Puzzle,
  Shield,
  Store,
  Users,
} from 'lucide-react';
import type { PluginIconName, SidelinePlugin } from '../../sdk/plugin.ts';
import type { SessionClubDTO, SessionTeamDTO } from '../apiClient.ts';
import type { PluginId } from '../../shared/types.ts';

interface SidelineHubViewProps {
  aktivePlugins: SidelinePlugin[];
  aktiverClub: SessionClubDTO | null;
  aktivesTeam: SessionTeamDTO | null;
  istSysadmin: boolean;
  onModulOeffnen: (pluginId: PluginId) => void;
  onSystemOeffnen: () => void;
}

const ICON_MAP: Record<PluginIconName, typeof Film> = {
  film: Film,
  'book-open': BookOpen,
  'clipboard-check': ClipboardCheck,
  layers: Layers,
  puzzle: Puzzle,
  users: Users,
  'hard-drive': HardDrive,
  mail: Mail,
  store: Store,
  'git-branch': GitBranch,
  shield: Shield,
};

/**
 * Ebene 1 — Start-Hub:
 * Zeigt ausschließlich Kacheln für freigeschaltete Fach-Plugins (`surface === 'app'`).
 * System-, Admin- und Headless-Plugins belegen bewusst keinen Platz auf dem Start-Hub.
 */
export function SidelineHubView({
  aktivePlugins,
  aktiverClub,
  aktivesTeam,
  istSysadmin,
  onModulOeffnen,
  onSystemOeffnen,
}: SidelineHubViewProps) {
  const appPlugins = aktivePlugins.filter(
    (plugin) => plugin.manifest.navigation.surface === 'app' && Boolean(plugin.HauptAnsicht)
  );

  return (
    <section aria-label="Start-Hub" className="mx-auto max-w-5xl space-y-6 py-4 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-sl-border pb-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-sl-heading">
            {aktivesTeam ? aktivesTeam.name : aktiverClub ? aktiverClub.name : 'Arbeitsbereich'}
          </h1>
          <p className="mt-1 text-xs text-sl-muted">
            {aktiverClub && aktivesTeam
              ? `${aktiverClub.name} · Aktivierte Module`
              : 'Wähle ein freigeschaltetes Modul aus.'}
          </p>
        </div>
        {aktivesTeam && (
          <div className="font-mono text-xs text-sl-subtle">
            Rolle: {aktivesTeam.effektiveTeamRolle}
            {aktivesTeam.groups.length > 0 ? ` · ${aktivesTeam.groups.join(', ')}` : ''}
          </div>
        )}
      </div>

      {appPlugins.length === 0 ? (
        <div className="rounded-lg border border-sl-border bg-sl-surface p-8 text-center">
          <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-lg border border-sl-border bg-sl-canvas text-sl-muted">
            <Puzzle className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-sl-heading">
            Noch keine Fach-Module aktiviert
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-sl-muted">
            {istSysadmin
              ? 'Installiere System- oder Fach-Plugins über den Notfall-Admin oder konfiguriere CORE_BOOTSTRAP_PLUGINS.'
              : 'Für diesen Verein oder dieses Team wurden noch keine Module freigeschaltet.'}
          </p>
          {istSysadmin && (
            <button
              type="button"
              onClick={onSystemOeffnen}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-sl-accent px-4 py-2 text-xs font-semibold text-sl-accent-contrast transition-colors hover:bg-sl-accent-hover"
            >
              <span>System-Administration öffnen</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {appPlugins.map((plugin) => {
            const { manifest } = plugin;
            const Icon = ICON_MAP[manifest.icon] ?? Puzzle;

            return (
              <button
                key={manifest.id}
                type="button"
                onClick={() => onModulOeffnen(manifest.id)}
                className="group flex min-h-[172px] flex-col justify-between rounded-lg border border-sl-border bg-sl-surface p-6 text-left transition-colors hover:border-sl-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent"
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="rounded-md border border-sl-border bg-sl-canvas p-2.5 text-sl-accent">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="font-mono text-[11px] text-sl-subtle tabular-nums">
                      v{manifest.version}
                    </span>
                  </div>

                  <h2 className="mt-4 font-display text-base font-semibold text-sl-heading group-hover:text-sl-accent">
                    {manifest.name}
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-sl-muted">
                    {manifest.kurzbeschreibung}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-end">
                  <ArrowRight
                    className="h-4 w-4 text-sl-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-sl-accent"
                    aria-hidden="true"
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
