import { useState } from 'react';
import { Eye, RotateCcw } from 'lucide-react';
import { CoreTopBar } from './core/layout/CoreTopBar.tsx';
import { SidelineHubView } from './core/hub/SidelineHubView.tsx';
import { ModulePreviewView } from './core/hub/ModulePreviewView.tsx';
import { UserSettingsPage } from './core/settings/UserSettingsPage.tsx';
import { TeamSettingsPage } from './core/settings/TeamSettingsPage.tsx';
import { SysadminPage } from './core/settings/SysadminPage.tsx';
import { ModulePlaceholderView } from './core/ModulePlaceholderView.tsx';
import {
  INITIALE_BENUTZER,
  INITIALE_EINLADUNGEN,
  INITIALE_MITGLIEDSCHAFTEN,
  INITIALE_S3_KONFIG,
  INITIALE_SMTP_KONFIG,
  INITIALE_TEAMS,
} from './core/demoOrgData.ts';
import {
  STANDARD_AKTIVIERTE_MODULE,
  istModulFuerTeamAktiv,
} from './core/moduleRegistry.ts';
import {
  STANDARD_HOTKEYS,
  STANDARD_NUTZER_EINSTELLUNGEN,
  darfAnsichtWechseln,
  ermittleWaehlbareTeamAnsichten,
} from './core/rolePermissions.ts';
import { DashboardView } from './modules/video-analysis/components/DashboardView.tsx';
import { FilmRoomView } from './modules/video-analysis/components/FilmRoomView.tsx';
import { INITIALE_DEMO_REELS } from './modules/video-analysis/data/demoReels.ts';
import {
  STANDARD_TAG_SCHEMA,
  registriereDefinitionWennNeu,
  wendeBreakdownUpdateMitAutoCalcAn,
} from './modules/video-analysis/services/taggingEngine.ts';
import type {
  BenutzerKonto,
  BenutzerProfil,
  BreakdownFeldKey,
  CanvasZeichnung,
  CoachNotiz,
  CoreBereich,
  ModulId,
  NormPunkt,
  NutzerEinstellungen,
  ProfilCustomFeld,
  S3Konfiguration,
  ShareDownloadLink,
  SmtpKonfiguration,
  SpielerFreigabe,
  SpielerUnit,
  TagFeldKonfig,
  TeamEinladung,
  TeamFreigabeEintrag,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
  VideoModulTab,
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
  // Core-Navigation (Hub, Modul, zentrale Einstellungen)
  const [bereich, setBereich] = useState<CoreBereich>('hub');
  const [aktivesModulId, setAktivesModulId] = useState<ModulId | null>(null);
  const [videoTab, setVideoTab] = useState<VideoModulTab>('dashboard');

  // Konto & produktiver Rollen-Ansichtsumschalter
  const [kontoId, setKontoId] = useState<string>(DEMO_PROFILE[0].id);
  const [aktiveTeamAnsicht, setAktiveTeamAnsicht] = useState<TeamRolle | null>(
    DEMO_PROFILE[0].teamRolle
  );

  // Core-Plattform-Zustand (Module, Teams, Benutzer, Mitgliedschaften, Einladungen, S3 & SMTP)
  const [globalAktivierteModule, setGlobalAktivierteModule] = useState<ModulId[]>(
    STANDARD_AKTIVIERTE_MODULE
  );
  const [teams, setTeams] = useState<TeamKontext[]>(INITIALE_TEAMS);
  const [aktivesTeamId, setAktivesTeamId] = useState<string>(INITIALE_TEAMS[0].id);
  const [benutzerListe, setBenutzerListe] = useState<BenutzerKonto[]>(INITIALE_BENUTZER);
  const [mitgliedschaften, setMitgliedschaften] = useState<TeamMitgliedschaft[]>(
    INITIALE_MITGLIEDSCHAFTEN
  );
  const [einladungen, setEinladungen] = useState<TeamEinladung[]>(INITIALE_EINLADUNGEN);
  const [s3Konfig, setS3Konfig] = useState<S3Konfiguration>(INITIALE_S3_KONFIG);
  const [smtpKonfig, setSmtpKonfig] = useState<SmtpKonfiguration>(INITIALE_SMTP_KONFIG);

  // Modul-Zustand: Videoanalyse
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
  const aktivesTeam = teams.find((t) => t.id === aktivesTeamId) ?? teams[0];
  const aktuellerBenutzer =
    benutzerListe.find((b) => b.uuid === konto.userUuid) ?? benutzerListe[0];
  const aktuelleMitgliedschaft =
    mitgliedschaften.find(
      (m) => m.userUuid === konto.userUuid && m.teamId === aktivesTeam.id
    ) ?? null;

  const waehlbareAnsichten = ermittleWaehlbareTeamAnsichten(konto);
  const kannAnsichtWechseln = darfAnsichtWechseln(konto);
  const istVorschauModus =
    aktiveTeamAnsicht !== null &&
    konto.teamRolle !== null &&
    aktiveTeamAnsicht !== konto.teamRolle;

  const videoModulAktiv = istModulFuerTeamAktiv(
    'video-analysis',
    globalAktivierteModule,
    aktivesTeam.aktivierteModule
  );

  const sichtbareTeamReels = reels.filter(
    (r) =>
      r.teamId === aktivesTeam.id &&
      (aktiveTeamAnsicht === 'PLAYER' ? r.visibility !== 'COACHES_ONLY' : true)
  );

  const ausgewaehltesReel =
    sichtbareTeamReels.find((r) => r.id === ausgewaehltesReelId) ??
    sichtbareTeamReels[0] ??
    null;

  const ausstehendeAnfragenAnzahl = mitgliedschaften.filter(
    (m) => m.teamId === aktivesTeam.id && m.status === 'WARTET_AUF_FREIGABE'
  ).length;

  const teamPlayAnzahl = sichtbareTeamReels.reduce((s, r) => s + r.playCount, 0);

  const handleNutzerEinstellungenAendern = (neu: NutzerEinstellungen) => {
    setNutzerEinstellungen(neu);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(neu));
    } catch {
      // Speicher im eingebetteten Kontext ggf. deaktiviert
    }
  };

  // --- Navigation ---
  const handleLogoKlick = () => {
    setAktivesModulId(null);
    setBereich(aktiveTeamAnsicht === null ? 'sysadmin' : 'hub');
  };

  const handleBereichWechseln = (ziel: CoreBereich) => {
    if (ziel !== 'modul') {
      setAktivesModulId(null);
    }
    setBereich(ziel);
  };

  const handleModulOeffnen = (modulId: ModulId) => {
    if (!istModulFuerTeamAktiv(modulId, globalAktivierteModule, aktivesTeam.aktivierteModule)) {
      return;
    }
    setAktivesModulId(modulId);
    setBereich('modul');
    if (modulId === 'video-analysis') {
      setVideoTab('dashboard');
    }
  };

  const handleKontoWechseln = (neueId: string) => {
    const neu = DEMO_PROFILE.find((p) => p.id === neueId);
    if (!neu) return;
    setKontoId(neueId);
    setAktiveTeamAnsicht(neu.teamRolle);

    if (neu.teamRolle === null) {
      setAktivesModulId(null);
      setBereich('sysadmin');
      return;
    }
    if (!neu.istSysadmin && bereich === 'sysadmin') {
      setAktivesModulId(null);
      setBereich('hub');
      return;
    }
    if (neu.teamRolle !== 'TEAM_ADMIN' && bereich === 'team-settings') {
      setAktivesModulId(null);
      setBereich('hub');
      return;
    }
    if (neu.teamRolle === 'PLAYER' && bereich === 'modul' && videoTab === 'cut-sync') {
      setVideoTab('dashboard');
    }
  };

  const handleTeamAnsichtWechseln = (zielRolle: TeamRolle) => {
    if (!waehlbareAnsichten.includes(zielRolle)) return;
    setAktiveTeamAnsicht(zielRolle);

    if (bereich === 'sysadmin') {
      setAktivesModulId(null);
      setBereich('hub');
      return;
    }
    if (zielRolle !== 'TEAM_ADMIN' && bereich === 'team-settings') {
      setAktivesModulId(null);
      setBereich('hub');
      return;
    }
    if (zielRolle === 'PLAYER' && bereich === 'modul' && videoTab === 'cut-sync') {
      setVideoTab('dashboard');
    }
  };

  const handlePrimaerAktion = () => {
    if (bereich === 'modul' && aktivesModulId === 'video-analysis') {
      if (aktiveTeamAnsicht === 'COACH' || aktiveTeamAnsicht === 'TEAM_ADMIN') {
        setVideoTab('dashboard');
        setUploadHervorgehoben(true);
        setTimeout(() => {
          document.getElementById('upload-panel')?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
        setTimeout(() => setUploadHervorgehoben(false), 1800);
      } else {
        setVideoTab('film-room');
      }
      return;
    }

    if (bereich === 'modul') {
      handleLogoKlick();
      return;
    }

    if (aktiveTeamAnsicht === null) {
      setBereich('sysadmin');
      return;
    }

    if (videoModulAktiv) {
      handleModulOeffnen('video-analysis');
    } else {
      setBereich('hub');
    }
  };

  // --- Core-Stammdaten-Handler (Sysadmin / Team Admin / Profil) ---
  const handleGlobalModulToggle = (modulId: ModulId) => {
    setGlobalAktivierteModule((alt) => {
      const aktiv = alt.includes(modulId);
      const neu = aktiv ? alt.filter((id) => id !== modulId) : [...alt, modulId];
      if (aktiv && aktivesModulId === modulId) {
        setAktivesModulId(null);
        setBereich('hub');
      }
      return neu;
    });
  };

  const handleTeamModulToggle = (teamId: string, modulId: ModulId) => {
    setTeams((alt) =>
      alt.map((team) => {
        if (team.id !== teamId) return team;
        const hat = team.aktivierteModule.includes(modulId);
        return {
          ...team,
          aktivierteModule: hat
            ? team.aktivierteModule.filter((id) => id !== modulId)
            : [...team.aktivierteModule, modulId],
        };
      })
    );
  };

  const handleTeamAktualisieren = (aktualisiert: TeamKontext) => {
    setTeams((alt) => alt.map((t) => (t.id === aktualisiert.id ? aktualisiert : t)));
  };

  const handleTeamErstellen = (neuesTeam: TeamKontext) => {
    setTeams((alt) => [...alt, neuesTeam]);
  };

  const handleTeamArchivToggle = (teamId: string) => {
    setTeams((alt) =>
      alt.map((t) => (t.id === teamId ? { ...t, archiviert: !t.archiviert } : t))
    );
  };

  const handleTeamLoeschen = (teamId: string) => {
    setTeams((alt) => {
      const rest = alt.filter((t) => t.id !== teamId);
      if (rest.length > 0 && aktivesTeamId === teamId) {
        setAktivesTeamId(rest[0].id);
      }
      return rest;
    });
    setMitgliedschaften((alt) => alt.filter((m) => m.teamId !== teamId));
    setEinladungen((alt) => alt.filter((e) => e.teamId !== teamId));
  };

  const handleBenutzerAktualisieren = (aktualisiert: BenutzerKonto) => {
    setBenutzerListe((alt) =>
      alt.map((b) => (b.uuid === aktualisiert.uuid ? aktualisiert : b))
    );
  };

  const handleBenutzerErstellen = (
    benutzer: BenutzerKonto,
    teamZuweisung?: { teamId: string; rolle: TeamRolle }
  ) => {
    setBenutzerListe((alt) => [...alt, benutzer]);
    if (teamZuweisung) {
      setMitgliedschaften((alt) => [
        ...alt,
        {
          id: `mem-${Date.now()}`,
          userUuid: benutzer.uuid,
          teamId: teamZuweisung.teamId,
          rolle: teamZuweisung.rolle,
          units: ['OFFENSE'],
          status: 'AKTIV',
          beigetretenAm: new Date().toISOString().slice(0, 10),
        },
      ]);
    }
  };

  const handleBenutzerSysadminToggle = (userUuid: string) => {
    setBenutzerListe((alt) =>
      alt.map((b) => (b.uuid === userUuid ? { ...b, istSysadmin: !b.istSysadmin } : b))
    );
  };

  const handleBenutzerLoeschen = (userUuid: string) => {
    setBenutzerListe((alt) => alt.filter((b) => b.uuid !== userUuid));
    setMitgliedschaften((alt) => alt.filter((m) => m.userUuid !== userUuid));
  };

  const handleMitgliedRolleAendern = (mitgliedschaftId: string, rolle: TeamRolle) => {
    setMitgliedschaften((alt) =>
      alt.map((m) => (m.id === mitgliedschaftId ? { ...m, rolle } : m))
    );
  };

  const handleMitgliedUnitsAendern = (mitgliedschaftId: string, units: SpielerUnit[]) => {
    setMitgliedschaften((alt) =>
      alt.map((m) => (m.id === mitgliedschaftId ? { ...m, units } : m))
    );
  };

  const handleMitgliedBestaetigen = (mitgliedschaftId: string) => {
    setMitgliedschaften((alt) =>
      alt.map((m) => (m.id === mitgliedschaftId ? { ...m, status: 'AKTIV' } : m))
    );
  };

  const handleMitgliedEntfernen = (mitgliedschaftId: string) => {
    setMitgliedschaften((alt) => alt.filter((m) => m.id !== mitgliedschaftId));
  };

  const handleEinladungErstellen = (einladung: TeamEinladung) => {
    setEinladungen((alt) => [einladung, ...alt]);
  };

  const handleEinladungWiderrufen = (einladungId: string) => {
    setEinladungen((alt) => alt.filter((e) => e.id !== einladungId));
  };

  const handleProfilCustomFeldHinzufuegen = (teamId: string, feld: ProfilCustomFeld) => {
    setTeams((alt) =>
      alt.map((t) =>
        t.id === teamId
          ? { ...t, customProfilFelder: [...t.customProfilFelder, feld] }
          : t
      )
    );
  };

  const handleProfilCustomFeldLoeschen = (teamId: string, key: string) => {
    setTeams((alt) =>
      alt.map((t) =>
        t.id === teamId
          ? { ...t, customProfilFelder: t.customProfilFelder.filter((f) => f.key !== key) }
          : t
      )
    );
  };

  // --- Videoanalyse-Handler ---
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

  const handleDefinitionLernen = (feldKey: BreakdownFeldKey, begriff: string) => {
    setTagSchema((alt) => registriereDefinitionWennNeu(alt, feldKey, begriff));
  };

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
    setAktivesModulId('video-analysis');
    setBereich('modul');
    setVideoTab('film-room');
  };

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#E6EDF3]">
      <CoreTopBar
        bereich={bereich}
        aktivesModulId={aktivesModulId}
        videoTab={videoTab}
        konto={konto}
        aktiveTeamAnsicht={aktiveTeamAnsicht}
        ausstehendeAnfragenAnzahl={ausstehendeAnfragenAnzahl}
        onLogoKlick={handleLogoKlick}
        onBereichWechseln={handleBereichWechseln}
        onVideoTabWechseln={setVideoTab}
        onPrimaerAktion={handlePrimaerAktion}
      />

      {/* Kontext-Leiste: Team-Wahl, produktiver Ansichts-Umschalter (nur bei Rollen unter sich) & Demo-Konto */}
      <div className="border-b border-[#232933] bg-[#0F1318]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-2.5">
          <div className="flex items-center gap-3">
            {aktiveTeamAnsicht === null || bereich === 'sysadmin' ? (
              <span className="text-xs font-medium text-[#8B949E]">
                Instanz-Verwaltung · Sysadmin-Bereich (getrennt von Team-Daten)
              </span>
            ) : (
              <label className="flex items-center gap-2 text-xs text-[#8B949E]">
                <span>Team</span>
                <select
                  value={aktivesTeam.id}
                  onChange={(e) => setAktivesTeamId(e.target.value)}
                  className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1 text-xs font-medium text-white focus:border-[#F59E0B] focus:outline-none"
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id} className="bg-[#13171D]">
                      {team.name} · {team.saison}
                      {team.archiviert ? ' (Archiv)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
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
        {bereich === 'sysadmin' && konto.istSysadmin ? (
          <SysadminPage
            globalAktivierteModule={globalAktivierteModule}
            teams={teams}
            benutzerListe={benutzerListe}
            mitgliedschaften={mitgliedschaften}
            s3Konfig={s3Konfig}
            smtpKonfig={smtpKonfig}
            onGlobalModulToggle={handleGlobalModulToggle}
            onTeamModulToggle={handleTeamModulToggle}
            onTeamErstellen={handleTeamErstellen}
            onTeamArchivToggle={handleTeamArchivToggle}
            onTeamLoeschen={handleTeamLoeschen}
            onBenutzerErstellen={handleBenutzerErstellen}
            onBenutzerSysadminToggle={handleBenutzerSysadminToggle}
            onBenutzerLoeschen={handleBenutzerLoeschen}
            onS3Speichern={setS3Konfig}
            onSmtpSpeichern={setSmtpKonfig}
          />
        ) : aktiveTeamAnsicht === null ? (
          <SysadminPage
            globalAktivierteModule={globalAktivierteModule}
            teams={teams}
            benutzerListe={benutzerListe}
            mitgliedschaften={mitgliedschaften}
            s3Konfig={s3Konfig}
            smtpKonfig={smtpKonfig}
            onGlobalModulToggle={handleGlobalModulToggle}
            onTeamModulToggle={handleTeamModulToggle}
            onTeamErstellen={handleTeamErstellen}
            onTeamArchivToggle={handleTeamArchivToggle}
            onTeamLoeschen={handleTeamLoeschen}
            onBenutzerErstellen={handleBenutzerErstellen}
            onBenutzerSysadminToggle={handleBenutzerSysadminToggle}
            onBenutzerLoeschen={handleBenutzerLoeschen}
            onS3Speichern={setS3Konfig}
            onSmtpSpeichern={setSmtpKonfig}
          />
        ) : bereich === 'hub' ? (
          <SidelineHubView
            team={aktivesTeam}
            benutzer={aktuellerBenutzer}
            konto={konto}
            aktiveTeamAnsicht={aktiveTeamAnsicht}
            globalAktivierteModule={globalAktivierteModule}
            teamReelAnzahl={sichtbareTeamReels.length}
            teamPlayAnzahl={teamPlayAnzahl}
            ausstehendeAnfragenAnzahl={ausstehendeAnfragenAnzahl}
            onModulOeffnen={handleModulOeffnen}
            onBereichOeffnen={handleBereichWechseln}
          />
        ) : bereich === 'settings' ? (
          <UserSettingsPage
            benutzer={aktuellerBenutzer}
            team={aktivesTeam}
            mitgliedschaft={aktuelleMitgliedschaft}
            aktiveTeamAnsicht={aktiveTeamAnsicht}
            videoModulAktiv={videoModulAktiv}
            einstellungen={nutzerEinstellungen}
            onBenutzerAktualisieren={handleBenutzerAktualisieren}
            onEinstellungenAendern={handleNutzerEinstellungenAendern}
          />
        ) : bereich === 'team-settings' && aktiveTeamAnsicht === 'TEAM_ADMIN' ? (
          <TeamSettingsPage
            team={aktivesTeam}
            benutzerListe={benutzerListe}
            mitgliedschaften={mitgliedschaften}
            einladungen={einladungen}
            videoModulAktiv={videoModulAktiv}
            tagSchema={tagSchema}
            onTeamAktualisieren={handleTeamAktualisieren}
            onMitgliedRolleAendern={handleMitgliedRolleAendern}
            onMitgliedUnitsAendern={handleMitgliedUnitsAendern}
            onMitgliedBestaetigen={handleMitgliedBestaetigen}
            onMitgliedEntfernen={handleMitgliedEntfernen}
            onEinladungErstellen={handleEinladungErstellen}
            onEinladungWiderrufen={handleEinladungWiderrufen}
            onProfilCustomFeldHinzufuegen={handleProfilCustomFeldHinzufuegen}
            onProfilCustomFeldLoeschen={handleProfilCustomFeldLoeschen}
            onTagFeldToggle={handleFeldToggle}
            onTagDefinitionHinzufuegen={handleDefinitionLernen}
            onTagDefinitionLoeschen={handleDefinitionLoeschen}
            onTagCustomFeldErstellen={handleCustomFeldErstellen}
            onTagCustomFeldLoeschen={handleCustomFeldLoeschen}
          />
        ) : bereich === 'modul' && aktivesModulId === 'video-analysis' && videoModulAktiv ? (
          videoTab === 'dashboard' ? (
            <DashboardView
              teamId={aktivesTeam.id}
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
          ) : videoTab === 'film-room' && ausgewaehltesReel ? (
            <FilmRoomView
              key={ausgewaehltesReel.id}
              reel={ausgewaehltesReel}
              teamRolle={aktiveTeamAnsicht}
              tagSchema={tagSchema}
              nutzerEinstellungen={nutzerEinstellungen}
              onZurueck={() => setVideoTab('dashboard')}
              onSchemaSettingsOeffnen={() => {
                setAktivesModulId(null);
                setBereich('team-settings');
              }}
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
          ) : (
            <ModulePlaceholderView
              ansicht={videoTab === 'playlists' ? 'playlists' : 'cut-sync'}
              ausgewaehltesReel={ausgewaehltesReel}
              onZurueckZumDashboard={() => setVideoTab('dashboard')}
            />
          )
        ) : bereich === 'modul' &&
          aktivesModulId &&
          aktivesModulId !== 'video-analysis' &&
          istModulFuerTeamAktiv(
            aktivesModulId,
            globalAktivierteModule,
            aktivesTeam.aktivierteModule
          ) ? (
          <ModulePreviewView modulId={aktivesModulId} onZurUebersicht={handleLogoKlick} />
        ) : (
          <SidelineHubView
            team={aktivesTeam}
            benutzer={aktuellerBenutzer}
            konto={konto}
            aktiveTeamAnsicht={aktiveTeamAnsicht}
            globalAktivierteModule={globalAktivierteModule}
            teamReelAnzahl={sichtbareTeamReels.length}
            teamPlayAnzahl={teamPlayAnzahl}
            ausstehendeAnfragenAnzahl={ausstehendeAnfragenAnzahl}
            onModulOeffnen={handleModulOeffnen}
            onBereichOeffnen={handleBereichWechseln}
          />
        )}
      </main>
    </div>
  );
}
