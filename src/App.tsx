import { useState } from 'react';
import { Eye, RotateCcw } from 'lucide-react';
import { TopNavBar } from './core/TopNavBar.tsx';
import { SysadminIsolationView } from './core/SysadminIsolationView.tsx';
import { ModulePlaceholderView } from './core/ModulePlaceholderView.tsx';
import {
  STANDARD_HOTKEYS,
  STANDARD_NUTZER_EINSTELLUNGEN,
  darfAnsichtWechseln,
  ermittleWaehlbareTeamAnsichten,
} from './core/rolePermissions.ts';
import { DashboardView } from './modules/video-analysis/components/DashboardView.tsx';
import { FilmRoomView } from './modules/video-analysis/components/FilmRoomView.tsx';
import { TaggingSchemaSettings } from './modules/video-analysis/components/TaggingSchemaSettings.tsx';
import { UserSettingsView } from './modules/video-analysis/components/UserSettingsView.tsx';
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
  NutzerEinstellungen,
  ShareDownloadLink,
  SpielerFreigabe,
  TagFeldKonfig,
  TeamFreigabeEintrag,
  TeamRolle,
  VideoReel,
} from './shared/types.ts';
import { DEMO_PROFILE, TEAM_ROLLEN_LABELS } from './shared/types.ts';

const SETTINGS_STORAGE_KEY = 'sidelineos.user_settings.v1';

function ladeNutzerEinstellungen(): NutzerEinstellungen {
  try {
    const roh = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!roh) return STANDARD_NUTZER_EINSTELLUNGEN;
    const geparst = JSON.parse(roh) as Partial<NutzerEinstellungen>;
    return {
      ...STANDARD_NUTZER_EINSTELLUNGEN,
      ...geparst,
      hotkeys: {
        ...STANDARD_HOTKEYS,
        ...(geparst.hotkeys ?? {}),
      },
    };
  } catch {
    return STANDARD_NUTZER_EINSTELLUNGEN;
  }
}

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
  const [kontoId, setKontoId] = useState<string>(DEMO_PROFILE[0].id);
  const [aktiveTeamAnsicht, setAktiveTeamAnsicht] = useState<TeamRolle | null>(
    DEMO_PROFILE[0].teamRolle
  );
  const [aktivesTeamId, setAktivesTeamId] = useState<string>(DEMO_TEAMS[0].id);
  const [reels, setReels] = useState<VideoReel[]>(INITIALE_DEMO_REELS);
  const [tagSchema, setTagSchema] = useState<TagFeldKonfig[]>(STANDARD_TAG_SCHEMA);
  const [nutzerEinstellungen, setNutzerEinstellungen] = useState<NutzerEinstellungen>(
    ladeNutzerEinstellungen
  );
  const [ausgewaehltesReelId, setAusgewaehltesReelId] = useState<string>(
    INITIALE_DEMO_REELS[0].id
  );
  const [uploadHervorgehoben, setUploadHervorgehoben] = useState(false);

  const konto: BenutzerProfil = DEMO_PROFILE.find((p) => p.id === kontoId) ?? DEMO_PROFILE[0];
  const waehlbareAnsichten = ermittleWaehlbareTeamAnsichten(konto);
  const kannAnsichtWechseln = darfAnsichtWechseln(konto);
  const istVorschauModus =
    aktiveTeamAnsicht !== null &&
    konto.teamRolle !== null &&
    aktiveTeamAnsicht !== konto.teamRolle;

  const sichtbareTeamReels = reels.filter(
    (r) =>
      r.teamId === aktivesTeamId &&
      (aktiveTeamAnsicht === 'PLAYER' ? r.visibility !== 'COACHES_ONLY' : true)
  );

  const ausgewaehltesReel =
    sichtbareTeamReels.find((r) => r.id === ausgewaehltesReelId) ??
    sichtbareTeamReels[0] ??
    null;

  const handleNutzerEinstellungenAendern = (neu: NutzerEinstellungen) => {
    setNutzerEinstellungen(neu);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(neu));
    } catch {
      // Speicher im eingebetteten Kontext ggf. deaktiviert
    }
  };

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

  // Demo-Konto wechseln (simuliert Login mit einem anderen Benutzerkonto)
  const handleKontoWechseln = (neueId: string) => {
    const neu = DEMO_PROFILE.find((p) => p.id === neueId);
    if (!neu) return;
    setKontoId(neueId);
    setAktiveTeamAnsicht(neu.teamRolle);

    if (neu.teamRolle === null) {
      setAktiveAnsicht('sysadmin');
      return;
    }
    if (!neu.istSysadmin && aktiveAnsicht === 'sysadmin') {
      setAktiveAnsicht('dashboard');
      return;
    }
    if (neu.teamRolle !== 'TEAM_ADMIN' && aktiveAnsicht === 'team-settings') {
      setAktiveAnsicht('dashboard');
      return;
    }
    if (neu.teamRolle === 'PLAYER' && aktiveAnsicht === 'cut-sync') {
      setAktiveAnsicht('dashboard');
    }
  };

  // Produktiver Ansichts-Umschalter für untergeordnete Rollen (Team Admin -> Coach/Spieler, Coach -> Spieler)
  const handleTeamAnsichtWechseln = (zielRolle: TeamRolle) => {
    if (!waehlbareAnsichten.includes(zielRolle)) return;
    setAktiveTeamAnsicht(zielRolle);

    if (aktiveAnsicht === 'sysadmin') {
      setAktiveAnsicht('dashboard');
      return;
    }
    if (zielRolle !== 'TEAM_ADMIN' && aktiveAnsicht === 'team-settings') {
      setAktiveAnsicht('dashboard');
      return;
    }
    if (zielRolle === 'PLAYER' && aktiveAnsicht === 'cut-sync') {
      setAktiveAnsicht('dashboard');
    }
  };

  const handlePrimaerAktion = () => {
    if (aktiveTeamAnsicht === 'COACH' || aktiveTeamAnsicht === 'TEAM_ADMIN') {
      setAktiveAnsicht('dashboard');
      setUploadHervorgehoben(true);
      setTimeout(() => {
        document.getElementById('upload-panel')?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
      setTimeout(() => setUploadHervorgehoben(false), 1800);
    } else if (aktiveTeamAnsicht === 'PLAYER') {
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

  // Notizen (erstellen, bearbeiten, löschen) & Canvas-Zeichnungen
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

  const handleNotizBearbeiten = (
    reelId: string,
    playNumber: number,
    notizId: string,
    neuerText: string
  ) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) =>
        play.play_number === playNumber
          ? {
              ...play,
              notes: (play.notes ?? []).map((n) =>
                n.id === notizId ? { ...n, text: neuerText } : n
              ),
            }
          : play
      ),
    }));
  };

  const handleNotizLoeschen = (reelId: string, playNumber: number, notizId: string) => {
    aktualisiereReel(reelId, (reel) => ({
      ...reel,
      plays: reel.plays.map((play) =>
        play.play_number === playNumber
          ? {
              ...play,
              notes: (play.notes ?? []).filter((n) => n.id !== notizId),
            }
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
        konto={konto}
        aktiveTeamAnsicht={aktiveTeamAnsicht}
        onAnsichtWechseln={setAktiveAnsicht}
        onPrimaerAktion={handlePrimaerAktion}
      />

      {/* Kontext-Leiste: Team-Wahl, produktiver Ansichts-Umschalter (nur bei Rollen unter sich) & Demo-Konto */}
      <div className="border-b border-[#232933] bg-[#0F1318]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-2.5">
          <div className="flex items-center gap-3">
            {aktiveTeamAnsicht === null || aktiveAnsicht === 'sysadmin' ? (
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

          <div className="flex flex-wrap items-center gap-4">
            {/* Produktiver Multi-Rollen-Ansichtsumschalter – nur für Rollen mit untergeordneten Ansichten */}
            {kannAnsichtWechseln && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-[#8B949E]">
                  <Eye className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                  Ansicht
                </span>
                <div
                  role="group"
                  aria-label="Rollen-Ansicht umschalten"
                  className="flex items-center gap-0.5 rounded-md border border-[#232933] bg-[#13171D] p-0.5"
                >
                  {waehlbareAnsichten.map((rolle) => {
                    const aktiv = aktiveTeamAnsicht === rolle;
                    return (
                      <button
                        key={rolle}
                        type="button"
                        onClick={() => handleTeamAnsichtWechseln(rolle)}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          aktiv
                            ? 'bg-[#232933] text-white'
                            : 'text-[#8B949E] hover:text-[#E6EDF3]'
                        }`}
                      >
                        {TEAM_ROLLEN_LABELS[rolle]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Prototyp-Kontoauswahl zum Prüfen der Sichtbarkeit je echtem Login-Konto */}
            <label className="flex items-center gap-2 border-l border-[#232933] pl-4 text-xs text-[#6E7681]">
              <span>Demo-Konto</span>
              <select
                aria-label="Angemeldetes Demo-Konto wechseln"
                value={konto.id}
                onChange={(e) => handleKontoWechseln(e.target.value)}
                className="rounded border border-[#232933] bg-[#13171D] px-2 py-1 text-xs text-[#E6EDF3] focus:border-[#F59E0B] focus:outline-none"
              >
                {DEMO_PROFILE.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#13171D]">
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Hinweis-Banner bei aktiver Vorschau einer untergeordneten Rolle */}
      {istVorschauModus && konto.teamRolle && aktiveTeamAnsicht && (
        <div className="border-b border-[#F59E0B]/30 bg-[#F59E0B]/10">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-6 py-2 text-xs text-[#FDE68A]">
            <span>
              Ansichts-Vorschau aktiv: Du siehst die Oberfläche als{' '}
              <strong className="font-semibold text-white">
                {TEAM_ROLLEN_LABELS[aktiveTeamAnsicht]}
              </strong>{' '}
              (deine eigentliche Rolle: {TEAM_ROLLEN_LABELS[konto.teamRolle]}).
            </span>
            <button
              type="button"
              onClick={() => handleTeamAnsichtWechseln(konto.teamRolle!)}
              className="inline-flex items-center gap-1.5 rounded border border-[#F59E0B]/50 bg-[#0B0E11] px-2.5 py-1 text-xs font-medium text-[#F59E0B] hover:bg-[#13171D]"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Zurück zu {TEAM_ROLLEN_LABELS[konto.teamRolle]}
            </button>
          </div>
        </div>
      )}

      {/* Hauptinhalt */}
      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {aktiveAnsicht === 'sysadmin' && konto.istSysadmin ? (
          <SysadminIsolationView />
        ) : aktiveTeamAnsicht === null ? (
          <SysadminIsolationView />
        ) : aktiveAnsicht === 'dashboard' ? (
          <DashboardView
            teamId={aktivesTeamId}
            teamRolle={aktiveTeamAnsicht}
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
            teamRolle={aktiveTeamAnsicht}
            tagSchema={tagSchema}
            nutzerEinstellungen={nutzerEinstellungen}
            onZurueck={() => setAktiveAnsicht('dashboard')}
            onSchemaSettingsOeffnen={() => setAktiveAnsicht('team-settings')}
            onFreigabeAendern={handleFreigabeAendern}
            onFeldAendern={handleFeldAendern}
            onDefinitionLernen={handleDefinitionLernen}
            onNotizHinzufuegen={handleNotizHinzufuegen}
            onNotizBearbeiten={handleNotizBearbeiten}
            onNotizLoeschen={handleNotizLoeschen}
            onZeichnungHinzufuegen={handleZeichnungHinzufuegen}
            onZeichnungAktualisieren={handleZeichnungAktualisieren}
            onZeichnungEntfernen={handleZeichnungEntfernen}
            onLetzteZeichnungEntfernen={handleLetzteZeichnungEntfernen}
            onAlleZeichnungenLeeren={handleAlleZeichnungenLeeren}
            onSessionVeroeffentlichen={handleSessionVeroeffentlichen}
          />
        ) : aktiveAnsicht === 'team-settings' && aktiveTeamAnsicht === 'TEAM_ADMIN' ? (
          <TaggingSchemaSettings
            teamRolle={aktiveTeamAnsicht}
            tagSchema={tagSchema}
            onFeldToggle={handleFeldToggle}
            onDefinitionHinzufuegen={handleDefinitionLernen}
            onDefinitionLoeschen={handleDefinitionLoeschen}
            onCustomFeldErstellen={handleCustomFeldErstellen}
            onCustomFeldLoeschen={handleCustomFeldLoeschen}
          />
        ) : aktiveAnsicht === 'settings' ? (
          <UserSettingsView
            aktiveTeamAnsicht={aktiveTeamAnsicht}
            einstellungen={nutzerEinstellungen}
            onEinstellungenAendern={handleNutzerEinstellungenAendern}
          />
        ) : (
          <ModulePlaceholderView
            ansicht={aktiveAnsicht === 'playlists' ? 'playlists' : 'cut-sync'}
            ausgewaehltesReel={ausgewaehltesReel}
            onZurueckZumDashboard={() => setAktiveAnsicht('dashboard')}
          />
        )}
      </main>
    </div>
  );
}
