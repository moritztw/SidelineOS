import { useState } from 'react';
import { TopNavBar } from './core/TopNavBar.tsx';
import { SysadminIsolationView } from './core/SysadminIsolationView.tsx';
import { ModulePlaceholderView } from './core/ModulePlaceholderView.tsx';
import { DashboardView } from './modules/video-analysis/components/DashboardView.tsx';
import { DEMO_TEAMS, INITIALE_DEMO_REELS } from './modules/video-analysis/data/demoReels.ts';
import type {
  BenutzerRolle,
  NavigationsAnsicht,
  SpielerFreigabe,
  VideoReel,
} from './shared/types.ts';

const ROLLEN_TABS: Array<{ id: BenutzerRolle; label: string }> = [
  { id: 'COACH', label: 'Coach' },
  { id: 'PLAYER', label: 'Spieler' },
  { id: 'SYSADMIN', label: 'Sysadmin' },
];

export default function App() {
  const [aktiveAnsicht, setAktiveAnsicht] = useState<NavigationsAnsicht>('dashboard');
  const [rolle, setRolle] = useState<BenutzerRolle>('COACH');
  const [aktivesTeamId, setAktivesTeamId] = useState<string>(DEMO_TEAMS[0].id);
  const [reels, setReels] = useState<VideoReel[]>(INITIALE_DEMO_REELS);
  const [ausgewaehltesReelId, setAusgewaehltesReelId] = useState<string>(
    INITIALE_DEMO_REELS[0].id
  );
  const [uploadHervorgehoben, setUploadHervorgehoben] = useState(false);

  const ausgewaehltesReel = reels.find((r) => r.id === ausgewaehltesReelId) ?? null;

  const handleRolleWechseln = (neueRolle: BenutzerRolle) => {
    setRolle(neueRolle);
    // Bei Rollenwechsel auf erlaubte Startansicht zurücksetzen
    if (neueRolle === 'SYSADMIN' && aktiveAnsicht !== 'dashboard' && aktiveAnsicht !== 'settings') {
      setAktiveAnsicht('dashboard');
    }
    if (neueRolle === 'PLAYER' && (aktiveAnsicht === 'cut-sync' || aktiveAnsicht === 'settings')) {
      setAktiveAnsicht('dashboard');
    }
  };

  const handlePrimaerAktion = () => {
    if (rolle === 'COACH') {
      setAktiveAnsicht('dashboard');
      setUploadHervorgehoben(true);
      setTimeout(() => {
        document.getElementById('upload-panel')?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
      setTimeout(() => setUploadHervorgehoben(false), 1800);
    } else if (rolle === 'PLAYER') {
      setAktiveAnsicht('film-room');
    } else {
      setAktiveAnsicht('dashboard');
    }
  };

  const handleNeuesReel = (neuesReel: VideoReel) => {
    setReels((alt) => [neuesReel, ...alt]);
    setAusgewaehltesReelId(neuesReel.id);
  };

  const handleFreigabeAendern = (reelId: string, freigabe: SpielerFreigabe) => {
    setReels((alt) =>
      alt.map((reel) => (reel.id === reelId ? { ...reel, visibility: freigabe } : reel))
    );
  };

  const handleTeilenAendern = (reelId: string, teams: string[]) => {
    setReels((alt) =>
      alt.map((reel) => (reel.id === reelId ? { ...reel, sharedWithTeams: teams } : reel))
    );
  };

  const handleReelOeffnen = (reel: VideoReel) => {
    setAusgewaehltesReelId(reel.id);
    setAktiveAnsicht('film-room');
  };

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#E6EDF3]">
      <TopNavBar
        aktiveAnsicht={aktiveAnsicht}
        rolle={rolle}
        onAnsichtWechseln={setAktiveAnsicht}
        onPrimaerAktion={handlePrimaerAktion}
      />

      {/* Kontext-Leiste unterhalb der Top-Navigation: Team-Wahl & Rollen-Umschalter */}
      <div className="border-b border-[#232933] bg-[#0F1318]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-2.5">
          <div className="flex items-center gap-3">
            {rolle === 'SYSADMIN' ? (
              <span className="text-xs font-medium text-[#8B949E]">
                Globale Instanz-Verwaltung · SidelineOS Core
              </span>
            ) : (
              <label className="flex items-center gap-2 text-xs text-[#8B949E]">
                <span>Team</span>
                <select
                  value={aktivesTeamId}
                  onChange={(e) => setAktivesTeamId(e.target.value)}
                  className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1 text-xs font-medium text-white focus:border-[#F59E0B] focus:outline-none"
                >
                  {DEMO_TEAMS.map((team) => (
                    <option key={team.id} value={team.id} className="bg-[#13171D]">
                      {team.name} · {team.saison}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8B949E]">Ansicht testen als</span>
            <div
              role="group"
              aria-label="Rollen-Vorschau wechseln"
              className="flex items-center gap-0.5 rounded-md border border-[#232933] bg-[#13171D] p-0.5"
            >
              {ROLLEN_TABS.map((tab) => {
                const aktiv = rolle === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleRolleWechseln(tab.id)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      aktiv ? 'bg-[#232933] text-white' : 'text-[#8B949E] hover:text-[#E6EDF3]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Hauptinhalt */}
      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {rolle === 'SYSADMIN' && aktiveAnsicht === 'dashboard' ? (
          <SysadminIsolationView />
        ) : aktiveAnsicht === 'dashboard' ? (
          <DashboardView
            teamId={aktivesTeamId}
            rolle={rolle}
            reels={reels}
            uploadHervorgehoben={uploadHervorgehoben}
            onNeuesReel={handleNeuesReel}
            onFreigabeAendern={handleFreigabeAendern}
            onTeilenAendern={handleTeilenAendern}
            onReelOeffnen={handleReelOeffnen}
          />
        ) : (
          <ModulePlaceholderView
            ansicht={aktiveAnsicht}
            ausgewaehltesReel={ausgewaehltesReel}
            onZurueckZumDashboard={() => setAktiveAnsicht('dashboard')}
          />
        )}
      </main>
    </div>
  );
}
