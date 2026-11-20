import type { BenutzerProfil, NavigationsAnsicht } from '../shared/types.ts';

interface TopNavBarProps {
  aktiveAnsicht: NavigationsAnsicht;
  profil: BenutzerProfil;
  onAnsichtWechseln: (ansicht: NavigationsAnsicht) => void;
  onPrimaerAktion: () => void;
}

export function TopNavBar({
  aktiveAnsicht,
  profil,
  onAnsichtWechseln,
  onPrimaerAktion,
}: TopNavBarProps) {
  const hatTeamZugriff = profil.teamRolle !== null;
  const istCoach = profil.teamRolle === 'COACH' || profil.teamRolle === 'TEAM_ADMIN';

  const sichtbareLinks: Array<{ id: NavigationsAnsicht; label: string }> = [];

  if (hatTeamZugriff) {
    sichtbareLinks.push({ id: 'dashboard', label: 'Dashboard' });
    if (istCoach) {
      sichtbareLinks.push({ id: 'cut-sync', label: 'Cut & Sync' });
    }
    sichtbareLinks.push({ id: 'film-room', label: 'Film Room' });
    sichtbareLinks.push({ id: 'playlists', label: 'Playlists' });
    if (istCoach) {
      sichtbareLinks.push({ id: 'settings', label: 'Einstellungen' });
    }
  }

  // Eigener Sysadmin-Tab – auch wenn jemand gleichzeitig Team Admin / Coach ist
  if (profil.istSysadmin) {
    sichtbareLinks.push({ id: 'sysadmin', label: 'Sysadmin' });
  }

  const primaerLabel = istCoach
    ? 'Tapes hochladen'
    : profil.teamRolle === 'PLAYER'
      ? 'Film Room öffnen'
      : 'Cleanup prüfen';

  return (
    <header className="sticky top-0 z-30 border-b border-[#232933] bg-[#0B0E11]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-8 px-6">
        {/* Zone 1: Wortmarke */}
        <button
          type="button"
          onClick={() => onAnsichtWechseln(hatTeamZugriff ? 'dashboard' : 'sysadmin')}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F59E0B]"
        >
          Sideline<span className="text-[#F59E0B]">OS</span>
        </button>

        {/* Zone 2: Einzeilige Text-Navigation */}
        <nav aria-label="Hauptnavigation" className="flex items-center gap-6 overflow-x-auto">
          {sichtbareLinks.map((eintrag) => {
            const istAktiv = aktiveAnsicht === eintrag.id;
            return (
              <button
                key={eintrag.id}
                type="button"
                onClick={() => onAnsichtWechseln(eintrag.id)}
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
