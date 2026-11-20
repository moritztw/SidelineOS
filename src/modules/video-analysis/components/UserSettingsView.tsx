import { useEffect, useState } from 'react';
import { Keyboard, RotateCcw, Sliders } from 'lucide-react';
import type {
  HotkeyAktion,
  KommentarEcke,
  NutzerEinstellungen,
  TeamRolle,
} from '../../../shared/types.ts';
import { TEAM_ROLLEN_LABELS } from '../../../shared/types.ts';
import {
  HOTKEY_BESCHREIBUNGEN,
  STANDARD_HOTKEYS,
  STANDARD_NUTZER_EINSTELLUNGEN,
  aktualisiereBenutzerHotkey,
} from '../../../core/rolePermissions.ts';

interface UserSettingsViewProps {
  aktiveTeamAnsicht: TeamRolle;
  einstellungen: NutzerEinstellungen;
  onEinstellungenAendern: (neu: NutzerEinstellungen) => void;
}

const ECKEN_OPTIONEN: Array<{ id: KommentarEcke; label: string }> = [
  { id: 'top-left', label: 'Oben links' },
  { id: 'top-right', label: 'Oben rechts' },
  { id: 'bottom-left', label: 'Unten links' },
  { id: 'bottom-right', label: 'Unten rechts' },
];

const GESCHWINDIGKEITEN: Array<0.5 | 1 | 1.5> = [0.5, 1, 1.5];

export function UserSettingsView({
  aktiveTeamAnsicht,
  einstellungen,
  onEinstellungenAendern,
}: UserSettingsViewProps) {
  const [aufnahmeAktion, setAufnahmeAktion] = useState<HotkeyAktion | null>(null);
  const [hotkeyFehler, setHotkeyFehler] = useState<string | null>(null);
  const [statusHinweis, setStatusHinweis] = useState<string | null>(null);

  const istCoach = aktiveTeamAnsicht === 'COACH' || aktiveTeamAnsicht === 'TEAM_ADMIN';

  // Tastendruck abfangen, solange ein Hotkey neu belegt wird
  useEffect(() => {
    if (!aufnahmeAktion) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setAufnahmeAktion(null);
        setHotkeyFehler(null);
        return;
      }

      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      const ergebnis = aktualisiereBenutzerHotkey(einstellungen.hotkeys, aufnahmeAktion, e.key);
      if (!ergebnis.ok) {
        setHotkeyFehler(ergebnis.fehler ?? 'Ungültige Taste.');
        return;
      }

      onEinstellungenAendern({
        ...einstellungen,
        hotkeys: ergebnis.hotkeys,
      });
      setAufnahmeAktion(null);
      setHotkeyFehler(null);
      setStatusHinweis('Hotkey gespeichert.');
      setTimeout(() => setStatusHinweis(null), 2000);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [aufnahmeAktion, einstellungen, onEinstellungenAendern]);

  const sichtbareHotkeys = istCoach
    ? HOTKEY_BESCHREIBUNGEN
    : HOTKEY_BESCHREIBUNGEN.filter(
        (h) => h.aktion === 'toggleFullscreen' || h.aktion === 'switchAngle'
      );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[#232933] bg-[#13171D] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-2 text-[#F59E0B]">
              <Sliders className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">Persönliche Einstellungen</h1>
              <p className="mt-1 max-w-2xl text-xs text-[#8B949E]">
                Diese Optionen gelten ausschließlich für dein eigenes Benutzerkonto (aktive Ansicht:{' '}
                <span className="text-[#E6EDF3]">{TEAM_ROLLEN_LABELS[aktiveTeamAnsicht]}</span>).
                Teamweite Tagging-Felder und Wörterbücher werden separat unter{' '}
                <span className="text-[#E6EDF3]">Team-Einstellungen</span> gepflegt.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setAufnahmeAktion(null);
              setHotkeyFehler(null);
              onEinstellungenAendern({
                ...STANDARD_NUTZER_EINSTELLUNGEN,
                hotkeys: { ...STANDARD_HOTKEYS },
              });
              setStatusHinweis('Alle persönlichen Einstellungen auf Standard zurückgesetzt.');
              setTimeout(() => setStatusHinweis(null), 2200);
            }}
            className="inline-flex items-center gap-1.5 rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-[#8B949E] transition-colors hover:border-[#36404F] hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Standard wiederherstellen
          </button>
        </div>
      </section>

      {statusHinweis && (
        <div
          role="status"
          className="rounded-md border border-[#16A34A]/40 bg-[#16A34A]/10 px-4 py-2 text-xs text-[#86EFAC]"
        >
          {statusHinweis}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Linke Spalte: Hotkey-Konfigurator */}
        <section className="rounded-lg border border-[#232933] bg-[#13171D] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-white">
                Tastaturkürzel (Hotkeys) im Film Room
              </h2>
            </div>
            <span className="text-[11px] text-[#8B949E]">
              Klicke auf eine Taste und drücke das gewünschte Zeichen (Esc bricht ab)
            </span>
          </div>

          {hotkeyFehler && (
            <div
              role="alert"
              className="mt-3 rounded border border-[#DC2626]/50 bg-[#DC2626]/10 px-3 py-2 text-xs text-[#FCA5A5]"
            >
              {hotkeyFehler}
            </div>
          )}

          <div className="mt-4 divide-y divide-[#232933] rounded-md border border-[#232933] bg-[#0B0E11]">
            {sichtbareHotkeys.map((eintrag) => {
              const aktiv = aufnahmeAktion === eintrag.aktion;
              const belegteTaste = einstellungen.hotkeys[eintrag.aktion];

              return (
                <div
                  key={eintrag.aktion}
                  className="flex items-center justify-between gap-4 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#E6EDF3]">{eintrag.label}</div>
                    <div className="text-[11px] text-[#8B949E]">{eintrag.beschreibung}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setHotkeyFehler(null);
                      setAufnahmeAktion(aktiv ? null : eintrag.aktion);
                    }}
                    aria-label={`Hotkey für ${eintrag.label} ändern (aktuell ${belegteTaste.toUpperCase()})`}
                    className={`min-w-[92px] rounded border px-3 py-1.5 font-mono text-xs font-semibold transition-colors whitespace-nowrap ${
                      aktiv
                        ? 'border-[#F59E0B] bg-[#F59E0B]/15 text-[#F59E0B]'
                        : 'border-[#232933] bg-[#13171D] text-white hover:border-[#F59E0B]'
                    }`}
                  >
                    {aktiv ? 'Taste drücken…' : belegteTaste.toUpperCase()}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[11px] text-[#6E7681]">
            Feste Transport-Tasten im Player: <span className="font-mono text-[#8B949E]">Space</span>{' '}
            Play/Pause · <span className="font-mono text-[#8B949E]">← / →</span> exakt 1 Frame ·{' '}
            <span className="font-mono text-[#8B949E]">↑ / ↓</span> Play wechseln ·{' '}
            <span className="font-mono text-[#8B949E]">Entf</span> markiertes Objekt löschen.
          </p>
        </section>

        {/* Rechte Spalte: Persönliche Player-Voreinstellungen */}
        <aside className="rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Player-Voreinstellungen</h2>
            <p className="mt-1 text-xs text-[#8B949E]">
              Startwerte beim Öffnen eines Reels im Film Room.
            </p>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-[#E6EDF3]">
              Standard-Ecke für Kommentar-Overlay
            </span>
            <div className="grid grid-cols-2 gap-2">
              {ECKEN_OPTIONEN.map((opt) => {
                const aktiv = einstellungen.standardKommentarEcke === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onEinstellungenAendern({
                        ...einstellungen,
                        standardKommentarEcke: opt.id,
                      })
                    }
                    className={`rounded border px-3 py-2 text-xs font-medium transition-colors ${
                      aktiv
                        ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]'
                        : 'border-[#232933] bg-[#0B0E11] text-[#8B949E] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-t border-[#232933] pt-4">
            <span className="block text-xs font-medium text-[#E6EDF3]">
              Standard-Abspielgeschwindigkeit
            </span>
            <div className="flex items-center gap-2">
              {GESCHWINDIGKEITEN.map((tempo) => {
                const aktiv = einstellungen.standardGeschwindigkeit === tempo;
                return (
                  <button
                    key={tempo}
                    type="button"
                    onClick={() =>
                      onEinstellungenAendern({
                        ...einstellungen,
                        standardGeschwindigkeit: tempo,
                      })
                    }
                    className={`flex-1 rounded border py-1.5 font-mono text-xs font-medium transition-colors ${
                      aktiv
                        ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]'
                        : 'border-[#232933] bg-[#0B0E11] text-[#8B949E] hover:text-white'
                    }`}
                  >
                    {tempo.toFixed(1)}x
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#232933] pt-4">
            <label className="flex cursor-pointer items-start gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={einstellungen.standardAutoStop}
                onChange={(e) =>
                  onEinstellungenAendern({
                    ...einstellungen,
                    standardAutoStop: e.target.checked,
                  })
                }
                className="mt-0.5 h-3.5 w-3.5 accent-[#F59E0B]"
              />
              <div>
                <div className="font-medium text-[#E6EDF3]">
                  Auto-Stop auf gezeichneten Frames aktivieren
                </div>
                <p className="mt-0.5 text-[11px] text-[#8B949E]">
                  Pausiert die Wiedergabe automatisch exakt auf dem Frame einer Zeichnung.
                </p>
              </div>
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}
