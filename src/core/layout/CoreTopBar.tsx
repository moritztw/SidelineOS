import type { BenutzerProfil, CoreBereich, TeamRolle } from '../../shared/types.ts';
import type { PluginLaufzeitKontext, PluginTab, SidelinePlugin } from '../../sdk/plugin.ts';
import { BrandWortmarke, useI18n } from '../i18n/I18nContext.tsx';

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
  'rounded-md bg-sl-accent px-4 py-2 text-xs font-semibold text-sl-accent-contrast transition-colors hover:bg-sl-accent-hover whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent';

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
  const { t } = useI18n();
  const hatTeamZugriff = aktiveTeamAnsicht !== null;
  const istTeamAdmin = aktiveTeamAnsicht === 'TEAM_ADMIN';

  const imPlugin = bereich === 'modul' && aktivesPlugin !== null;
  const inEinstellungen = EINSTELLUNGS_BEREICHE.includes(bereich);
  const PrimaerAktionKomponente = aktivesPlugin?.PrimaerAktion;

  const coreLinks: Array<{ id: CoreBereich; label: string; aktiv: boolean; badge?: number }> = [];
  if (!imPlugin) {
    if (hatTeamZugriff) {
      coreLinks.push({ id: 'hub', label: t('nav.start'), aktiv: bereich === 'hub' });
      coreLinks.push({
        id: 'settings-hub',
        label: t('nav.settings'),
        aktiv: inEinstellungen,
        badge: istTeamAdmin && ausstehendeAnfragenAnzahl > 0 ? ausstehendeAnfragenAnzahl : undefined,
      });
    } else if (konto.istSysadmin) {
      coreLinks.push({
        id: 'sysadmin',
        label: t('nav.sysadmin'),
        aktiv: bereich === 'sysadmin' || bereich === 'settings-hub',
      });
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-sl-border bg-sl-canvas/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-6 px-6">
        {/* Zone 1: Wortmarke (Klick führt immer zurück zur Startseite) + Plugin-Breadcrumb */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onLogoKlick}
            title={t('nav.homeTitle')}
            className="font-display text-lg font-bold tracking-tight text-sl-heading whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sl-accent"
          >
            <BrandWortmarke />
          </button>

          {imPlugin && aktivesPlugin && (
            <>
              <span aria-hidden="true" className="text-sl-border-strong">
                /
              </span>
              <span className="text-xs font-medium text-sl-muted whitespace-nowrap">
                {aktivesPlugin.manifest.name}
              </span>
            </>
          )}
        </div>

        {/* Zone 2: Einzeilige Text-Navigation */}
        <nav aria-label={t('nav.mainAria')} className="flex items-center gap-6 overflow-x-auto">
          {imPlugin
            ? pluginTabs.map((eintrag) => {
                const istAktiv = aktiverPluginTab === eintrag.id;
                return (
                  <button
                    key={eintrag.id}
                    type="button"
                    onClick={() => onPluginTabWechseln(eintrag.id)}
                    className={`relative h-14 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sl-accent ${
                      istAktiv ? 'text-sl-heading' : 'text-sl-muted hover:text-sl-primary'
                    }`}
                  >
                    {eintrag.label}
                    {istAktiv && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 h-[2px] bg-sl-accent"
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
                  className={`relative inline-flex h-14 items-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sl-accent ${
                    eintrag.aktiv ? 'text-sl-heading' : 'text-sl-muted hover:text-sl-primary'
                  }`}
                >
                  <span>{eintrag.label}</span>
                  {eintrag.badge !== undefined && (
                    <span className="font-mono text-[11px] font-semibold text-sl-accent tabular-nums">
                      ({eintrag.badge})
                    </span>
                  )}
                  {eintrag.aktiv && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-sl-accent"
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
