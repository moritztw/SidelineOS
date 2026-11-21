import { useEffect, useState } from 'react';
import { Lock, Save, User } from 'lucide-react';
import type {
  BenutzerKonto,
  S3Konfiguration,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from '../../shared/types.ts';
import { SPIELER_UNIT_LABELS, TEAM_ROLLEN_LABELS } from '../../shared/types.ts';
import type { PluginSettingsKontext, SidelinePlugin } from '../../sdk/plugin.ts';
import { SettingsShell, type SettingsKategorie } from '../layout/SettingsShell.tsx';

export interface ApiAktionErgebnis {
  ok: boolean;
  fehler?: string;
}

interface UserSettingsPageProps {
  benutzer: BenutzerKonto;
  team: TeamKontext;
  mitgliedschaft: TeamMitgliedschaft | null;
  aktiveTeamAnsicht: TeamRolle;
  s3Konfig: S3Konfiguration;
  aktivePlugins: SidelinePlugin[];
  onProfilSpeichern: (daten: {
    vollerName: string;
    telefon: string;
    trikotNummer: string;
    position: string;
    customProfilWerte: Record<string, string>;
  }) => Promise<ApiAktionErgebnis>;
  onZugangSpeichern: (daten: {
    benutzername: string;
    email: string;
    altesPasswort?: string;
    neuesPasswort?: string;
  }) => Promise<ApiAktionErgebnis>;
  onZurueck?: () => void;
}

export function UserSettingsPage({
  benutzer,
  team,
  mitgliedschaft,
  aktiveTeamAnsicht,
  s3Konfig,
  aktivePlugins,
  onProfilSpeichern,
  onZugangSpeichern,
  onZurueck,
}: UserSettingsPageProps) {
  const [vollerName, setVollerName] = useState(benutzer.vollerName);
  const [trikotNummer, setTrikotNummer] = useState(benutzer.trikotNummer ?? '');
  const [position, setPosition] = useState(benutzer.position ?? '');
  const [telefon, setTelefon] = useState(benutzer.telefon ?? '');
  const [customWerte, setCustomWerte] = useState<Record<string, string>>(
    benutzer.customProfilWerte
  );
  const [profilHinweis, setProfilHinweis] = useState<string | null>(null);
  const [profilFehler, setProfilFehler] = useState<string | null>(null);
  const [speichertProfil, setSpeichertProfil] = useState(false);

  const [benutzername, setBenutzername] = useState(benutzer.benutzername);
  const [email, setEmail] = useState(benutzer.email);
  const [passwortAktuell, setPasswortAktuell] = useState('');
  const [passwortNeu, setPasswortNeu] = useState('');
  const [passwortWiederholung, setPasswortWiederholung] = useState('');
  const [kontoHinweis, setKontoHinweis] = useState<string | null>(null);
  const [kontoFehler, setKontoFehler] = useState<string | null>(null);
  const [speichertKonto, setSpeichertKonto] = useState(false);

  useEffect(() => {
    setVollerName(benutzer.vollerName);
    setTrikotNummer(benutzer.trikotNummer ?? '');
    setPosition(benutzer.position ?? '');
    setTelefon(benutzer.telefon ?? '');
    setCustomWerte(benutzer.customProfilWerte);
    setBenutzername(benutzer.benutzername);
    setEmail(benutzer.email);
    setProfilHinweis(null);
    setProfilFehler(null);
    setKontoHinweis(null);
    setKontoFehler(null);
  }, [benutzer]);

  const handleProfilSpeichern = async () => {
    setProfilFehler(null);
    setProfilHinweis(null);
    const nameBereinigt = vollerName.trim();
    if (!nameBereinigt) {
      setProfilFehler('Bitte einen vollständigen Namen angeben.');
      return;
    }

    setSpeichertProfil(true);
    try {
      const res = await onProfilSpeichern({
        vollerName: nameBereinigt,
        trikotNummer: trikotNummer.trim(),
        position: position.trim(),
        telefon: telefon.trim(),
        customProfilWerte: { ...customWerte },
      });
      if (!res.ok) {
        setProfilFehler(res.fehler ?? 'Profil konnte nicht gespeichert werden.');
        return;
      }
      setProfilHinweis('Profil- und Spielerdaten gespeichert.');
      setTimeout(() => setProfilHinweis(null), 2400);
    } finally {
      setSpeichertProfil(false);
    }
  };

  const handleKontoSpeichern = async () => {
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

    setSpeichertKonto(true);
    try {
      const res = await onZugangSpeichern({
        benutzername: userBereinigt,
        email: mailBereinigt,
        ...(passwortNeu
          ? { altesPasswort: passwortAktuell, neuesPasswort: passwortNeu }
          : {}),
      });
      if (!res.ok) {
        setKontoFehler(res.fehler ?? 'Kontodaten konnten nicht aktualisiert werden.');
        return;
      }
      setPasswortAktuell('');
      setPasswortNeu('');
      setPasswortWiederholung('');
      setKontoHinweis(
        passwortNeu
          ? 'Kontodaten und Passwort erfolgreich aktualisiert.'
          : 'Nutzername und E-Mail-Adresse gespeichert.'
      );
      setTimeout(() => setKontoHinweis(null), 2600);
    } finally {
      setSpeichertKonto(false);
    }
  };

  const kategorien: SettingsKategorie[] = [
    { id: 'profil', label: 'Spieler- & Nutzerprofil', gruppe: 'SidelineOS-Konto' },
    { id: 'konto', label: 'Zugang, E-Mail & Passwort', gruppe: 'SidelineOS-Konto' },
  ];

  const pluginsMitPanel = aktivePlugins.filter((p) => Boolean(p.settingsPanels?.user));
  for (const plugin of pluginsMitPanel) {
    for (const anker of plugin.manifest.settingsAnker.user ?? []) {
      kategorien.push({
        id: anker.id,
        label: anker.label,
        gruppe: `Plugin: ${plugin.manifest.name}`,
        badge: anker.badge,
      });
    }
  }

  const settingsKontext: PluginSettingsKontext = {
    team,
    benutzer,
    aktiveTeamAnsicht,
    s3Konfig,
  };

  return (
    <SettingsShell
      titel="Persönliche Einstellungen"
      untertitel={`Einstellungen für dein Benutzerkonto (${TEAM_ROLLEN_LABELS[aktiveTeamAnsicht]} · ${team.name}). Aktive Plugins blenden ihre persönlichen Optionen automatisch unten mit ein.`}
      kategorien={kategorien}
      zurueckLabel="Alle Einstellungen"
      onZurueck={onZurueck}
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

        {profilFehler && <p className="text-xs text-[#FCA5A5]">{profilFehler}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-xs text-[#86EFAC]">{profilHinweis ?? ''}</span>
          <button
            type="button"
            disabled={speichertProfil}
            onClick={() => void handleProfilSpeichern()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#F59E0B] px-3.5 py-2 text-xs font-semibold text-[#0B0E11] transition-colors hover:bg-[#FBBF24] disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {speichertProfil ? 'Speichert…' : 'Profil speichern'}
          </button>
        </div>
      </section>

      {/* Sektion 2: Zugang, E-Mail & Passwort */}
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
            disabled={speichertKonto}
            onClick={() => void handleKontoSpeichern()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#232933] bg-[#1E2530] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:border-[#F59E0B] disabled:opacity-60"
          >
            {speichertKonto ? 'Speichert…' : 'Zugangsdaten aktualisieren'}
          </button>
        </div>

        <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-3 text-xs text-[#8B949E]">
          <strong className="font-medium text-[#E6EDF3]">Konto-Portabilität (Roadmap):</strong>{' '}
          Dein Konto bleibt bei einem Team-Austritt erhalten. In einer späteren Version kannst du
          dein Profil inkl. eigener Notizen per Export-Token auf einen anderen SidelineOS-Server
          umziehen.
        </div>
      </section>

      {/* Dynamische Einstellungs-Panels aller fürs Team aktiven Plugins */}
      {pluginsMitPanel.map((plugin) => {
        const UserPanel = plugin.settingsPanels!.user!;
        return <UserPanel key={plugin.manifest.id} ctx={settingsKontext} />;
      })}
    </SettingsShell>
  );
}
