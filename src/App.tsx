import { useState } from 'react';
import { TopNavBar } from './core/TopNavBar.tsx';
import { SysadminIsolationView } from './core/SysadminIsolationView.tsx';
import { ModulePlaceholderView } from './core/ModulePlaceholderView.tsx';
import { DashboardView } from './modules/video-analysis/components/DashboardView.tsx';
import { FilmRoomView } from './modules/video-analysis/components/FilmRoomView.tsx';
import { DEMO_TEAMS, INITIALE_DEMO_REELS } from './modules/video-analysis/data/demoReels.ts';
import type {
  BenutzerRolle,
  CanvasZeichnung,
  CoachNotiz,
  NavigationsAnsicht,
  PlayBreakdown,
  ShareDownloadLink,
  SpielerFreigabe,
  TeamFreigabeEintrag,
  VideoReel,
} from './shared/types.ts';

const ROLLEN_TABS: Array<{ id: BenutzerRolle; label: string }> = [
  { id: 'COACH', label: 'Coach' },
  { id: 'PLAYER', label: 'Spieler' },
  { id: 'SYSADMIN', label: 'Sysadmin' },
];

function zaehleGetaggtePlays(reel: VideoReel): number {
  return reel.plays.filter(
    (play) =>
      play.breakdown &&
      Object.values(play.breakdown).some((v) => v !== undefined && v !== '')
  ).length;
}

function zaehleEntwuerfe(reel: VideoReel): number {
  return reel.plays.reduce((summe, play) => {
    const notes = (play.notes ?? []).filter((n) => n.status === 'DRAFT').length;
    const drawings = (play.drawings ?? []).filter((d) => d.status === 'DRAFT').length;
    return summe + notes + drawings;
  }, 0);
}

export default function App() {
  const [aktiveAnsicht, setAktiveAnsicht] = useState<NavigationsAnsicht>('dashboard');
  const [rolle, setRolle] = useState<BenutzerRolle>('COACH');
  const [aktivesTeamId, setAktivesTeamId] = useState<string>(DEMO_TEAMS[0].id);
  const [reels, setReels] = useState<VideoReel[]>(INITIALE_DEMO_REELS);
  const [ausgewaehltesReelId, setAusgewaehltesReelId] = useState<string>(
    INITIALE_DEMO_REELS[0].id
  );
  const [uploadHervorgehoben, setUploadHervorgehoben] = useState(false);

  const sichtbareTeamReels = reels.filter(
    (r) =>
      r.teamId === aktivesTeamId &&
      (rolle === 'PLAYER' ? r.visibility !== 'COACHES_ONLY' : true)
  );

  const ausgewaehltesReel =
    sichtbareTeamReels.find((r) => r.id === ausgewaehltesReelId) ??
    sichtbareTeamReels[0] ??
    null;

  const aktualisiereReel = (reelId: string, updater: (reel: VideoReel) => VideoReel) => {
    setReels((alt) =>
      alt.map((reel) => {
        if (reel.id !== reelId) return reel;
        const neu = updater(reel);
        return {
          ...neu,
          playCount: neu.plays.length,
          taggedCount: zaehleGetaggtePlays(neu),
          draftNoteCount: zaehleEntwuerfe(neu),
        };
      })
    );
  };

  const handleRolleWechseln = (neueRolle: BenutzerRolle) => {
    setRolle(neueRolle);
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
    aktualisiereReel(reelId, (reel) => ({ ...reel, visibility: freigabe }));
  };

  const handleTeamFreigabenAendern = (reelId: string, teamFreigaben: TeamFreigabeEintrag[]) => {
    aktualisiereReel(reelId, (reel) => ({ ...reel, teamFreigaben }));
  };

  const handleShareLinksAendern = (reelId: string, shareLinks: ShareDownloadLink[]) => {
    aktualisiereReel(reelId, (reel) => ({ ...reel, shareLinks }));
  };

  const handleBreakdownAendern = (
    reelId: string,
    playNumber: number,
    patch: Partial<PlayBreakdown>
  ) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) =>
        play.play_number === playNumber
          ? { ...play, breakdown: { ...(play.breakdown ?? {}), ...patch } }
          : play
      ),
    }));
  };

  const handleNotizHinzufuegen = (reelId: string, playNumber: number, notiz: CoachNotiz) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) =>
        play.play_number === playNumber
          ? { ...play, notes: [...(play.notes ?? []), notiz] }
          : play
      ),
    }));
  };

  const handleZeichnungHinzufuegen = (
    reelId: string,
    playNumber: number,
    zeichnung: CanvasZeichnung
  ) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) =>
        play.play_number === playNumber
          ? { ...play, drawings: [...(play.drawings ?? []), zeichnung] }
          : play
      ),
    }));
  };

  const handleLetzteZeichnungEntfernen = (reelId: string, playNumber: number) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) =>
        play.play_number === playNumber
          ? { ...play, drawings: (play.drawings ?? []).slice(0, -1) }
          : play
      ),
    }));
  };

  const handleAlleZeichnungenLeeren = (reelId: string, playNumber: number) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) =>
        play.play_number === playNumber ? { ...play, drawings: [] } : play
      ),
    }));
  };

  const handleSessionVeroeffentlichen = (reelId: string) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) => ({
        ...play,
        notes: play.notes?.map((n) => ({ ...n, status: 'PUBLISHED' as const })),
        drawings: play.drawings?.map((d) => ({ ...d, status: 'PUBLISHED' as const })),
      })),
    }));
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

      {/* Kontext-Leiste: Team-Wahl & Rollen-Umschalter */}
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
            onTeamFreigabenAendern={handleTeamFreigabenAendern}
            onShareLinksAendern={handleShareLinksAendern}
            onReelOeffnen={handleReelOeffnen}
          />
        ) : aktiveAnsicht === 'film-room' && ausgewaehltesReel ? (
          <FilmRoomView
            key={ausgewaehltesReel.id}
            reel={ausgewaehltesReel}
            rolle={rolle}
            onZurueck={() => setAktiveAnsicht('dashboard')}
            onFreigabeAendern={handleFreigabeAendern}
            onBreakdownAendern={handleBreakdownAendern}
            onNotizHinzufuegen={handleNotizHinzufuegen}
            onZeichnungHinzufuegen={handleZeichnungHinzufuegen}
            onLetzteZeichnungEntfernen={handleLetzteZeichnungEntfernen}
            onAlleZeichnungenLeeren={handleAlleZeichnungenLeeren}
            onSessionVeroeffentlichen={handleSessionVeroeffentlichen}
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
