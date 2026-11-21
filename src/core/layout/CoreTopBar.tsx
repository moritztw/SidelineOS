import type { BenutzerProfil, CoreBereich, TeamRolle } from '../../shared/types.ts';
import type { PluginLaufzeitKontext, PluginTab, SidelinePlugin } from '../../sdk/plugin.ts';

interface CoreTopBarProps {
  bereich: CoreBereich;
  aktivesPlugin: SidelinePlugin | null;
  pluginTabs: PluginTab[];
  aktiverPluginTab: string;
  pluginLaufzeitKontext: PluginLaufzeitKontext | null;
  konto: BenutzerProfil;
  aktiveTeamAnsicht: TeamRolle | null;
  ausstehendeAnfragenAnzahl: number;
  onLogoKlick: () => void;
  onBereichWechseln: (bereich: CoreBereich) => void;
  onPluginTabWechseln: (tabId: string) => void;
}

const EINSTELLUNGS_BEREICHE: CoreBereich[] = [
  'settings-hub',
  'settings',
  'team-settings',
  'sysadmin',
];

const PRIMAER_AKTION_KLASSE =
  'rounded-md bg-[#F59E0B] px-4 py-2 text-xs font-semibold text-[#0B0E11] transition-colors hover:bg-[#FBBF24] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F59E0B]';

export function CoreTopBar({
  bereich,
  aktivesPlugin,
  pluginTabs,
  aktiverPluginTab,
  pluginLaufzeitKontext,
  konto,
  aktiveTeamAnsicht,
  ausstehendeAnfragenAnzahl,
  onLogoKlick,
  onBereichWechseln,
  onPluginTabWechseln,
}: CoreTopBarProps) {
  const hatTeamZugriff = aktiveTeamAnsicht !== null;
  const istTeamAdmin = aktiveTeamAnsicht === 'TEAM_ADMIN';

  const imPlugin = bereich === 'modul' && aktivesPlugin !== null;
  const inEinstellungen = EINSTELLUNGS_BEREICHE.includes(bereich);
  const PrimaerAktionKomponente = aktivesPlugin?.PrimaerAktion;

  const coreLinks: Array<{ id: CoreBereich; label: string; aktiv: boolean; badge?: number }> = [];
  if (!imPlugin) {
    if (hatTeamZugriff) {
      coreLinks.push({ id: 'hub', label: 'Start', aktiv: bereich === 'hub' });
      coreLinks.push({
        id: 'settings-hub',
        label: 'Einstellungen',
        aktiv: inEinstellungen,
        badge: istTeamAdmin && ausstehendeAnfragenAnzahl > 0 ? ausstehendeAnfragenAnzahl : undefined,
      });
    } else if (konto.istSysadmin) {
      coreLinks.push({
        id: 'sysadmin',
        label: 'Sysadmin',
        aktiv: bereich === 'sysadmin' || bereich === 'settings-hub',
      });
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#232933] bg-[#0B0E11]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-6 px-6">
        {/* Zone 1: Wortmarke (Klick führt immer zurück zur Startseite) + Plugin-Breadcrumb */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onLogoKlick}
            title="Zurück zur SidelineOS-Core-Startseite"
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F59E0B]"
          >
            Sideline<span className="text-[#F59E0B]">OS</span>
            <span className="font-medium text-[#8B949E]">-Core</span>
          </button>

          {imPlugin && aktivesPlugin && (
            <>
              <span aria-hidden="true" className="text-[#36404F]">
                /
              </span>
              <span className="text-xs font-medium text-[#8B949E] whitespace-nowrap">
                {aktivesPlugin.manifest.name}
              </span>
            </>
          )}
        </div>

        {/* Zone 2: Einzeilige Text-Navigation */}
        <nav aria-label="Hauptnavigation" className="flex items-center gap-6 overflow-x-auto">
          {imPlugin
            ? pluginTabs.map((eintrag) => {
                const istAktiv = aktiverPluginTab === eintrag.id;
                return (
                  <button
                    key={eintrag.id}
                    type="button"
                    onClick={() => onPluginTabWechseln(eintrag.id)}
                    className={`relative h-14 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F59E0B] ${
                      istAktiv ? 'text-white' : 'text-[#8B949E] hover:text-[#E6EDF3]'
                    }`}
                  >
                    {eintrag.label}
                    {istAktiv && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 h-[2px] bg-[#F59E0B]"
                      />
                    )}
                  </button>
                );
              })
            : coreLinks.map((eintrag) => (
                <button
                  key={eintrag.id}
                  type="button"
                  onClick={() => onBereichWechseln(eintrag.id)}
                  className={`relative inline-flex h-14 items-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F59E0B] ${
                    eintrag.aktiv ? 'text-white' : 'text-[#8B949E] hover:text-[#E6EDF3]'
                  }`}
                >
                  <span>{eintrag.label}</span>
                  {eintrag.badge !== undefined && (
                    <span className="font-mono text-[11px] font-semibold text-[#F59E0B] tabular-nums">
                      ({eintrag.badge})
                    </span>
                  )}
                  {eintrag.aktiv && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-[#F59E0B]"
                    />
                  )}
                </button>
              ))}
        </nav>

        {/* Zone 3: Kontextuelle Primäraktion (als saubere Komponente des aktiven Plugins) */}
        <div className="flex min-w-[120px] items-center justify-end shrink-0">
          {imPlugin && PrimaerAktionKomponente && pluginLaufzeitKontext && (
            <PrimaerAktionKomponente
              ctx={pluginLaufzeitKontext}
              className={PRIMAER_AKTION_KLASSE}
            />
          )}
        </div>
      </div>
    </header>
  );
}
