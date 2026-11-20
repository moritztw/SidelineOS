import { useEffect, useState } from 'react';
import { Keyboard, Lock, RotateCcw, Save, User } from 'lucide-react';
import type {
  BenutzerKonto,
  HotkeyAktion,
  KommentarEcke,
  NutzerEinstellungen,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from '../../shared/types.ts';
import { SPIELER_UNIT_LABELS, TEAM_ROLLEN_LABELS } from '../../shared/types.ts';
import {
  HOTKEY_BESCHREIBUNGEN,
  STANDARD_HOTKEYS,
  STANDARD_NUTZER_EINSTELLUNGEN,
  aktualisiereBenutzerHotkey,
} from '../rolePermissions.ts';
import { SettingsShell, type SettingsKategorie } from '../layout/SettingsShell.tsx';

interface UserSettingsPageProps {
  benutzer: BenutzerKonto;
  team: TeamKontext;
  mitgliedschaft: TeamMitgliedschaft | null;
  aktiveTeamAnsicht: TeamRolle;
  videoModulAktiv: boolean;
  einstellungen: NutzerEinstellungen;
  onBenutzerAktualisieren: (aktualisiert: BenutzerKonto) => void;
  onEinstellungenAendern: (neu: NutzerEinstellungen) => void;
}

const ECKEN_OPTIONEN: Array<{ id: KommentarEcke; label: string }> = [
  { id: 'top-left', label: 'Oben links' },
  { id: 'top-right', label: 'Oben rechts' },
  { id: 'bottom-left', label: 'Unten links' },
  { id: 'bottom-right', label: 'Unten rechts' },
];

const GESCHWINDIGKEITEN: Array<0.5 | 1 | 1.5> = [0.5, 1, 1.5];

export function UserSettingsPage({
  benutzer,
  team,
  mitgliedschaft,
  aktiveTeamAnsicht,
  videoModulAktiv,
  einstellungen,
  onBenutzerAktualisieren,
  onEinstellungenAendern,
}: UserSettingsPageProps) {
  const istCoach = aktiveTeamAnsicht === 'COACH' || aktiveTeamAnsicht === 'TEAM_ADMIN';

  // Profil-Formular
  const [vollerName, setVollerName] = useState(benutzer.vollerName);
  const [trikotNummer, setTrikotNummer] = useState(benutzer.trikotNummer ?? '');
  const [position, setPosition] = useState(benutzer.position ?? '');
  const [telefon, setTelefon] = useState(benutzer.telefon ?? '');
  const [customWerte, setCustomWerte] = useState<Record<string, string>>(
    benutzer.customProfilWerte
  );
  const [profilHinweis, setProfilHinweis] = useState<string | null>(null);

  // Konto & Passwort
  const [benutzername, setBenutzername] = useState(benutzer.benutzername);
  const [email, setEmail] = useState(benutzer.email);
  const [passwortAktuell, setPasswortAktuell] = useState('');
  const [passwortNeu, setPasswortNeu] = useState('');
  const [passwortWiederholung, setPasswortWiederholung] = useState('');
  const [kontoHinweis, setKontoHinweis] = useState<string | null>(null);
  const [kontoFehler, setKontoFehler] = useState<string | null>(null);

  // Hotkeys
  const [aufnahmeAktion, setAufnahmeAktion] = useState<HotkeyAktion | null>(null);
  const [hotkeyFehler, setHotkeyFehler] = useState<string | null>(null);
  const [hotkeyHinweis, setHotkeyHinweis] = useState<string | null>(null);

  // Bei Wechsel des angemeldeten Demo-Kontos Felder synchronisieren
  useEffect(() => {
    setVollerName(benutzer.vollerName);
    setTrikotNummer(benutzer.trikotNummer ?? '');
    setPosition(benutzer.position ?? '');
    setTelefon(benutzer.telefon ?? '');
    setCustomWerte(benutzer.customProfilWerte);
    setBenutzername(benutzer.benutzername);
    setEmail(benutzer.email);
    setProfilHinweis(null);
    setKontoHinweis(null);
    setKontoFehler(null);
  }, [benutzer]);

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
      setHotkeyHinweis('Hotkey gespeichert.');
      setTimeout(() => setHotkeyHinweis(null), 2000);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [aufnahmeAktion, einstellungen, onEinstellungenAendern]);

  const handleProfilSpeichern = () => {
    const nameBereinigt = vollerName.trim();
    if (!nameBereinigt) return;
    onBenutzerAktualisieren({
      ...benutzer,
      vollerName: nameBereinigt,
      trikotNummer: trikotNummer.trim(),
      position: position.trim(),
      telefon: telefon.trim(),
      customProfilWerte: { ...customWerte },
    });
    setProfilHinweis('Profil- und Spielerdaten gespeichert.');
    setTimeout(() => setProfilHinweis(null), 2400);
  };

  const handleKontoSpeichern = () => {
    setKontoFehler(null);
    setKontoHinweis(null);

    const userBereinigt = benutzername.trim();
    const mailBereinigt = email.trim();
    if (!userBereinigt || !mailBereinigt.includes('@')) {
      setKontoFehler('Bitte einen gültigen Nutzernamen und eine gültige E-Mail-Adresse angeben.');
      return;
    }

    if (passwortNeu || passwortWiederholung) {
      if (!passwortAktuell) {
        setKontoFehler('Bitte das aktuelle Passwort zur Bestätigung eingeben.');
        return;
      }
      if (passwortNeu.length < 10) {
        setKontoFehler('Das neue Passwort muss mindestens 10 Zeichen lang sein.');
        return;
      }
      if (passwortNeu !== passwortWiederholung) {
        setKontoFehler('Die neuen Passwörter stimmen nicht überein.');
        return;
      }
    }

    onBenutzerAktualisieren({
      ...benutzer,
      benutzername: userBereinigt,
      email: mailBereinigt,
    });
    setPasswortAktuell('');
    setPasswortNeu('');
    setPasswortWiederholung('');
    setKontoHinweis(
      passwortNeu
        ? 'Kontodaten und Passwort erfolgreich aktualisiert.'
        : 'Nutzername und E-Mail-Adresse gespeichert.'
    );
    setTimeout(() => setKontoHinweis(null), 2600);
  };

  const kategorien: SettingsKategorie[] = [
    { id: 'profil', label: 'Spieler- & Nutzerprofil', gruppe: 'SidelineOS Konto' },
    { id: 'konto', label: 'Zugang, E-Mail & Passwort', gruppe: 'SidelineOS Konto' },
  ];

  if (videoModulAktiv) {
    kategorien.push(
      { id: 'modul-video-hotkeys', label: 'Film-Room-Hotkeys', gruppe: 'Modul: Videoanalyse' },
      { id: 'modul-video-player', label: 'Player-Voreinstellungen', gruppe: 'Modul: Videoanalyse' }
    );
  }

  const sichtbareHotkeys = istCoach
    ? HOTKEY_BESCHREIBUNGEN
    : HOTKEY_BESCHREIBUNGEN.filter(
        (h) => h.aktion === 'toggleFullscreen' || h.aktion === 'switchAngle'
      );

  return (
    <SettingsShell
      titel="Persönliche Einstellungen"
      untertitel={`Einstellungen für dein Benutzerkonto (${TEAM_ROLLEN_LABELS[aktiveTeamAnsicht]} · ${team.name}). Aktive Module blenden ihre persönlichen Optionen automatisch unten mit ein.`}
      kategorien={kategorien}
    >
      {/* Sektion 1: Spieler- & Nutzerprofil */}
      <section
        id="profil"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232933] pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Spieler- &amp; Nutzerprofil</h2>
          </div>
          {mitgliedschaft && (
            <span className="font-mono text-[11px] text-[#8B949E]">
              Units:{' '}
              <span className="text-[#E6EDF3]">
                {mitgliedschaft.units.length > 0
                  ? mitgliedschaft.units.map((u) => SPIELER_UNIT_LABELS[u]).join(' · ')
                  : 'Keine Unit zugewiesen'}
              </span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Voller Name</span>
            <input
              type="text"
              value={vollerName}
              onChange={(e) => setVollerName(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Telefon / Kontaktdaten</span>
            <input
              type="tel"
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              placeholder="+49 170 ..."
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Trikotnummer (#)</span>
            <input
              type="text"
              value={trikotNummer}
              onChange={(e) => setTrikotNummer(e.target.value)}
              placeholder="z. B. 14"
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 font-mono text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Position(en)</span>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="z. B. WR / CB oder LB"
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
        </div>

        {/* Vom Team Admin konfigurierte Custom-Profilfelder */}
        {team.customProfilFelder.length > 0 && (
          <div className="space-y-3 border-t border-[#232933] pt-4">
            <div className="text-xs font-medium text-[#E6EDF3]">
              Zusatzfelder von {team.name} (durch Team Admin definiert)
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {team.customProfilFelder.map((feld) => (
                <label key={feld.key} className="space-y-1 text-xs text-[#8B949E]">
                  <span>
                    {feld.label}
                    {feld.pflicht && <span className="ml-1 text-[#F59E0B]">*</span>}
                  </span>
                  {feld.typ === 'select' ? (
                    <select
                      value={customWerte[feld.key] ?? ''}
                      onChange={(e) =>
                        setCustomWerte((alt) => ({ ...alt, [feld.key]: e.target.value }))
                      }
                      className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                    >
                      <option value="">Bitte wählen…</option>
                      {(feld.optionen ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={feld.typ === 'number' ? 'number' : 'text'}
                      value={customWerte[feld.key] ?? ''}
                      onChange={(e) =>
                        setCustomWerte((alt) => ({ ...alt, [feld.key]: e.target.value }))
                      }
                      className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-xs text-[#86EFAC]">{profilHinweis ?? ''}</span>
          <button
            type="button"
            onClick={handleProfilSpeichern}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#F59E0B] px-3.5 py-2 text-xs font-semibold text-[#0B0E11] transition-colors hover:bg-[#FBBF24]"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            Profil speichern
          </button>
        </div>
      </section>

      {/* Sektion 2: Zugang, E-Mail, Passwort & Konto-Portabilität */}
      <section
        id="konto"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232933] pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Zugang, E-Mail &amp; Passwort</h2>
          </div>
          <span className="font-mono text-[11px] text-[#6E7681]">ID: {benutzer.uuid}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Benutzername</span>
            <input
              type="text"
              value={benutzername}
              onChange={(e) => setBenutzername(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>E-Mail-Adresse</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-[#232933] pt-4 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Aktuelles Passwort</span>
            <input
              type="password"
              value={passwortAktuell}
              onChange={(e) => setPasswortAktuell(e.target.value)}
              placeholder="Nur bei Passwortwechsel"
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Neues Passwort (mind. 10 Zeichen)</span>
            <input
              type="password"
              value={passwortNeu}
              onChange={(e) => setPasswortNeu(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Neues Passwort bestätigen</span>
            <input
              type="password"
              value={passwortWiederholung}
              onChange={(e) => setPasswortWiederholung(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
        </div>

        {kontoFehler && <p className="text-xs text-[#FCA5A5]">{kontoFehler}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs text-[#86EFAC]">{kontoHinweis ?? ''}</span>
          <button
            type="button"
            onClick={handleKontoSpeichern}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#232933] bg-[#1E2530] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:border-[#F59E0B]"
          >
            Zugangsdaten aktualisieren
          </button>
        </div>

        <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-3 text-xs text-[#8B949E]">
          <strong className="font-medium text-[#E6EDF3]">Konto-Portabilität (Roadmap):</strong>{' '}
          Dein Konto bleibt bei einem Team-Austritt erhalten. In einer späteren Version kannst du
          dein Profil inkl. eigener Notizen per Export-Token auf einen anderen SidelineOS-Server
          umziehen.
        </div>
      </section>

      {/* Modul-Beitrag: Videoanalyse (nur gerendert, wenn Modul fürs Team aktiv ist) */}
      {videoModulAktiv && (
        <>
          <section
            id="modul-video-hotkeys"
            className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232933] pb-3">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Film-Room-Hotkeys (Modul: Videoanalyse)
                  </h2>
                  <p className="text-[11px] text-[#8B949E]">
                    Klicke auf eine Taste und drücke das gewünschte Zeichen (Esc bricht ab).
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
                  setHotkeyHinweis('Standard-Hotkeys & Player-Defaults wiederhergestellt.');
                  setTimeout(() => setHotkeyHinweis(null), 2200);
                }}
                className="inline-flex items-center gap-1.5 rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-[#8B949E] hover:border-[#36404F] hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Standard
              </button>
            </div>

            {hotkeyFehler && (
              <div
                role="alert"
                className="rounded border border-[#DC2626]/50 bg-[#DC2626]/10 px-3 py-2 text-xs text-[#FCA5A5]"
              >
                {hotkeyFehler}
              </div>
            )}
            {hotkeyHinweis && (
              <div
                role="status"
                className="rounded border border-[#16A34A]/40 bg-[#16A34A]/10 px-3 py-2 text-xs text-[#86EFAC]"
              >
                {hotkeyHinweis}
              </div>
            )}

            <div className="divide-y divide-[#232933] rounded-md border border-[#232933] bg-[#0B0E11]">
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
          </section>

          <section
            id="modul-video-player"
            className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-5"
          >
            <div className="border-b border-[#232933] pb-3">
              <h2 className="text-sm font-semibold text-white">
                Player-Voreinstellungen (Modul: Videoanalyse)
              </h2>
              <p className="mt-0.5 text-[11px] text-[#8B949E]">
                Persönliche Startwerte beim Öffnen eines Reels im Film Room.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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

              <div className="space-y-4">
                <div className="space-y-2">
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
                      Pausiert die Wiedergabe exakt auf dem Frame einer Zeichnung.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </section>
        </>
      )}
    </SettingsShell>
  );
}
