import type {
  BenutzerProfil,
  CoreBereich,
  ModulId,
  TeamRolle,
  VideoModulTab,
} from '../../shared/types.ts';
import { findeModulManifest } from '../moduleRegistry.ts';

interface CoreTopBarProps {
  bereich: CoreBereich;
  aktivesModulId: ModulId | null;
  videoTab: VideoModulTab;
  konto: BenutzerProfil;
  aktiveTeamAnsicht: TeamRolle | null;
  ausstehendeAnfragenAnzahl: number;
  onLogoKlick: () => void;
  onBereichWechseln: (bereich: CoreBereich) => void;
  onVideoTabWechseln: (tab: VideoModulTab) => void;
  onPrimaerAktion: () => void;
}

export function CoreTopBar({
  bereich,
  aktivesModulId,
  videoTab,
  konto,
  aktiveTeamAnsicht,
  ausstehendeAnfragenAnzahl,
  onLogoKlick,
  onBereichWechseln,
  onVideoTabWechseln,
  onPrimaerAktion,
}: CoreTopBarProps) {
  const hatTeamZugriff = aktiveTeamAnsicht !== null;
  const istCoach = aktiveTeamAnsicht === 'COACH' || aktiveTeamAnsicht === 'TEAM_ADMIN';
  const istTeamAdmin = aktiveTeamAnsicht === 'TEAM_ADMIN';

  const imVideoModul = bereich === 'modul' && aktivesModulId === 'video-analysis';
  const aktivesModul = aktivesModulId ? findeModulManifest(aktivesModulId) : null;

  // Zone 2: Strikte Trennung – im Modul nur Modul-Navigation, auf Hub/Settings zentrale Plattform-Navigation
  const videoLinks: Array<{ id: VideoModulTab; label: string }> = [];
  if (imVideoModul && hatTeamZugriff) {
    videoLinks.push({ id: 'dashboard', label: 'Bibliothek' });
    if (istCoach) {
      videoLinks.push({ id: 'cut-sync', label: 'Cut & Sync' });
    }
    videoLinks.push({ id: 'film-room', label: 'Film Room' });
    videoLinks.push({ id: 'playlists', label: 'Playlists' });
  }

  const coreLinks: Array<{ id: CoreBereich; label: string; badge?: number }> = [];
  if (!imVideoModul) {
    if (hatTeamZugriff) {
      coreLinks.push({ id: 'hub', label: 'Übersicht' });
      coreLinks.push({ id: 'settings', label: 'Einstellungen' });
      if (istTeamAdmin) {
        coreLinks.push({
          id: 'team-settings',
          label: 'Team-Einstellungen',
          badge: ausstehendeAnfragenAnzahl > 0 ? ausstehendeAnfragenAnzahl : undefined,
        });
      }
    }
    if (konto.istSysadmin) {
      coreLinks.push({ id: 'sysadmin', label: 'Sysadmin' });
    }
  }

  const primaerLabel = imVideoModul
    ? istCoach
      ? 'Tapes hochladen'
      : 'Film Room öffnen'
    : bereich === 'modul'
      ? 'Zur Übersicht'
      : hatTeamZugriff
        ? 'Videoanalyse öffnen'
        : 'Sysadmin';

  return (
    <header className="sticky top-0 z-30 border-b border-[#232933] bg-[#0B0E11]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-6 px-6">
        {/* Zone 1: Wortmarke (Klick führt immer zurück zum SidelineOS-Hub) + dezenter Modul-Kontext */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onLogoKlick}
            title="Zurück zur SidelineOS-Übersicht"
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F59E0B]"
          >
            Sideline<span className="text-[#F59E0B]">OS</span>
          </button>

          {bereich === 'modul' && aktivesModul && (
            <>
              <span aria-hidden="true" className="text-[#36404F]">
                /
              </span>
              <span className="text-xs font-medium text-[#8B949E] whitespace-nowrap">
                {aktivesModul.name}
              </span>
            </>
          )}
        </div>

        {/* Zone 2: Einzeilige Text-Navigation */}
        <nav aria-label="Hauptnavigation" className="flex items-center gap-5 overflow-x-auto">
          {imVideoModul
            ? videoLinks.map((eintrag) => {
                const istAktiv = videoTab === eintrag.id;
                return (
                  <button
                    key={eintrag.id}
                    type="button"
                    onClick={() => onVideoTabWechseln(eintrag.id)}
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
            : coreLinks.map((eintrag) => {
                const istAktiv = bereich === eintrag.id;
                return (
                  <button
                    key={eintrag.id}
                    type="button"
                    onClick={() => onBereichWechseln(eintrag.id)}
                    className={`relative inline-flex h-14 items-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F59E0B] ${
                      istAktiv ? 'text-white' : 'text-[#8B949E] hover:text-[#E6EDF3]'
                    }`}
                  >
                    <span>{eintrag.label}</span>
                    {eintrag.badge !== undefined && (
                      <span className="font-mono text-[11px] font-semibold text-[#F59E0B] tabular-nums">
                        ({eintrag.badge})
                      </span>
                    )}
                    {istAktiv && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 h-[2px] bg-[#F59E0B]"
                      />
                    )}
                  </button>
                );
              })}
        </nav>

        {/* Zone 3: Eine klare Primäraktion */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrimaerAktion}
            className="rounded-md bg-[#F59E0B] px-4 py-2 text-xs font-semibold text-[#0B0E11] transition-colors hover:bg-[#FBBF24] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F59E0B]"
          >
            {primaerLabel}
          </button>
        </div>
      </div>
    </header>
  );
}
