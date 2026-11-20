import { useState } from 'react';
import { TopNavBar } from './core/TopNavBar.tsx';
import { SysadminIsolationView } from './core/SysadminIsolationView.tsx';
import { ModulePlaceholderView } from './core/ModulePlaceholderView.tsx';
import { DashboardView } from './modules/video-analysis/components/DashboardView.tsx';
import { FilmRoomView } from './modules/video-analysis/components/FilmRoomView.tsx';
import { TaggingSchemaSettings } from './modules/video-analysis/components/TaggingSchemaSettings.tsx';
import { DEMO_TEAMS, INITIALE_DEMO_REELS } from './modules/video-analysis/data/demoReels.ts';
import {
  STANDARD_TAG_SCHEMA,
  registriereDefinitionWennNeu,
  wendeBreakdownUpdateMitAutoCalcAn,
} from './modules/video-analysis/services/taggingEngine.ts';
import type {
  BenutzerProfil,
  BreakdownFeldKey,
  CanvasZeichnung,
  CoachNotiz,
  NavigationsAnsicht,
  NormPunkt,
  ShareDownloadLink,
  SpielerFreigabe,
  TagFeldKonfig,
  TeamFreigabeEintrag,
  VideoReel,
} from './shared/types.ts';
import { DEMO_PROFILE } from './shared/types.ts';

function zaehleGetaggtePlays(reel: VideoReel): number {
  return reel.plays.filter((play) => {
    if (!play.breakdown) return false;
    const hatStandard = Object.entries(play.breakdown).some(
      ([k, v]) => k !== 'custom' && v !== undefined && v !== ''
    );
    const hatCustom =
      play.breakdown.custom !== undefined &&
      Object.values(play.breakdown.custom).some((v) => v !== undefined && v !== '');
    return hatStandard || hatCustom;
  }).length;
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
  const [profilId, setProfilId] = useState<string>(DEMO_PROFILE[0].id);
  const [aktivesTeamId, setAktivesTeamId] = useState<string>(DEMO_TEAMS[0].id);
  const [reels, setReels] = useState<VideoReel[]>(INITIALE_DEMO_REELS);
  const [tagSchema, setTagSchema] = useState<TagFeldKonfig[]>(STANDARD_TAG_SCHEMA);
  const [ausgewaehltesReelId, setAusgewaehltesReelId] = useState<string>(
    INITIALE_DEMO_REELS[0].id
  );
  const [uploadHervorgehoben, setUploadHervorgehoben] = useState(false);

  const profil: BenutzerProfil =
    DEMO_PROFILE.find((p) => p.id === profilId) ?? DEMO_PROFILE[0];

  const sichtbareTeamReels = reels.filter(
    (r) =>
      r.teamId === aktivesTeamId &&
      (profil.teamRolle === 'PLAYER' ? r.visibility !== 'COACHES_ONLY' : true)
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

  const handleProfilWechseln = (neueId: string) => {
    const neu = DEMO_PROFILE.find((p) => p.id === neueId);
    if (!neu) return;
    setProfilId(neueId);

    if (neu.teamRolle === null) {
      setAktiveAnsicht('sysadmin');
      return;
    }
    if (!neu.istSysadmin && aktiveAnsicht === 'sysadmin') {
      setAktiveAnsicht('dashboard');
      return;
    }
    if (
      neu.teamRolle === 'PLAYER' &&
      (aktiveAnsicht === 'cut-sync' || aktiveAnsicht === 'settings' || aktiveAnsicht === 'sysadmin')
    ) {
      setAktiveAnsicht('dashboard');
    }
  };

  const handlePrimaerAktion = () => {
    if (profil.teamRolle === 'COACH' || profil.teamRolle === 'TEAM_ADMIN') {
      setAktiveAnsicht('dashboard');
      setUploadHervorgehoben(true);
      setTimeout(() => {
        document.getElementById('upload-panel')?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
      setTimeout(() => setUploadHervorgehoben(false), 1800);
    } else if (profil.teamRolle === 'PLAYER') {
      setAktiveAnsicht('film-room');
    } else {
      setAktiveAnsicht('sysadmin');
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

  // Breakdown-Feld aktualisieren inkl. automatischer YD LN <-> GN/LS Berechnung (außer FLAG)
  const handleFeldAendern = (
    reelId: string,
    playNumber: number,
    feldKey: BreakdownFeldKey,
    wert: string | number | undefined,
    istCustom: boolean
  ) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: wendeBreakdownUpdateMitAutoCalcAn(reel.plays, playNumber, feldKey, wert, istCustom),
    }));
  };

  // Einmal eingegebene Definition dauerhaft im Team-Wörterbuch speichern
  const handleDefinitionLernen = (feldKey: BreakdownFeldKey, begriff: string) => {
    setTagSchema((alt) => registriereDefinitionWennNeu(alt, feldKey, begriff));
  };

  // Team-Admin Schema-Aktionen
  const handleFeldToggle = (feldKey: BreakdownFeldKey) => {
    setTagSchema((alt) =>
      alt.map((f) => (f.key === feldKey ? { ...f, aktiv: !f.aktiv } : f))
    );
  };

  const handleDefinitionLoeschen = (feldKey: BreakdownFeldKey, begriff: string) => {
    setTagSchema((alt) =>
      alt.map((f) =>
        f.key === feldKey
          ? { ...f, definitionen: (f.definitionen ?? []).filter((d) => d !== begriff) }
          : f
      )
    );
  };

  const handleCustomFeldErstellen = (neuesFeld: TagFeldKonfig) => {
    setTagSchema((alt) => [...alt, neuesFeld]);
  };

  const handleCustomFeldLoeschen = (feldKey: BreakdownFeldKey) => {
    setTagSchema((alt) => alt.filter((f) => f.key !== feldKey));
  };

  // Notizen & Canvas-Zeichnungen
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

  const handleZeichnungAktualisieren = (
    reelId: string,
    playNumber: number,
    zeichnungId: string,
    punkte: NormPunkt[]
  ) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) =>
        play.play_number === playNumber
          ? {
              ...play,
              drawings: (play.drawings ?? []).map((d) =>
                d.id === zeichnungId ? { ...d, punkte } : d
              ),
            }
          : play
      ),
    }));
  };

  const handleZeichnungEntfernen = (
    reelId: string,
    playNumber: number,
    zeichnungId: string
  ) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) =>
        play.play_number === playNumber
          ? { ...play, drawings: (play.drawings ?? []).filter((d) => d.id !== zeichnungId) }
          : play
      ),
    }));
  };

  const handleLetzteZeichnungEntfernen = (reelId: string, playNumber: number, angle: string) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) => {
        if (play.play_number !== playNumber) return play;
        const liste = [...(play.drawings ?? [])];
        for (let i = liste.length - 1; i >= 0; i -= 1) {
          if (liste[i].angle === angle) {
            liste.splice(i, 1);
            break;
          }
        }
        return { ...play, drawings: liste };
      }),
    }));
  };

  const handleAlleZeichnungenLeeren = (reelId: string, playNumber: number, angle: string) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) =>
        play.play_number === playNumber
          ? { ...play, drawings: (play.drawings ?? []).filter((d) => d.angle !== angle) }
          : play
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
        profil={profil}
        onAnsichtWechseln={setAktiveAnsicht}
        onPrimaerAktion={handlePrimaerAktion}
      />

      {/* Kontext-Leiste: Team-Wahl & Multi-Rollen-Profil-Umschalter */}
      <div className="border-b border-[#232933] bg-[#0F1318]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-2.5">
          <div className="flex items-center gap-3">
            {profil.teamRolle === null || aktiveAnsicht === 'sysadmin' ? (
              <span className="text-xs font-medium text-[#8B949E]">
                Instanz-Verwaltung · Sysadmin-Bereich (getrennt von Team-Daten)
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

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#8B949E]">Profil testen</span>
            <div
              role="group"
              aria-label="Rollen-Profil wechseln"
              className="flex flex-wrap items-center gap-0.5 rounded-md border border-[#232933] bg-[#13171D] p-0.5"
            >
              {DEMO_PROFILE.map((p) => {
                const aktiv = p.id === profil.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProfilWechseln(p.id)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                      aktiv ? 'bg-[#232933] text-white' : 'text-[#8B949E] hover:text-[#E6EDF3]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Hauptinhalt */}
      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {aktiveAnsicht === 'sysadmin' && profil.istSysadmin ? (
          <SysadminIsolationView />
        ) : profil.teamRolle === null ? (
          <SysadminIsolationView />
        ) : aktiveAnsicht === 'dashboard' ? (
          <DashboardView
            teamId={aktivesTeamId}
            teamRolle={profil.teamRolle}
            tagSchema={tagSchema}
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
            teamRolle={profil.teamRolle}
            tagSchema={tagSchema}
            onZurueck={() => setAktiveAnsicht('dashboard')}
            onSchemaSettingsOeffnen={() => setAktiveAnsicht('settings')}
            onFreigabeAendern={handleFreigabeAendern}
            onFeldAendern={handleFeldAendern}
            onDefinitionLernen={handleDefinitionLernen}
            onNotizHinzufuegen={handleNotizHinzufuegen}
            onZeichnungHinzufuegen={handleZeichnungHinzufuegen}
            onZeichnungAktualisieren={handleZeichnungAktualisieren}
            onZeichnungEntfernen={handleZeichnungEntfernen}
            onLetzteZeichnungEntfernen={handleLetzteZeichnungEntfernen}
            onAlleZeichnungenLeeren={handleAlleZeichnungenLeeren}
            onSessionVeroeffentlichen={handleSessionVeroeffentlichen}
          />
        ) : aktiveAnsicht === 'settings' ? (
          <TaggingSchemaSettings
            teamRolle={profil.teamRolle}
            tagSchema={tagSchema}
            onFeldToggle={handleFeldToggle}
            onDefinitionHinzufuegen={handleDefinitionLernen}
            onDefinitionLoeschen={handleDefinitionLoeschen}
            onCustomFeldErstellen={handleCustomFeldErstellen}
            onCustomFeldLoeschen={handleCustomFeldLoeschen}
          />
        ) : (
          <ModulePlaceholderView
            ansicht={aktiveAnsicht as 'cut-sync' | 'playlists' | 'film-room' | 'settings'}
            ausgewaehltesReel={ausgewaehltesReel}
            onZurueckZumDashboard={() => setAktiveAnsicht('dashboard')}
          />
        )}
      </main>
    </div>
  );
}
