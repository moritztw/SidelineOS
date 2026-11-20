import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Send,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Type,
  Undo2,
  Users,
} from 'lucide-react';
import type {
  BreakdownFeldKey,
  CanvasZeichnung,
  CoachNotiz,
  KommentarEcke,
  NormPunkt,
  SpielerFreigabe,
  TagFeldKonfig,
  TeamRolle,
  VideoReel,
  ZeichenWerkzeug,
} from '../../../shared/types.ts';
import { FREIGABE_LABELS } from '../../../shared/types.ts';
import { THUMB_ENDZONE, THUMB_SIDELINE } from '../data/demoReels.ts';
import { leseBreakdownWert } from '../services/taggingEngine.ts';
import { BreakdownGrid } from './BreakdownGrid.tsx';
import { TelestrationCanvas } from './TelestrationCanvas.tsx';

interface FilmRoomViewProps {
  reel: VideoReel;
  teamRolle: TeamRolle;
  tagSchema: TagFeldKonfig[];
  onZurueck: () => void;
  onSchemaSettingsOeffnen: () => void;
  onFreigabeAendern: (reelId: string, freigabe: SpielerFreigabe) => void;
  onFeldAendern: (
    reelId: string,
    playNumber: number,
    feldKey: BreakdownFeldKey,
    wert: string | number | undefined,
    istCustom: boolean
  ) => void;
  onDefinitionLernen: (feldKey: BreakdownFeldKey, wert: string) => void;
  onNotizHinzufuegen: (reelId: string, playNumber: number, notiz: CoachNotiz) => void;
  onZeichnungHinzufuegen: (reelId: string, playNumber: number, zeichnung: CanvasZeichnung) => void;
  onZeichnungAktualisieren: (
    reelId: string,
    playNumber: number,
    zeichnungId: string,
    punkte: NormPunkt[]
  ) => void;
  onZeichnungEntfernen: (reelId: string, playNumber: number, zeichnungId: string) => void;
  onLetzteZeichnungEntfernen: (reelId: string, playNumber: number, angle: string) => void;
  onAlleZeichnungenLeeren: (reelId: string, playNumber: number, angle: string) => void;
  onSessionVeroeffentlichen: (reelId: string) => void;
}

const TEAM_FARBEN = [
  { id: 'amber', hex: '#F59E0B', label: 'Highlight Amber' },
  { id: 'offense', hex: '#3B82F6', label: 'Offense Blau' },
  { id: 'defense', hex: '#EF4444', label: 'Defense Rot' },
  { id: 'route', hex: '#22C55E', label: 'Route Grün' },
  { id: 'white', hex: '#FFFFFF', label: 'Weiß' },
];

const FREIGABE_OPTIONEN: SpielerFreigabe[] = [
  'COACHES_ONLY',
  'ALL_PLAYERS',
  'UNIT_OFFENSE',
  'UNIT_DEFENSE',
  'UNIT_SPECIAL_TEAMS',
];

const ECKEN_POSITION_KLASSEN: Record<KommentarEcke, string> = {
  'top-left': 'top-3 left-3',
  'top-right': 'top-3 right-3',
  'bottom-left': 'bottom-16 left-3',
  'bottom-right': 'bottom-16 right-3',
};

const ECKEN_BUTTONS: Array<{ id: KommentarEcke; titel: string; kurz: string }> = [
  { id: 'top-left', titel: 'Oben links', kurz: '↖' },
  { id: 'top-right', titel: 'Oben rechts', kurz: '↗' },
  { id: 'bottom-left', titel: 'Unten links', kurz: '↙' },
  { id: 'bottom-right', titel: 'Unten rechts', kurz: '↘' },
];

function formatiereZeit(ms: number): string {
  const geklemmt = Math.max(0, ms);
  const sekundenGesamt = Math.floor(geklemmt / 1000);
  const minuten = Math.floor(sekundenGesamt / 60);
  const sekunden = sekundenGesamt % 60;
  const hundertstel = Math.floor((geklemmt % 1000) / 10);
  return `${String(minuten).padStart(2, '0')}:${String(sekunden).padStart(2, '0')}.${String(hundertstel).padStart(2, '0')}`;
}

export function FilmRoomView({
  reel,
  teamRolle,
  tagSchema,
  onZurueck,
  onSchemaSettingsOeffnen,
  onFreigabeAendern,
  onFeldAendern,
  onDefinitionLernen,
  onNotizHinzufuegen,
  onZeichnungHinzufuegen,
  onZeichnungAktualisieren,
  onZeichnungEntfernen,
  onLetzteZeichnungEntfernen,
  onAlleZeichnungenLeeren,
  onSessionVeroeffentlichen,
}: FilmRoomViewProps) {
  const istCoach = teamRolle === 'COACH' || teamRolle === 'TEAM_ADMIN';
  const istTeamAdmin = teamRolle === 'TEAM_ADMIN';

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const gestoppteTimestampsRef = useRef<Set<number>>(new Set());

  const [aktiverPlayIndex, setAktiverPlayIndex] = useState(0);
  const [aktiverWinkel, setAktiverWinkel] = useState<string>(reel.angles[0] ?? 'SIDELINE');
  const [laeuft, setLaeuft] = useState(false);
  const [zeitMs, setZeitMs] = useState(2400);
  const [geschwindigkeit, setGeschwindigkeit] = useState<0.5 | 1 | 1.5>(1);
  const [autoStop, setAutoStop] = useState(true);
  const [autoStopMeldung, setAutoStopMeldung] = useState<string | null>(null);
  const [publishBestaetigung, setPublishBestaetigung] = useState<string | null>(null);

  // Vollbild & Overlays über dem Video
  const [vollbildAktiv, setVollbildAktiv] = useState(false);
  const [zeichenOverlaySichtbar, setZeichenOverlaySichtbar] = useState(true);
  const [kommentarOverlaySichtbar, setKommentarOverlaySichtbar] = useState(true);
  const [kommentarEcke, setKommentarEcke] = useState<KommentarEcke>('top-right');

  const [werkzeug, setWerkzeug] = useState<ZeichenWerkzeug | null>('select');
  const [farbe, setFarbe] = useState<string>('#F59E0B');
  const [ausgewaehlteZeichnungId, setAusgewaehlteZeichnungId] = useState<string | null>(null);
  const [notizText, setNotizText] = useState('');
  const [tagGruppeTab, setTagGruppeTab] = useState<'ALLE' | 'SITUATION' | 'OFFENSE' | 'DEFENSE'>(
    'ALLE'
  );

  const sichererIndex = Math.min(aktiverPlayIndex, Math.max(0, reel.plays.length - 1));
  const aktiverPlay = reel.plays[sichererIndex] ?? null;

  const aktuelleQuelle = aktiverPlay?.sources[aktiverWinkel] ?? null;
  const dauerMs = useMemo(() => {
    if (!aktuelleQuelle) {
      const ersteQuelle = aktiverPlay
        ? Object.values(aktiverPlay.sources).find((q) => q !== null)
        : null;
      return ersteQuelle ? Math.max(1000, ersteQuelle.end_ms - ersteQuelle.start_ms) : 8000;
    }
    return Math.max(1000, aktuelleQuelle.end_ms - aktuelleQuelle.start_ms);
  }, [aktuelleQuelle, aktiverPlay]);

  // Zeichnungen strikt gefiltert nach dem AKTIVEN Video/Kamerawinkel + Rolle!
  const winkelZeichnungen = useMemo(() => {
    const alle = (aktiverPlay?.drawings ?? []).filter((z) => z.angle === aktiverWinkel);
    return istCoach ? alle : alle.filter((z) => z.status === 'PUBLISHED');
  }, [aktiverPlay, aktiverWinkel, istCoach]);

  const sichtbareZeichnungenJetzt = useMemo(
    () => winkelZeichnungen.filter((z) => Math.abs(z.timestamp_ms - zeitMs) <= 1400),
    [winkelZeichnungen, zeitMs]
  );

  const playNotizen = useMemo(() => {
    const alle = aktiverPlay?.notes ?? [];
    return istCoach
      ? alle
      : alle.filter((n) => n.status === 'PUBLISHED' || n.autorRolle === 'PLAYER');
  }, [aktiverPlay, istCoach]);

  const aktiveOverlayNotizen = useMemo(() => {
    const zeitnah = playNotizen.filter((n) => Math.abs(n.timestamp_ms - zeitMs) <= 2200);
    return zeitnah.length > 0 ? zeitnah : playNotizen.slice(0, 2);
  }, [playNotizen, zeitMs]);

  const gesamtEntwuerfe = useMemo(
    () =>
      reel.plays.reduce((summe, play) => {
        const draftNotes = (play.notes ?? []).filter((n) => n.status === 'DRAFT').length;
        const draftDrawings = (play.drawings ?? []).filter((d) => d.status === 'DRAFT').length;
        return summe + draftNotes + draftDrawings;
      }, 0),
    [reel.plays]
  );

  const aktiveTagFelder = useMemo(() => {
    const aktiv = tagSchema.filter((f) => f.aktiv);
    if (tagGruppeTab === 'ALLE') return aktiv;
    if (tagGruppeTab === 'SITUATION') {
      return aktiv.filter((f) => f.gruppe === 'SITUATION' || f.gruppe === 'RESULT' || f.gruppe === 'CUSTOM');
    }
    return aktiv.filter((f) => f.gruppe === tagGruppeTab || f.gruppe === 'CUSTOM');
  }, [tagSchema, tagGruppeTab]);

  // Native Fullscreen-Events abgleichen
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setVollbildAktiv(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleVollbild = async () => {
    if (!vollbildAktiv) {
      setVollbildAktiv(true);
      try {
        if (playerContainerRef.current?.requestFullscreen) {
          await playerContainerRef.current.requestFullscreen();
        }
      } catch {
        // Fallback: CSS-Vollbild greift automatisch über vollbildAktiv
      }
    } else {
      setVollbildAktiv(false);
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        // ignorieren
      }
    }
  };

  const wechslePlay = (neuerIndex: number) => {
    if (neuerIndex < 0 || neuerIndex >= reel.plays.length) return;
    setAktiverPlayIndex(neuerIndex);
    setLaeuft(false);
    setAutoStopMeldung(null);
    setAusgewaehlteZeichnungId(null);
    gestoppteTimestampsRef.current.clear();

    const zielPlay = reel.plays[neuerIndex];
    const ersteMarkierung =
      zielPlay.drawings?.find((d) => d.angle === aktiverWinkel)?.timestamp_ms ??
      zielPlay.notes?.[0]?.timestamp_ms ??
      0;
    setZeitMs(ersteMarkierung);

    if (zielPlay && !zielPlay.sources[aktiverWinkel]) {
      const ersatz = reel.angles.find((w) => zielPlay.sources[w] !== null);
      if (ersatz) setAktiverWinkel(ersatz);
    }
  };

  // Playback-Loop mit Auto-Stop bei Zeichnungen im AKTIVEN Winkel
  useEffect(() => {
    if (!laeuft) return;
    let letzterFrame = performance.now();
    let rafId = 0;

    const schritt = (jetzt: number) => {
      const delta = (jetzt - letzterFrame) * geschwindigkeit;
      letzterFrame = jetzt;

      setZeitMs((alt) => {
        const neu = alt + delta;

        if (autoStop) {
          const getroffene = winkelZeichnungen.find(
            (z) =>
              z.timestamp_ms >= alt &&
              z.timestamp_ms <= neu + 40 &&
              !gestoppteTimestampsRef.current.has(z.timestamp_ms)
          );
          if (getroffene) {
            gestoppteTimestampsRef.current.add(getroffene.timestamp_ms);
            setLaeuft(false);
            setAutoStopMeldung(
              `Auto-Stop bei ${formatiereZeit(getroffene.timestamp_ms)} · Zeichnung erreicht`
            );
            return getroffene.timestamp_ms;
          }
        }

        if (neu >= dauerMs) {
          setLaeuft(false);
          gestoppteTimestampsRef.current.clear();
          return dauerMs;
        }
        return neu;
      });

      rafId = requestAnimationFrame(schritt);
    };

    rafId = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(rafId);
  }, [laeuft, geschwindigkeit, dauerMs, autoStop, winkelZeichnungen]);

  // Tastaturkürzel im Film Room
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (
        ziel &&
        (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'Escape' && vollbildAktiv) {
        setVollbildAktiv(false);
        return;
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        ausgewaehlteZeichnungId &&
        aktiverPlay &&
        istCoach
      ) {
        e.preventDefault();
        onZeichnungEntfernen(reel.id, aktiverPlay.play_number, ausgewaehlteZeichnungId);
        setAusgewaehlteZeichnungId(null);
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setAutoStopMeldung(null);
        setLaeuft((aktiv) => {
          if (!aktiv && zeitMs >= dauerMs - 50) {
            setZeitMs(0);
            gestoppteTimestampsRef.current.clear();
          }
          return !aktiv;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        wechslePlay(sichererIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        wechslePlay(sichererIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setLaeuft(false);
        setZeitMs((t) => Math.min(dauerMs, t + 100));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setLaeuft(false);
        setZeitMs((t) => Math.max(0, t - 100));
      } else if (e.key.toLowerCase() === 'a' && reel.angles.length > 1 && aktiverPlay) {
        const idx = reel.angles.indexOf(aktiverWinkel);
        const naechster = reel.angles[(idx + 1) % reel.angles.length];
        if (aktiverPlay.sources[naechster]) {
          setAktiverWinkel(naechster);
          setAusgewaehlteZeichnungId(null);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleNotizSpeichern = () => {
    if (!aktiverPlay || !notizText.trim()) return;
    onNotizHinzufuegen(reel.id, aktiverPlay.play_number, {
      id: `note-${Date.now()}`,
      timestamp_ms: Math.round(zeitMs),
      text: notizText.trim(),
      status: istCoach ? 'DRAFT' : 'PUBLISHED',
      autorRolle: istCoach ? 'COACH' : 'PLAYER',
    });
    setNotizText('');
  };

  const handlePublish = () => {
    if (gesamtEntwuerfe === 0) return;
    const anzahl = gesamtEntwuerfe;
    onSessionVeroeffentlichen(reel.id);
    setPublishBestaetigung(`${anzahl} Entwurf/Entwürfe für das Team freigeschaltet.`);
    setTimeout(() => setPublishBestaetigung(null), 2600);
  };

  const hintergrundBild =
    aktiverWinkel === 'ENDZONE' ? THUMB_ENDZONE : reel.thumbnailUrl || THUMB_SIDELINE;

  const fortschrittProzent = Math.min(100, Math.max(0, (zeitMs / dauerMs) * 100));
  const optionalerOffsetMs = aktuelleQuelle?.offset_ms;
  const zeigeOffset = optionalerOffsetMs !== undefined && optionalerOffsetMs !== 0;

  const simulierterScale = 1 + (fortschrittProzent / 100) * 0.04;
  const simulierterShiftX = (fortschrittProzent / 100 - 0.5) * -1.8;

  const istFlagPlay = aktiverPlay?.breakdown?.result?.toUpperCase() === 'FLAG';

  return (
    <div className="space-y-4">
      {/* Datalists für Quick-Tag Comboboxen */}
      {tagSchema
        .filter((f) => f.aktiv && f.typ === 'combobox' && f.definitionen)
        .map((feld) => (
          <datalist key={`qt-dl-${feld.key}`} id={`qt-dl-${feld.key}`}>
            {feld.definitionen!.map((def) => (
              <option key={def} value={def} />
            ))}
          </datalist>
        ))}

      {/* Film Room Kopfzeile */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#232933] bg-[#13171D] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onZurueck}
            className="inline-flex items-center gap-1.5 rounded border border-[#232933] bg-[#0B0E11] px-2.5 py-1.5 text-xs text-[#8B949E] transition-colors hover:border-[#36404F] hover:text-white whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Bibliothek
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-white">{reel.title}</h1>
            <div className="text-[11px] text-[#8B949E]">
              {aktiverPlay
                ? `Play #${aktiverPlay.play_number} von ${reel.plays.length} · ${aktuelleQuelle?.file ?? 'Kein Clip im Winkel'} · Zeichnungen nur für ${aktiverWinkel}`
                : 'Keine Plays vorhanden'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {istCoach && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-[#8B949E]">
                {reel.visibility === 'COACHES_ONLY' ? (
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Users className="h-3.5 w-3.5 text-[#4ADE80]" aria-hidden="true" />
                )}
                <select
                  aria-label="Spieler-Freigabe für dieses Reel"
                  value={reel.visibility}
                  onChange={(e) =>
                    onFreigabeAendern(reel.id, e.target.value as SpielerFreigabe)
                  }
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium focus:border-[#F59E0B] focus:outline-none ${
                    reel.visibility === 'COACHES_ONLY'
                      ? 'border-[#232933] bg-[#0B0E11] text-[#8B949E]'
                      : 'border-[#16A34A]/40 bg-[#16A34A]/10 text-[#86EFAC]'
                  }`}
                >
                  {FREIGABE_OPTIONEN.map((opt) => (
                    <option key={opt} value={opt} className="bg-[#13171D] text-[#E6EDF3]">
                      Freigabe: {FREIGABE_LABELS[opt]}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                disabled={gesamtEntwuerfe === 0}
                onClick={handlePublish}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#F59E0B] px-3.5 py-1.5 text-xs font-semibold text-[#0B0E11] transition-colors hover:bg-[#FBBF24] disabled:cursor-not-allowed disabled:bg-[#232933] disabled:text-[#6E7681] whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Publish Session ({gesamtEntwuerfe})
              </button>
            </>
          )}
        </div>
      </div>

      {publishBestaetigung && (
        <div
          role="status"
          className="rounded-md border border-[#16A34A]/40 bg-[#16A34A]/10 px-4 py-2 text-xs text-[#86EFAC]"
        >
          {publishBestaetigung}
        </div>
      )}

      {/* Oberer Arbeitsbereich: Links Video + Overlays | Rechts Quick Tags & Notizen */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Video-Player Container (unterstützt Vollbildmodus inkl. Zeichen- & Kommentar-Overlays) */}
        <section
          ref={playerContainerRef}
          className={
            vollbildAktiv
              ? 'fixed inset-0 z-50 flex flex-col bg-[#0B0E11]'
              : 'overflow-hidden rounded-lg border border-[#232933] bg-[#13171D]'
          }
        >
          <div
            className={`relative w-full overflow-hidden bg-black ${
              vollbildAktiv ? 'flex-1' : 'aspect-video'
            }`}
          >
            {aktuelleQuelle ? (
              <img
                src={hintergrundBild}
                alt={`Spielfeldansicht ${aktiverWinkel} Play ${aktiverPlay?.play_number ?? ''}`}
                referrerPolicy="no-referrer"
                style={{
                  transform: `scale(${simulierterScale}) translateX(${simulierterShiftX}%)`,
                  transition: laeuft ? 'transform 120ms linear' : 'transform 200ms ease-out',
                }}
                className="h-full w-full select-none object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-[#0B0E11] px-6 text-center">
                <p className="text-sm font-medium text-[#E6EDF3]">
                  Kein {aktiverWinkel}-Clip für Play #{aktiverPlay?.play_number} vorhanden
                </p>
                <p className="mt-1 text-xs text-[#8B949E]">
                  Wechsle unten auf einen verfügbaren Kamerawinkel.
                </p>
              </div>
            )}

            {/* Winkel-gebundenes, editierbares Vektor-Canvas */}
            {aktiverPlay && aktuelleQuelle && (
              <TelestrationCanvas
                zeichnungen={sichtbareZeichnungenJetzt}
                aktivesWerkzeug={istCoach ? werkzeug : null}
                aktiveFarbe={farbe}
                bearbeitbar={istCoach}
                ausgewaehlteId={ausgewaehlteZeichnungId}
                onAuswaehlen={setAusgewaehlteZeichnungId}
                onZeichnungHinzufuegen={(teil) => {
                  setLaeuft(false);
                  const neu: CanvasZeichnung = {
                    ...teil,
                    id: `draw-${Date.now()}`,
                    angle: aktiverWinkel,
                    timestamp_ms: Math.round(zeitMs),
                    status: 'DRAFT',
                  };
                  onZeichnungHinzufuegen(reel.id, aktiverPlay.play_number, neu);
                  if (teil.werkzeug !== 'pen') {
                    setAusgewaehlteZeichnungId(neu.id);
                  }
                }}
                onZeichnungAktualisieren={(id, punkte) =>
                  onZeichnungAktualisieren(reel.id, aktiverPlay.play_number, id, punkte)
                }
              />
            )}

            {/* Verschiebbares Kommentar-Overlay in wählbarer Ecke über dem Video */}
            {kommentarOverlaySichtbar && aktiveOverlayNotizen.length > 0 && (
              <div
                className={`absolute z-20 max-w-xs rounded-md border border-[#232933] bg-[#0B0E11]/88 p-2.5 backdrop-blur-sm ${ECKEN_POSITION_KLASSEN[kommentarEcke]}`}
              >
                <div className="flex items-center justify-between gap-3 border-b border-[#232933] pb-1.5">
                  <span className="text-[10px] font-semibold text-[#F59E0B]">
                    Kommentare · P#{aktiverPlay?.play_number}
                  </span>
                  <div className="flex items-center gap-0.5" title="Overlay-Ecke wechseln">
                    {ECKEN_BUTTONS.map((btn) => (
                      <button
                        key={btn.id}
                        type="button"
                        title={btn.titel}
                        aria-label={`Kommentare nach ${btn.titel} verschieben`}
                        onClick={() => setKommentarEcke(btn.id)}
                        className={`rounded px-1 text-[10px] leading-4 transition-colors ${
                          kommentarEcke === btn.id
                            ? 'bg-[#F59E0B] font-semibold text-[#0B0E11]'
                            : 'text-[#8B949E] hover:bg-[#232933] hover:text-white'
                        }`}
                      >
                        {btn.kurz}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="mt-1.5 space-y-1.5">
                  {aktiveOverlayNotizen.map((n, idx) => (
                    <li key={n.id ?? idx} className="text-[11px] leading-snug text-[#E6EDF3]">
                      <span className="mr-1.5 font-mono text-[10px] text-[#8B949E] tabular-nums">
                        {formatiereZeit(n.timestamp_ms)}
                      </span>
                      {n.status === 'DRAFT' && (
                        <span className="mr-1.5 font-mono text-[10px] text-[#F59E0B]">[DRAFT]</span>
                      )}
                      <span>{n.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Auto-Stop Hinweis */}
            {autoStopMeldung && (
              <div className="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded border border-[#F59E0B]/60 bg-[#0B0E11]/92 px-3 py-1 font-mono text-[11px] text-[#FBBF24]">
                {autoStopMeldung}
              </div>
            )}

            {/* Schwebende Zeichenwerkzeug-Leiste direkt unten über dem Video (auch im Vollbild!) */}
            {istCoach && aktiverPlay && aktuelleQuelle && zeichenOverlaySichtbar && (
              <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[96%] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-md border border-[#303846] bg-[#0B0E11]/92 px-2.5 py-1.5 backdrop-blur-sm">
                {(
                  [
                    { id: 'select', label: 'Bearbeiten', Icon: MousePointer2 },
                    { id: 'pen', label: 'Stift', Icon: Pencil },
                    { id: 'arrow', label: 'Pfeil', Icon: ArrowUpRight },
                    { id: 'spotlight', label: 'Spot', Icon: CircleDot },
                    { id: 'text', label: 'Text', Icon: Type },
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const aktiv = werkzeug === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setWerkzeug(aktiv ? null : id)}
                      title={
                        id === 'select'
                          ? 'Pfeile, Spotlights und Text verschieben oder skalieren'
                          : label
                      }
                      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                        aktiv
                          ? 'bg-[#F59E0B] text-[#0B0E11]'
                          : 'text-[#E6EDF3] hover:bg-[#1E2530]'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  );
                })}

                <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-[#232933]" />

                {/* Farbpalette */}
                <div className="flex items-center gap-1">
                  {TEAM_FARBEN.map((swatch) => (
                    <button
                      key={swatch.id}
                      type="button"
                      title={swatch.label}
                      aria-label={swatch.label}
                      onClick={() => setFarbe(swatch.hex)}
                      style={{ backgroundColor: swatch.hex }}
                      className={`h-4 w-4 rounded border transition-transform ${
                        farbe === swatch.hex
                          ? 'scale-115 border-white ring-1 ring-white'
                          : 'border-[#232933]'
                      }`}
                    />
                  ))}
                </div>

                <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-[#232933]" />

                {ausgewaehlteZeichnungId && (
                  <button
                    type="button"
                    onClick={() => {
                      onZeichnungEntfernen(reel.id, aktiverPlay.play_number, ausgewaehlteZeichnungId);
                      setAusgewaehlteZeichnungId(null);
                    }}
                    title="Ausgewähltes Objekt löschen (Entf)"
                    className="inline-flex items-center gap-1 rounded border border-[#DC2626]/40 bg-[#DC2626]/15 px-2 py-1 text-[11px] text-[#FCA5A5] hover:bg-[#DC2626]/25"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    Objekt
                  </button>
                )}

                <button
                  type="button"
                  disabled={winkelZeichnungen.length === 0}
                  onClick={() =>
                    onLetzteZeichnungEntfernen(reel.id, aktiverPlay.play_number, aktiverWinkel)
                  }
                  title="Letzte Zeichnung in diesem Winkel rückgängig"
                  className="rounded p-1 text-[#8B949E] hover:bg-[#1E2530] hover:text-white disabled:opacity-35"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={winkelZeichnungen.length === 0}
                  onClick={() => {
                    onAlleZeichnungenLeeren(reel.id, aktiverPlay.play_number, aktiverWinkel);
                    setAusgewaehlteZeichnungId(null);
                  }}
                  title="Alle Zeichnungen dieses Winkels leeren"
                  className="rounded p-1 text-[#8B949E] hover:bg-[#1E2530] hover:text-[#FCA5A5] disabled:opacity-35"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-[11px] text-[#8B949E]">
                  <input
                    type="checkbox"
                    checked={autoStop}
                    onChange={(e) => setAutoStop(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#F59E0B]"
                  />
                  <span>Auto-Stop</span>
                </label>
              </div>
            )}
          </div>

          {/* Timeline Scrub-Bar */}
          <div className="border-t border-[#232933] bg-[#0F1318] px-4 pt-2.5 pb-1">
            <div className="relative flex h-5 items-center">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#232933]">
                <div
                  className="h-full bg-[#F59E0B]"
                  style={{ width: `${fortschrittProzent}%` }}
                />
              </div>

              {winkelZeichnungen.map((z) => {
                const pos = Math.min(100, Math.max(0, (z.timestamp_ms / dauerMs) * 100));
                return (
                  <button
                    key={z.id}
                    type="button"
                    title={`Zeichnung (${z.angle}) bei ${formatiereZeit(z.timestamp_ms)}`}
                    onClick={() => {
                      setLaeuft(false);
                      setZeitMs(z.timestamp_ms);
                    }}
                    style={{ left: `${pos}%` }}
                    className="absolute top-0.5 h-4 w-1.5 -translate-x-1/2 rounded-sm bg-[#3B82F6] hover:bg-white"
                  />
                );
              })}

              <input
                type="range"
                aria-label="Videoposition"
                min={0}
                max={dauerMs}
                step={20}
                value={Math.round(zeitMs)}
                onChange={(e) => {
                  setLaeuft(false);
                  setAutoStopMeldung(null);
                  setZeitMs(Number(e.target.value));
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>

          {/* Transport-Leiste + Overlays + Winkel + Vollbild */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0F1318] px-4 py-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={sichererIndex === 0}
                onClick={() => wechslePlay(sichererIndex - 1)}
                aria-label="Vorheriges Play"
                className="rounded p-1.5 text-[#8B949E] hover:bg-[#1E2530] hover:text-white disabled:opacity-35"
              >
                <SkipBack className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setLaeuft(false);
                  setZeitMs((t) => Math.max(0, t - 100));
                }}
                aria-label="Ein Frame zurück"
                className="rounded p-1.5 text-[#8B949E] hover:bg-[#1E2530] hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoStopMeldung(null);
                  if (!laeuft && zeitMs >= dauerMs - 50) {
                    setZeitMs(0);
                    gestoppteTimestampsRef.current.clear();
                  }
                  setLaeuft((v) => !v);
                }}
                aria-label={laeuft ? 'Pause' : 'Abspielen'}
                className="rounded-md bg-[#F59E0B] p-1.5 text-[#0B0E11] hover:bg-[#FBBF24]"
              >
                {laeuft ? (
                  <Pause className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLaeuft(false);
                  setZeitMs((t) => Math.min(dauerMs, t + 100));
                }}
                aria-label="Ein Frame vor"
                className="rounded p-1.5 text-[#8B949E] hover:bg-[#1E2530] hover:text-white"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={sichererIndex >= reel.plays.length - 1}
                onClick={() => wechslePlay(sichererIndex + 1)}
                aria-label="Nächstes Play"
                className="rounded p-1.5 text-[#8B949E] hover:bg-[#1E2530] hover:text-white disabled:opacity-35"
              >
                <SkipForward className="h-4 w-4" aria-hidden="true" />
              </button>

              <span className="ml-2 font-mono text-xs text-[#E6EDF3] tabular-nums">
                {formatiereZeit(zeitMs)}{' '}
                <span className="text-[#6E7681]">/ {formatiereZeit(dauerMs)}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setGeschwindigkeit((g) => (g === 1 ? 0.5 : g === 0.5 ? 1.5 : 1))
                }
                className="rounded border border-[#232933] bg-[#13171D] px-2 py-1 font-mono text-[11px] text-[#E6EDF3] hover:border-[#36404F]"
              >
                {geschwindigkeit.toFixed(1)}x
              </button>

              {/* Multi-Angle-Switcher */}
              <div
                role="group"
                aria-label="Kamerawinkel wählen"
                className="flex items-center gap-0.5 rounded border border-[#232933] bg-[#13171D] p-0.5"
              >
                {reel.angles.map((winkel) => {
                  const verfuegbar = Boolean(aktiverPlay?.sources[winkel]);
                  const aktiv = aktiverWinkel === winkel;
                  return (
                    <button
                      key={winkel}
                      type="button"
                      disabled={!verfuegbar}
                      onClick={() => {
                        setAktiverWinkel(winkel);
                        setAusgewaehlteZeichnungId(null);
                      }}
                      className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                        aktiv
                          ? 'bg-[#232933] text-white'
                          : verfuegbar
                            ? 'text-[#8B949E] hover:text-white'
                            : 'cursor-not-allowed text-[#484F58] line-through'
                      }`}
                    >
                      {winkel === 'SIDELINE' ? 'Sideline' : winkel === 'ENDZONE' ? 'Endzone' : winkel}
                    </button>
                  );
                })}
              </div>

              {zeigeOffset && (
                <span className="font-mono text-[11px] text-[#8B949E] tabular-nums">
                  Offset {optionalerOffsetMs! > 0 ? '+' : ''}
                  {(optionalerOffsetMs! / 1000).toFixed(2)}s
                </span>
              )}

              {/* Overlay-Toggles */}
              {istCoach && (
                <button
                  type="button"
                  onClick={() => setZeichenOverlaySichtbar((v) => !v)}
                  title="Zeichenwerkzeuge über dem Video ein-/ausblenden"
                  className={`rounded border p-1.5 transition-colors ${
                    zeichenOverlaySichtbar
                      ? 'border-[#F59E0B]/60 bg-[#F59E0B]/10 text-[#F59E0B]'
                      : 'border-[#232933] bg-[#13171D] text-[#8B949E] hover:text-white'
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setKommentarOverlaySichtbar((v) => !v)}
                title="Kommentar-Overlay über dem Video ein-/ausblenden"
                className={`rounded border p-1.5 transition-colors ${
                  kommentarOverlaySichtbar
                    ? 'border-[#F59E0B]/60 bg-[#F59E0B]/10 text-[#F59E0B]'
                    : 'border-[#232933] bg-[#13171D] text-[#8B949E] hover:text-white'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              {/* Vollbildmodus */}
              <button
                type="button"
                onClick={() => void toggleVollbild()}
                title={vollbildAktiv ? 'Vollbild beenden (Esc)' : 'Vollbildmodus aktivieren'}
                aria-label={vollbildAktiv ? 'Vollbild beenden' : 'Vollbildmodus aktivieren'}
                className="rounded border border-[#232933] bg-[#13171D] p-1.5 text-[#E6EDF3] hover:border-[#F59E0B] hover:text-white"
              >
                {vollbildAktiv ? (
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Rechte Spalte: Dynamische Quick-Tags + Notizen-Liste */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border border-[#232933] bg-[#13171D] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-white">
                Play #{aktiverPlay?.play_number ?? '–'} · Tagging
              </h2>
              {istTeamAdmin && (
                <button
                  type="button"
                  onClick={onSchemaSettingsOeffnen}
                  className="inline-flex items-center gap-1 text-[11px] text-[#8B949E] hover:text-[#F59E0B]"
                >
                  <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                  Felder verwalten
                </button>
              )}
            </div>

            {/* Kompakte Gruppen-Filter für schnelles Tagging */}
            <div className="mt-2.5 flex items-center gap-1 rounded border border-[#232933] bg-[#0B0E11] p-0.5 text-[11px]">
              {(
                [
                  { id: 'ALLE', label: 'Alle' },
                  { id: 'SITUATION', label: 'Situation' },
                  { id: 'OFFENSE', label: 'Offense' },
                  { id: 'DEFENSE', label: 'Defense' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTagGruppeTab(tab.id)}
                  className={`flex-1 rounded py-1 font-medium transition-colors ${
                    tagGruppeTab === tab.id
                      ? 'bg-[#232933] text-white'
                      : 'text-[#8B949E] hover:text-[#E6EDF3]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {istFlagPlay && (
              <p className="mt-2 text-[11px] text-[#F59E0B]">
                FLAG aktiv: Automatische YD LN ↔ GN/LS Berechnung ist für dieses Play pausiert.
              </p>
            )}

            {aktiverPlay && (
              <div className="mt-3 grid max-h-[270px] grid-cols-2 gap-2 overflow-y-auto pr-1">
                {aktiveTagFelder.map((feld) => {
                  const wert = leseBreakdownWert(aktiverPlay.breakdown, feld);
                  return (
                    <label key={feld.key} className="space-y-1 text-[11px] text-[#8B949E]">
                      <span className="block truncate" title={feld.label}>
                        {feld.kurz}
                      </span>

                      {feld.typ === 'select' ? (
                        <select
                          disabled={!istCoach}
                          value={wert ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const konvertiert =
                              feld.key === 'down' ? (raw ? Number(raw) : undefined) : raw || undefined;
                            onFeldAendern(
                              reel.id,
                              aktiverPlay.play_number,
                              feld.key,
                              konvertiert,
                              Boolean(feld.istCustom)
                            );
                          }}
                          className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                        >
                          <option value="">–</option>
                          {(feld.definitionen ?? []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : feld.typ === 'number' ? (
                        <input
                          type="number"
                          disabled={!istCoach}
                          min={feld.key === 'yard_line' ? -50 : undefined}
                          max={feld.key === 'yard_line' ? 50 : undefined}
                          value={wert ?? ''}
                          onChange={(e) =>
                            onFeldAendern(
                              reel.id,
                              aktiverPlay.play_number,
                              feld.key,
                              e.target.value === '' ? undefined : Number(e.target.value),
                              Boolean(feld.istCustom)
                            )
                          }
                          placeholder={feld.key === 'yard_line' ? '-25 / +20' : '0'}
                          className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 font-mono text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                        />
                      ) : (
                        <input
                          type="text"
                          disabled={!istCoach}
                          list={feld.typ === 'combobox' ? `qt-dl-${feld.key}` : undefined}
                          value={wert ?? ''}
                          onChange={(e) =>
                            onFeldAendern(
                              reel.id,
                              aktiverPlay.play_number,
                              feld.key,
                              e.target.value || undefined,
                              Boolean(feld.istCustom)
                            )
                          }
                          onBlur={(e) => {
                            if (feld.typ === 'combobox' && e.target.value.trim()) {
                              onDefinitionLernen(feld.key, e.target.value);
                            }
                          }}
                          placeholder="Wählen oder neu..."
                          className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* Notizen & Kommentare */}
          <section className="flex flex-1 flex-col rounded-lg border border-[#232933] bg-[#13171D] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white">Notizen &amp; Kommentare</h2>
              <span className="font-mono text-[11px] text-[#8B949E] tabular-nums">
                {playNotizen.length} Einträge
              </span>
            </div>

            <div className="mt-2.5 max-h-36 flex-1 space-y-2 overflow-y-auto">
              {playNotizen.length === 0 ? (
                <p className="py-3 text-center text-xs text-[#6E7681]">
                  Noch keine Notizen für Play #{aktiverPlay?.play_number ?? '–'}.
                </p>
              ) : (
                playNotizen.map((notiz, idx) => (
                  <button
                    key={notiz.id ?? idx}
                    type="button"
                    onClick={() => {
                      setLaeuft(false);
                      setZeitMs(notiz.timestamp_ms);
                    }}
                    className="block w-full rounded border border-[#232933] bg-[#0B0E11] p-2.5 text-left transition-colors hover:border-[#36404F]"
                  >
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                      <span className="text-[#8B949E] tabular-nums">
                        {formatiereZeit(notiz.timestamp_ms)}
                      </span>
                      <span
                        className={notiz.status === 'DRAFT' ? 'text-[#F59E0B]' : 'text-[#4ADE80]'}
                      >
                        {notiz.status === 'DRAFT'
                          ? 'DRAFT (Nur Coach)'
                          : notiz.autorRolle === 'PLAYER'
                            ? 'Eigene Notiz'
                            : 'PUBLISHED'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-[#E6EDF3]">{notiz.text}</p>
                  </button>
                ))
              )}
            </div>

            {aktiverPlay && (
              <div className="mt-3 flex gap-1.5 border-t border-[#232933] pt-3">
                <input
                  type="text"
                  value={notizText}
                  onChange={(e) => setNotizText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNotizSpeichern();
                  }}
                  placeholder={
                    istCoach
                      ? `Kommentar bei ${formatiereZeit(zeitMs)} (Draft)...`
                      : `Eigene Notiz bei ${formatiereZeit(zeitMs)}...`
                  }
                  className="min-w-0 flex-1 rounded border border-[#232933] bg-[#0B0E11] px-2.5 py-1.5 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleNotizSpeichern}
                  className="rounded border border-[#232933] bg-[#1E2530] px-3 py-1.5 text-xs font-medium text-white hover:border-[#F59E0B]"
                >
                  +
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Unterer Arbeitsbereich: Dynamisches Breakdown Data Grid */}
      <BreakdownGrid
        reelTitel={reel.title}
        plays={reel.plays}
        aktiverPlayIndex={sichererIndex}
        teamRolle={teamRolle}
        tagSchema={tagSchema}
        onPlayWaehlen={wechslePlay}
        onFeldAendern={(playNumber, feldKey, wert, istCustom) =>
          onFeldAendern(reel.id, playNumber, feldKey, wert, istCustom)
        }
        onDefinitionLernen={onDefinitionLernen}
      />
    </div>
  );
}
