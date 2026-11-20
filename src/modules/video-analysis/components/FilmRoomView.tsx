import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Eraser,
  Lock,
  Pause,
  Pencil,
  Play,
  Send,
  SkipBack,
  SkipForward,
  Trash2,
  Type,
  Undo2,
  Users,
} from 'lucide-react';
import type {
  BenutzerRolle,
  CanvasZeichnung,
  CoachNotiz,
  HashWert,
  OdkWert,
  PlayBreakdown,
  PlayTyp,
  SpielerFreigabe,
  VideoReel,
  ZeichenWerkzeug,
} from '../../../shared/types.ts';
import { FREIGABE_LABELS } from '../../../shared/types.ts';
import { THUMB_ENDZONE, THUMB_SIDELINE } from '../data/demoReels.ts';
import { BreakdownGrid } from './BreakdownGrid.tsx';
import { TelestrationCanvas } from './TelestrationCanvas.tsx';

interface FilmRoomViewProps {
  reel: VideoReel;
  rolle: BenutzerRolle;
  onZurueck: () => void;
  onFreigabeAendern: (reelId: string, freigabe: SpielerFreigabe) => void;
  onBreakdownAendern: (
    reelId: string,
    playNumber: number,
    patch: Partial<PlayBreakdown>
  ) => void;
  onNotizHinzufuegen: (reelId: string, playNumber: number, notiz: CoachNotiz) => void;
  onZeichnungHinzufuegen: (reelId: string, playNumber: number, zeichnung: CanvasZeichnung) => void;
  onLetzteZeichnungEntfernen: (reelId: string, playNumber: number) => void;
  onAlleZeichnungenLeeren: (reelId: string, playNumber: number) => void;
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
  rolle,
  onZurueck,
  onFreigabeAendern,
  onBreakdownAendern,
  onNotizHinzufuegen,
  onZeichnungHinzufuegen,
  onLetzteZeichnungEntfernen,
  onAlleZeichnungenLeeren,
  onSessionVeroeffentlichen,
}: FilmRoomViewProps) {
  const istCoach = rolle === 'COACH';
  const [aktiverPlayIndex, setAktiverPlayIndex] = useState(0);
  const [aktiverWinkel, setAktiverWinkel] = useState<string>(reel.angles[0] ?? 'SIDELINE');
  const [laeuft, setLaeuft] = useState(false);
  const [zeitMs, setZeitMs] = useState(2400);
  const [geschwindigkeit, setGeschwindigkeit] = useState<0.5 | 1 | 1.5>(1);
  const [autoStop, setAutoStop] = useState(true);
  const [autoStopMeldung, setAutoStopMeldung] = useState<string | null>(null);
  const [publishBestaetigung, setPublishBestaetigung] = useState<string | null>(null);

  const [werkzeug, setWerkzeug] = useState<ZeichenWerkzeug | null>('arrow');
  const [farbe, setFarbe] = useState<string>('#F59E0B');
  const [notizText, setNotizText] = useState('');

  const gestoppteTimestampsRef = useRef<Set<number>>(new Set());

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

  // Sichtbare Zeichnungen und Notizen nach Rolle filtern
  const playZeichnungen = useMemo(() => {
    const alle = aktiverPlay?.drawings ?? [];
    return istCoach ? alle : alle.filter((z) => z.status === 'PUBLISHED');
  }, [aktiverPlay, istCoach]);

  const sichtbareZeichnungenJetzt = useMemo(
    () => playZeichnungen.filter((z) => Math.abs(z.timestamp_ms - zeitMs) <= 1300),
    [playZeichnungen, zeitMs]
  );

  const playNotizen = useMemo(() => {
    const alle = aktiverPlay?.notes ?? [];
    return istCoach ? alle : alle.filter((n) => n.status === 'PUBLISHED' || n.autorRolle === 'PLAYER');
  }, [aktiverPlay, istCoach]);

  // Anzahl unveröffentlichter Entwürfe (Notizen + Zeichnungen) im gesamten Reel
  const gesamtEntwuerfe = useMemo(
    () =>
      reel.plays.reduce((summe, play) => {
        const draftNotes = (play.notes ?? []).filter((n) => n.status === 'DRAFT').length;
        const draftDrawings = (play.drawings ?? []).filter((d) => d.status === 'DRAFT').length;
        return summe + draftNotes + draftDrawings;
      }, 0),
    [reel.plays]
  );

  // Bei Play-Wechsel Zeit zurücksetzen & ersten verfügbaren Winkel wählen
  const wechslePlay = (neuerIndex: number) => {
    if (neuerIndex < 0 || neuerIndex >= reel.plays.length) return;
    setAktiverPlayIndex(neuerIndex);
    setLaeuft(false);
    setAutoStopMeldung(null);
    gestoppteTimestampsRef.current.clear();

    const zielPlay = reel.plays[neuerIndex];
    const ersteMarkierung =
      zielPlay.drawings?.[0]?.timestamp_ms ?? zielPlay.notes?.[0]?.timestamp_ms ?? 0;
    setZeitMs(ersteMarkierung);

    if (zielPlay && !zielPlay.sources[aktiverWinkel]) {
      const ersatz = reel.angles.find((w) => zielPlay.sources[w] !== null);
      if (ersatz) setAktiverWinkel(ersatz);
    }
  };

  // Playback-Loop mit Auto-Stop bei Zeichnungs-Timestamps
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
          const getroffeneZeichnung = playZeichnungen.find(
            (z) =>
              z.timestamp_ms >= alt &&
              z.timestamp_ms <= neu + 40 &&
              !gestoppteTimestampsRef.current.has(z.timestamp_ms)
          );
          if (getroffeneZeichnung) {
            gestoppteTimestampsRef.current.add(getroffeneZeichnung.timestamp_ms);
            setLaeuft(false);
            setAutoStopMeldung(
              `Auto-Stop bei ${formatiereZeit(getroffeneZeichnung.timestamp_ms)} · Zeichnung erreicht`
            );
            return getroffeneZeichnung.timestamp_ms;
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
  }, [laeuft, geschwindigkeit, dauerMs, autoStop, playZeichnungen]);

  // Tastaturkürzel im Film Room (Leertaste, ↑/↓, ←/→, A)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (
        ziel &&
        (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.tagName === 'SELECT')
      ) {
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

  // Sanfte Kamerabewegung beim Abspielen zur Simulation eines laufenden Spielzugs
  const simulierterScale = 1 + (fortschrittProzent / 100) * 0.04;
  const simulierterShiftX = ((fortschrittProzent / 100) - 0.5) * -1.8;

  const b = aktiverPlay?.breakdown ?? {};

  return (
    <div className="space-y-4">
      {/* Film Room Kopfzeile: Zurück, Titel, Spieler-Freigabe & Publish Session */}
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
                ? `Play #${aktiverPlay.play_number} von ${reel.plays.length} · ${aktuelleQuelle?.file ?? 'Keine Quelle im Winkel'}`
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

      {/* Oberer Arbeitsbereich: Links 68% Video + Canvas | Rechts 32% Quick Tags & Notizen */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Video-Player + Vektor-Canvas */}
        <section className="overflow-hidden rounded-lg border border-[#232933] bg-[#13171D]">
          <div className="relative aspect-video w-full overflow-hidden bg-black">
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

            {/* Vektor-Telestration direkt auf der 16:9-Videofläche */}
            {aktiverPlay && aktuelleQuelle && (
              <TelestrationCanvas
                zeichnungen={sichtbareZeichnungenJetzt}
                aktivesWerkzeug={istCoach ? werkzeug : null}
                aktiveFarbe={farbe}
                bearbeitbar={istCoach}
                onZeichnungHinzufuegen={(teil) => {
                  setLaeuft(false);
                  onZeichnungHinzufuegen(reel.id, aktiverPlay.play_number, {
                    ...teil,
                    id: `draw-${Date.now()}`,
                    timestamp_ms: Math.round(zeitMs),
                    status: 'DRAFT',
                  });
                }}
              />
            )}

            {/* Auto-Stop Hinweis-Banner */}
            {autoStopMeldung && (
              <div className="absolute bottom-3 left-3 rounded border border-[#F59E0B]/50 bg-[#0B0E11]/90 px-3 py-1.5 font-mono text-[11px] text-[#FBBF24]">
                {autoStopMeldung}
              </div>
            )}
          </div>

          {/* Timeline Scrub-Bar mit Markierungen für Zeichnungen & Notizen */}
          <div className="border-t border-[#232933] bg-[#0F1318] px-4 pt-3 pb-1">
            <div className="relative flex h-5 items-center">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#232933]">
                <div
                  className="h-full bg-[#F59E0B]"
                  style={{ width: `${fortschrittProzent}%` }}
                />
              </div>

              {/* Marker-Ticks für Zeichnungen */}
              {playZeichnungen.map((z) => {
                const pos = Math.min(100, Math.max(0, (z.timestamp_ms / dauerMs) * 100));
                return (
                  <button
                    key={z.id}
                    type="button"
                    title={`Zeichnung bei ${formatiereZeit(z.timestamp_ms)}`}
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

          {/* Transport-Leiste & Angle-Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0F1318] px-4 py-2.5">
            <div className="flex items-center gap-1.5">
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

            <div className="flex flex-wrap items-center gap-3">
              {/* Geschwindigkeit */}
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
                      onClick={() => setAktiverWinkel(winkel)}
                      title={verfuegbar ? winkel : `${winkel} für dieses Play nicht vorhanden`}
                      className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
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

              {/* Optionaler Offset nur anzeigen, wenn explizit gesetzt & ungleich 0 */}
              {zeigeOffset && (
                <span className="font-mono text-[11px] text-[#8B949E] tabular-nums">
                  Offset {optionalerOffsetMs! > 0 ? '+' : ''}
                  {(optionalerOffsetMs! / 1000).toFixed(2)}s
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Rechte Spalte: Quick Tags + Canvas-Werkzeuge + Coach-Notizen */}
        <aside className="flex flex-col gap-4">
          {/* Quick Tags */}
          <section className="rounded-lg border border-[#232933] bg-[#13171D] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white">
                Play #{aktiverPlay?.play_number ?? '–'} · Quick Tags
              </h2>
              {!istCoach && <span className="text-[11px] text-[#8B949E]">Leseansicht</span>}
            </div>

            {aktiverPlay && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                <label className="space-y-1 text-[11px] text-[#8B949E]">
                  <span>ODK</span>
                  <select
                    disabled={!istCoach}
                    value={b.odk ?? ''}
                    onChange={(e) =>
                      onBreakdownAendern(reel.id, aktiverPlay.play_number, {
                        odk: (e.target.value || undefined) as OdkWert | undefined,
                      })
                    }
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                  >
                    <option value="">–</option>
                    <option value="O">O</option>
                    <option value="D">D</option>
                    <option value="K">K</option>
                  </select>
                </label>

                <label className="space-y-1 text-[11px] text-[#8B949E]">
                  <span>DN</span>
                  <select
                    disabled={!istCoach}
                    value={b.down ?? ''}
                    onChange={(e) =>
                      onBreakdownAendern(reel.id, aktiverPlay.play_number, {
                        down: e.target.value
                          ? (Number(e.target.value) as 1 | 2 | 3 | 4)
                          : undefined,
                      })
                    }
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                  >
                    <option value="">–</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </label>

                <label className="space-y-1 text-[11px] text-[#8B949E]">
                  <span>DIST</span>
                  <input
                    type="number"
                    disabled={!istCoach}
                    value={b.distance ?? ''}
                    onChange={(e) =>
                      onBreakdownAendern(reel.id, aktiverPlay.play_number, {
                        distance: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                  />
                </label>

                <label className="space-y-1 text-[11px] text-[#8B949E]">
                  <span>HASH</span>
                  <select
                    disabled={!istCoach}
                    value={b.hash ?? ''}
                    onChange={(e) =>
                      onBreakdownAendern(reel.id, aktiverPlay.play_number, {
                        hash: (e.target.value || undefined) as HashWert | undefined,
                      })
                    }
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                  >
                    <option value="">–</option>
                    <option value="L">L</option>
                    <option value="M">M</option>
                    <option value="R">R</option>
                  </select>
                </label>

                <label className="col-span-2 space-y-1 text-[11px] text-[#8B949E]">
                  <span>PLAY TYPE</span>
                  <select
                    disabled={!istCoach}
                    value={b.play_type ?? ''}
                    onChange={(e) =>
                      onBreakdownAendern(reel.id, aktiverPlay.play_number, {
                        play_type: (e.target.value || undefined) as PlayTyp | undefined,
                      })
                    }
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 text-xs text-white focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                  >
                    <option value="">–</option>
                    <option value="RUN">Run</option>
                    <option value="PASS">Pass</option>
                    <option value="SPECIAL">Special</option>
                    <option value="PENALTY">Penalty</option>
                  </select>
                </label>

                <label className="col-span-2 space-y-1 text-[11px] text-[#8B949E]">
                  <span>OFF FORM</span>
                  <input
                    type="text"
                    disabled={!istCoach}
                    value={b.off_form ?? ''}
                    onChange={(e) =>
                      onBreakdownAendern(reel.id, aktiverPlay.play_number, {
                        off_form: e.target.value,
                      })
                    }
                    placeholder="z. B. Trips Left"
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                  />
                </label>

                <label className="col-span-2 space-y-1 text-[11px] text-[#8B949E]">
                  <span>DEF FRONT</span>
                  <input
                    type="text"
                    disabled={!istCoach}
                    value={b.def_front ?? ''}
                    onChange={(e) =>
                      onBreakdownAendern(reel.id, aktiverPlay.play_number, {
                        def_front: e.target.value,
                      })
                    }
                    placeholder="z. B. 4-3"
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                  />
                </label>

                <label className="col-span-2 space-y-1 text-[11px] text-[#8B949E]">
                  <span>COVERAGE</span>
                  <input
                    type="text"
                    disabled={!istCoach}
                    value={b.coverage ?? ''}
                    onChange={(e) =>
                      onBreakdownAendern(reel.id, aktiverPlay.play_number, {
                        coverage: e.target.value,
                      })
                    }
                    placeholder="z. B. Cover 3"
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none disabled:opacity-60"
                  />
                </label>
              </div>
            )}
          </section>

          {/* Canvas & Coach-Notizen */}
          <section className="flex flex-1 flex-col rounded-lg border border-[#232933] bg-[#13171D] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white">Canvas &amp; Notizen</h2>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[#8B949E]">
                <span>Auto-Stop</span>
                <input
                  type="checkbox"
                  checked={autoStop}
                  onChange={(e) => setAutoStop(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#F59E0B]"
                />
              </label>
            </div>

            {istCoach && aktiverPlay && (
              <div className="mt-3 space-y-2.5 border-b border-[#232933] pb-3">
                {/* Zeichenwerkzeuge */}
                <div className="grid grid-cols-5 gap-1">
                  {(
                    [
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
                        className={`flex flex-col items-center gap-1 rounded border py-1.5 text-[10px] font-medium transition-colors ${
                          aktiv
                            ? 'border-[#F59E0B] bg-[#F59E0B]/15 text-white'
                            : 'border-[#232933] bg-[#0B0E11] text-[#8B949E] hover:text-white'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setWerkzeug(null)}
                    className={`flex flex-col items-center gap-1 rounded border py-1.5 text-[10px] font-medium transition-colors ${
                      werkzeug === null
                        ? 'border-[#36404F] bg-[#1E2530] text-white'
                        : 'border-[#232933] bg-[#0B0E11] text-[#8B949E] hover:text-white'
                    }`}
                  >
                    <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Aus</span>
                  </button>
                </div>

                {/* Team-Farben & Undo/Clear */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {TEAM_FARBEN.map((swatch) => (
                      <button
                        key={swatch.id}
                        type="button"
                        title={swatch.label}
                        aria-label={swatch.label}
                        onClick={() => setFarbe(swatch.hex)}
                        style={{ backgroundColor: swatch.hex }}
                        className={`h-5 w-5 rounded border transition-transform ${
                          farbe === swatch.hex
                            ? 'scale-110 border-white ring-1 ring-white'
                            : 'border-[#232933]'
                        }`}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={playZeichnungen.length === 0}
                      onClick={() =>
                        onLetzteZeichnungEntfernen(reel.id, aktiverPlay.play_number)
                      }
                      title="Letzte Zeichnung rückgängig"
                      className="rounded border border-[#232933] bg-[#0B0E11] p-1 text-[#8B949E] hover:text-white disabled:opacity-35"
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={playZeichnungen.length === 0}
                      onClick={() => onAlleZeichnungenLeeren(reel.id, aktiverPlay.play_number)}
                      title="Alle Zeichnungen dieses Plays löschen"
                      className="rounded border border-[#232933] bg-[#0B0E11] p-1 text-[#8B949E] hover:text-[#FCA5A5] disabled:opacity-35"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Notizen-Liste */}
            <div className="mt-3 flex-1 space-y-2 overflow-y-auto max-h-40">
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
                        className={
                          notiz.status === 'DRAFT' ? 'text-[#F59E0B]' : 'text-[#4ADE80]'
                        }
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

            {/* Neue Notiz erfassen */}
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
                      ? `Coach-Notiz bei ${formatiereZeit(zeitMs)} (Draft)...`
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

      {/* Unterer Arbeitsbereich: Hudl-kompatible Breakdown-Tabelle */}
      <BreakdownGrid
        reelTitel={reel.title}
        plays={reel.plays}
        aktiverPlayIndex={sichererIndex}
        rolle={rolle}
        onPlayWaehlen={wechslePlay}
        onBreakdownAendern={(playNumber, patch) =>
          onBreakdownAendern(reel.id, playNumber, patch)
        }
      />
    </div>
  );
}
