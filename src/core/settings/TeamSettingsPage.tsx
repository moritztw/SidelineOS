import { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  BenutzerKonto,
  ProfilCustomFeld,
  S3Konfiguration,
  SpielerUnit,
  TeamEinladung,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from '../../shared/types.ts';
import { SPIELER_UNIT_LABELS, TEAM_ROLLEN_LABELS } from '../../shared/types.ts';
import type { PluginSettingsKontext, SidelinePlugin } from '../../sdk/plugin.ts';
import { SettingsShell, type SettingsKategorie } from '../layout/SettingsShell.tsx';

import type { ApiAktionErgebnis } from './UserSettingsPage.tsx';

export interface TeamMitgliedBenutzerInfo {
  uuid: string;
  benutzername: string;
  vollerName: string;
  trikotNummer?: string;
  position?: string;
  email?: string;
  telefon?: string;
}

interface TeamSettingsPageProps {
  team: TeamKontext;
  benutzer: BenutzerKonto;
  benutzerListe: TeamMitgliedBenutzerInfo[];
  mitgliedschaften: TeamMitgliedschaft[];
  einladungen: TeamEinladung[];
  s3Konfig: S3Konfiguration;
  aktivePlugins: SidelinePlugin[];
  onTeamAktualisieren: (team: TeamKontext) => Promise<ApiAktionErgebnis>;
  onNeueSaisonStarten: (teamId: string, neueSaison: string) => Promise<ApiAktionErgebnis>;
  onMitgliedRolleAendern: (mitgliedschaftId: string, rolle: TeamRolle) => Promise<ApiAktionErgebnis>;
  onMitgliedUnitsAendern: (
    mitgliedschaftId: string,
    units: SpielerUnit[]
  ) => Promise<ApiAktionErgebnis>;
  onMitgliedBestaetigen: (mitgliedschaftId: string) => Promise<ApiAktionErgebnis>;
  onMitgliedEntfernen: (mitgliedschaftId: string) => Promise<ApiAktionErgebnis>;
  onEinladungErstellen: (payload: {
    typ: 'EMAIL' | 'TEAM_LINK';
    zielEmail?: string;
    rolle: TeamRolle;
    units: SpielerUnit[];
    gueltigTage?: number;
    bestaetigungErforderlich?: boolean;
  }) => Promise<
    ApiAktionErgebnis & {
      invitation?: TeamEinladung;
      mailStatus?: { gesendet: boolean; modus: string; hinweis: string };
    }
  >;
  onEinladungWiderrufen: (einladungId: string) => Promise<ApiAktionErgebnis>;
  onProfilCustomFeldHinzufuegen: (
    teamId: string,
    feld: ProfilCustomFeld
  ) => Promise<ApiAktionErgebnis>;
  onProfilCustomFeldLoeschen: (teamId: string, key: string) => Promise<ApiAktionErgebnis>;
  onEinladungTesten?: (token: string) => void;
  onZurueck?: () => void;
}

const ALLE_UNITS: SpielerUnit[] = ['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS'];
const ALLE_ROLLEN: TeamRolle[] = ['TEAM_ADMIN', 'COACH', 'PLAYER'];

export function TeamSettingsPage({
  team,
  benutzer,
  benutzerListe,
  mitgliedschaften,
  einladungen,
  s3Konfig,
  aktivePlugins,
  onTeamAktualisieren,
  onNeueSaisonStarten,
  onMitgliedRolleAendern,
  onMitgliedUnitsAendern,
  onMitgliedBestaetigen,
  onMitgliedEntfernen,
  onEinladungErstellen,
  onEinladungWiderrufen,
  onProfilCustomFeldHinzufuegen,
  onProfilCustomFeldLoeschen,
  onEinladungTesten,
  onZurueck,
}: TeamSettingsPageProps) {
  const [teamName, setTeamName] = useState(team.name);
  const [aktiveSaison, setAktiveSaison] = useState(team.aktiveSaison);
  const [neueSaisonEingabe, setNeueSaisonEingabe] = useState('');
  const [kurzname, setKurzname] = useState(team.kurzname);
  const [primaerFarbe, setPrimaerFarbe] = useState(team.primaerFarbe ?? '#F59E0B');
  const [teamHinweis, setTeamHinweis] = useState<string | null>(null);

  const [mailAdresse, setMailAdresse] = useState('');
  const [mailRolle, setMailRolle] = useState<TeamRolle>('PLAYER');
  const [mailUnits, setMailUnits] = useState<SpielerUnit[]>(['OFFENSE']);
  const [linkRolle, setLinkRolle] = useState<TeamRolle>('PLAYER');
  const [linkTage, setLinkTage] = useState<number>(14);
  const [linkBestaetigung, setLinkBestaetigung] = useState<boolean>(true);
  const [kopiertId, setKopiertId] = useState<string | null>(null);
  const [einladungHinweis, setEinladungHinweis] = useState<string | null>(null);

  const [profilFeldLabel, setProfilFeldLabel] = useState('');
  const [profilFeldTyp, setProfilFeldTyp] = useState<ProfilCustomFeld['typ']>('text');
  const [profilFeldPflicht, setProfilFeldPflicht] = useState(false);
  const [profilFeldOptionen, setProfilFeldOptionen] = useState('');
  const [profilFeldFehler, setProfilFeldFehler] = useState<string | null>(null);
  const [aktionFehler, setAktionFehler] = useState<string | null>(null);

  useEffect(() => {
    setTeamName(team.name);
    setAktiveSaison(team.aktiveSaison);
    setKurzname(team.kurzname);
    setPrimaerFarbe(team.primaerFarbe ?? '#F59E0B');
    setTeamHinweis(null);
    setAktionFehler(null);
  }, [team]);

  const teamMitglieder = mitgliedschaften.filter((m) => m.teamId === team.id);
  const aktiveMitglieder = teamMitglieder.filter((m) => m.status === 'AKTIV');
  const offeneAnfragen = teamMitglieder.filter((m) => m.status === 'WARTET_AUF_FREIGABE');
  const teamEinladungen = einladungen.filter((e) => e.teamId === team.id && e.aktiv);

  const findeBenutzer = (uuid: string) => benutzerListe.find((b) => b.uuid === uuid);

  const toggleUnitInListe = (aktuell: SpielerUnit[], unit: SpielerUnit): SpielerUnit[] =>
    aktuell.includes(unit) ? aktuell.filter((u) => u !== unit) : [...aktuell, unit];

  const fuehreAus = async (fn: () => Promise<ApiAktionErgebnis>, erfolgsCb?: () => void) => {
    setAktionFehler(null);
    const res = await fn();
    if (!res.ok) {
      setAktionFehler(res.fehler ?? 'Aktion fehlgeschlagen.');
      return;
    }
    erfolgsCb?.();
  };

  const handleTeamSpeichern = async () => {
    if (!teamName.trim()) return;
    await fuehreAus(
      () =>
        onTeamAktualisieren({
          ...team,
          name: teamName.trim(),
          aktiveSaison,
          kurzname: kurzname.trim() || team.kurzname,
          primaerFarbe,
        }),
      () => {
        setTeamHinweis('Team-Einstellungen gespeichert.');
        setTimeout(() => setTeamHinweis(null), 2200);
      }
    );
  };

  const handleNeueSaison = async () => {
    const wert = neueSaisonEingabe.trim();
    if (!wert) return;
    await fuehreAus(
      () => onNeueSaisonStarten(team.id, wert),
      () => {
        setNeueSaisonEingabe('');
        setTeamHinweis(`Saison ${wert} gestartet – alle bisherigen Saisons bleiben abrufbar.`);
        setTimeout(() => setTeamHinweis(null), 3000);
      }
    );
  };

  const handleMailEinladung = async () => {
    const ziel = mailAdresse.trim();
    if (!ziel || !ziel.includes('@')) return;
    setAktionFehler(null);
    const res = await onEinladungErstellen({
      typ: 'EMAIL',
      zielEmail: ziel,
      rolle: mailRolle,
      units: mailUnits,
      gueltigTage: 7,
      bestaetigungErforderlich: false,
    });
    if (!res.ok) {
      setAktionFehler(res.fehler ?? 'E-Mail-Einladung konnte nicht angelegt werden.');
      return;
    }
    setMailAdresse('');
    setEinladungHinweis(
      res.mailStatus?.hinweis ??
        `E-Mail-Einladung an ${ziel} angelegt (${res.invitation?.pfad ?? '/invite/…'}).`
    );
    setTimeout(() => setEinladungHinweis(null), 4000);
  };

  const handleTeamLinkErstellen = async () => {
    setAktionFehler(null);
    const res = await onEinladungErstellen({
      typ: 'TEAM_LINK',
      rolle: linkRolle,
      units: ['OFFENSE'],
      gueltigTage: linkTage,
      bestaetigungErforderlich: linkBestaetigung,
    });
    if (!res.ok) {
      setAktionFehler(res.fehler ?? 'Team-Link konnte nicht erstellt werden.');
      return;
    }
    setEinladungHinweis(`Team-Einladungslink erstellt (${res.invitation?.pfad ?? '/invite/…'}).`);
    setTimeout(() => setEinladungHinweis(null), 3000);
  };

  const handleLinkKopieren = async (inv: TeamEinladung) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${inv.pfad}`);
    } catch {
      // Fallback ohne Clipboard-Berechtigung
    }
    setKopiertId(inv.id);
    setTimeout(() => setKopiertId(null), 1800);
  };

  const handleProfilCustomFeldAnlegen = async () => {
    setProfilFeldFehler(null);
    const label = profilFeldLabel.trim();
    if (!label) {
      setProfilFeldFehler('Bitte eine Feldbezeichnung eingeben.');
      return;
    }
    const key = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '');
    if (!key || team.customProfilFelder.some((f) => f.key === key)) {
      setProfilFeldFehler('Ein Profilfeld mit diesem Namen existiert bereits.');
      return;
    }
    const optionen =
      profilFeldTyp === 'select'
        ? profilFeldOptionen
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    const res = await onProfilCustomFeldHinzufuegen(team.id, {
      key,
      label,
      typ: profilFeldTyp,
      pflicht: profilFeldPflicht,
      ...(optionen && optionen.length > 0 ? { optionen } : {}),
    });
    if (!res.ok) {
      setProfilFeldFehler(res.fehler ?? 'Profilfeld konnte nicht gespeichert werden.');
      return;
    }
    setProfilFeldLabel('');
    setProfilFeldOptionen('');
    setProfilFeldPflicht(false);
  };

  const kategorien: SettingsKategorie[] = [
    { id: 'team-profil', label: 'Team-Profil & Saisons', gruppe: 'Team-Verwaltung' },
    { id: 'team-mitglieder', label: 'Mitglieder, Rollen & Units', gruppe: 'Team-Verwaltung' },
    {
      id: 'team-einladungen',
      label: 'Einladungen & Freigaben',
      gruppe: 'Team-Verwaltung',
      badge: offeneAnfragen.length,
    },
    { id: 'team-profilfelder', label: 'Spieler-Custom-Felder', gruppe: 'Team-Verwaltung' },
  ];

  const pluginsMitTeamPanel = aktivePlugins.filter((p) => Boolean(p.settingsPanels?.team));
  for (const plugin of pluginsMitTeamPanel) {
    for (const anker of plugin.manifest.settingsAnker.team ?? []) {
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
    aktiveTeamAnsicht: 'TEAM_ADMIN',
    s3Konfig,
  };

  return (
    <SettingsShell
      titel={`Team-Einstellungen · ${team.name}`}
      untertitel="Zentrale Team-Admin-Verwaltung für Saisons, Mitglieder, Multi-Units, Einladungen inkl. Freigabe-Warteliste, Spieler-Custom-Felder sowie Plugin-Konfigurationen."
      kategorien={kategorien}
      zurueckLabel="Alle Einstellungen"
      onZurueck={onZurueck}
    >
      {aktionFehler && (
        <div
          role="alert"
          className="rounded-lg border border-[#DC2626]/50 bg-[#DC2626]/10 px-4 py-2.5 text-xs text-[#FCA5A5]"
        >
          {aktionFehler}
        </div>
      )}
      {/* 1. Team-Profil, Saisons & Farben */}
      <section
        id="team-profil"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-5"
      >
        <div className="border-b border-[#232933] pb-3">
          <h2 className="text-sm font-semibold text-white">Team-Profil, Saisons &amp; Farben</h2>
          <p className="mt-0.5 text-xs text-[#8B949E]">
            Das Team bleibt saisonübergreifend bestehen – Kader, Wörterbücher und alte Spielzeiten
            gehen beim Saisonwechsel nicht verloren.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs text-[#8B949E] sm:col-span-2">
            <span>Teamname</span>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Aktuelle Saison</span>
            <select
              value={aktiveSaison}
              onChange={(e) => setAktiveSaison(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            >
              {team.saisons.map((s) => (
                <option key={s} value={s} className="bg-[#13171D]">
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Kurzname / Bereich</span>
            <input
              type="text"
              value={kurzname}
              onChange={(e) => setKurzname(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
        </div>

        <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-white">
              <Calendar className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
              Saisons im Team ({team.saisons.length})
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              {team.saisons.map((s) => (
                <span
                  key={s}
                  className={`rounded border px-2 py-0.5 ${
                    s === team.aktiveSaison
                      ? 'border-[#F59E0B]/50 bg-[#F59E0B]/10 text-[#F59E0B]'
                      : 'border-[#232933] bg-[#13171D] text-[#8B949E]'
                  }`}
                >
                  {s} {s === team.aktiveSaison ? '(Aktuell)' : '(Archiv)'}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={neueSaisonEingabe}
              onChange={(e) => setNeueSaisonEingabe(e.target.value)}
              placeholder="Neue Saison (z. B. 2027)"
              className="w-48 rounded border border-[#232933] bg-[#13171D] px-3 py-1.5 font-mono text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleNeueSaison}
              className="inline-flex items-center gap-1.5 rounded border border-[#232933] bg-[#1E2530] px-3 py-1.5 text-xs font-medium text-white hover:border-[#F59E0B]"
            >
              <Plus className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
              Neue Saison starten
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <label className="flex items-center gap-2.5 text-xs text-[#8B949E]">
            <span>Primäre Teamfarbe</span>
            <input
              type="color"
              value={primaerFarbe}
              onChange={(e) => setPrimaerFarbe(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border border-[#232933] bg-[#0B0E11]"
            />
            <span className="font-mono text-[#E6EDF3]">{primaerFarbe.toUpperCase()}</span>
          </label>

          <div className="flex items-center gap-3">
            {teamHinweis && <span className="text-xs text-[#86EFAC]">{teamHinweis}</span>}
            <button
              type="button"
              onClick={handleTeamSpeichern}
              className="rounded-md bg-[#F59E0B] px-3.5 py-2 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24]"
            >
              Team speichern
            </button>
          </div>
        </div>
      </section>

      {/* 2. Mitglieder, Rollen & Multi-Units */}
      <section
        id="team-mitglieder"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232933] pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                Mitglieder, Rollen &amp; Multi-Units ({aktiveMitglieder.length})
              </h2>
              <p className="text-[11px] text-[#8B949E]">
                Two-Way-Spieler können gleichzeitig Offense, Defense und Special Teams zugeordnet
                sein. „Aus Team entfernen“ löscht das Benutzerkonto nicht.
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#232933] text-[#8B949E]">
                <th className="py-2 pr-3 font-medium">Person</th>
                <th className="py-2 pr-3 font-medium">Pos / #</th>
                <th className="py-2 pr-3 font-medium">Rolle im Team</th>
                <th className="py-2 pr-3 font-medium">Units (Mehrfachwahl)</th>
                <th className="py-2 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232933]">
              {aktiveMitglieder.map((mem) => {
                const user = findeBenutzer(mem.userUuid);
                if (!user) return null;
                return (
                  <tr key={mem.id}>
                    <td className="py-3 pr-3">
                      <div className="font-medium text-[#E6EDF3]">{user.vollerName}</div>
                      <div className="font-mono text-[11px] text-[#8B949E]">
                        {user.email ?? `@${user.benutzername}`}
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-mono text-[#E6EDF3] whitespace-nowrap">
                      {user.trikotNummer ? `#${user.trikotNummer}` : '–'}{' '}
                      <span className="text-[#8B949E]">{user.position || ''}</span>
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        aria-label={`Rolle für ${user.vollerName}`}
                        value={mem.rolle}
                        onChange={(e) =>
                          void fuehreAus(() =>
                            onMitgliedRolleAendern(mem.id, e.target.value as TeamRolle)
                          )
                        }
                        className="rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                      >
                        {ALLE_ROLLEN.map((r) => (
                          <option key={r} value={r}>
                            {TEAM_ROLLEN_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {ALLE_UNITS.map((unit) => {
                          const aktiv = mem.units.includes(unit);
                          return (
                            <label
                              key={unit}
                              className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-[#E6EDF3]"
                            >
                              <input
                                type="checkbox"
                                checked={aktiv}
                                onChange={() =>
                                  void fuehreAus(() =>
                                    onMitgliedUnitsAendern(
                                      mem.id,
                                      toggleUnitInListe(mem.units, unit)
                                    )
                                  )
                                }
                                className="h-3.5 w-3.5 accent-[#F59E0B]"
                              />
                              <span>
                                {unit === 'SPECIAL_TEAMS'
                                  ? 'ST'
                                  : SPIELER_UNIT_LABELS[unit]}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void fuehreAus(() => onMitgliedEntfernen(mem.id))}
                        className="rounded border border-[#232933] bg-[#0B0E11] px-2.5 py-1 text-[11px] text-[#8B949E] hover:border-[#DC2626]/50 hover:text-[#FCA5A5]"
                      >
                        Entfernen
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Einladungen & Bestätigungs-Warteliste */}
      <section
        id="team-einladungen"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-5"
      >
        <div className="border-b border-[#232933] pb-3">
          <h2 className="text-sm font-semibold text-white">
            Einladungen (E-Mail &amp; Team-Link) &amp; Freigabe-Warteliste
          </h2>
          <p className="mt-0.5 text-xs text-[#8B949E]">
            Lade gezielt per E-Mail ein oder teile einen Team-Link (z. B. für die Team-Gruppe) mit
            Bestätigungspflicht.
          </p>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#F59E0B]">
            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ausstehende Beitrittsanfragen ({offeneAnfragen.length})</span>
          </div>

          {offeneAnfragen.length === 0 ? (
            <p className="rounded border border-[#232933] bg-[#0B0E11] px-3 py-3 text-xs text-[#6E7681]">
              Aktuell warten keine neuen Registrierungen auf Bestätigung.
            </p>
          ) : (
            <div className="space-y-2">
              {offeneAnfragen.map((anfrage) => {
                const user = findeBenutzer(anfrage.userUuid);
                if (!user) return null;
                return (
                  <div
                    key={anfrage.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#F59E0B]/40 bg-[#0B0E11] p-3 text-xs"
                  >
                    <div>
                      <div className="font-medium text-white">
                        {user.vollerName}{' '}
                        {user.trikotNummer && (
                          <span className="font-mono text-[#F59E0B]">#{user.trikotNummer}</span>
                        )}{' '}
                        {user.position && (
                          <span className="text-[#8B949E]">· {user.position}</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#8B949E]">
                        {user.email} · Angefragt am {anfrage.beigetretenAm}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {ALLE_UNITS.map((unit) => (
                        <label
                          key={unit}
                          className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-[#E6EDF3]"
                        >
                          <input
                            type="checkbox"
                            checked={anfrage.units.includes(unit)}
                            onChange={() =>
                              void fuehreAus(() =>
                                onMitgliedUnitsAendern(
                                  anfrage.id,
                                  toggleUnitInListe(anfrage.units, unit)
                                )
                              )
                            }
                            className="h-3.5 w-3.5 accent-[#F59E0B]"
                          />
                          <span>{unit === 'SPECIAL_TEAMS' ? 'ST' : SPIELER_UNIT_LABELS[unit]}</span>
                        </label>
                      ))}

                      <button
                        type="button"
                        onClick={() => void fuehreAus(() => onMitgliedBestaetigen(anfrage.id))}
                        className="inline-flex items-center gap-1 rounded bg-[#F59E0B] px-2.5 py-1 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24]"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Bestätigen
                      </button>
                      <button
                        type="button"
                        onClick={() => void fuehreAus(() => onMitgliedEntfernen(anfrage.id))}
                        className="inline-flex items-center gap-1 rounded border border-[#232933] px-2.5 py-1 text-xs text-[#8B949E] hover:border-[#DC2626]/50 hover:text-[#FCA5A5]"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Ablehnen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Mail className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
              Direkte E-Mail-Einladung (sofort aktiv)
            </div>
            <input
              type="email"
              value={mailAdresse}
              onChange={(e) => setMailAdresse(e.target.value)}
              placeholder="spieler@verein.de"
              className="w-full rounded border border-[#232933] bg-[#13171D] px-3 py-1.5 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <select
                value={mailRolle}
                onChange={(e) => setMailRolle(e.target.value as TeamRolle)}
                className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1.5 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
              >
                {ALLE_ROLLEN.map((r) => (
                  <option key={r} value={r}>
                    Rolle: {TEAM_ROLLEN_LABELS[r]}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                {ALLE_UNITS.map((unit) => (
                  <label
                    key={unit}
                    className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-[#E6EDF3]"
                  >
                    <input
                      type="checkbox"
                      checked={mailUnits.includes(unit)}
                      onChange={() => setMailUnits((alt) => toggleUnitInListe(alt, unit))}
                      className="h-3.5 w-3.5 accent-[#F59E0B]"
                    />
                    <span>{unit === 'SPECIAL_TEAMS' ? 'ST' : SPIELER_UNIT_LABELS[unit]}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleMailEinladung}
              className="w-full rounded bg-[#1E2530] py-1.5 text-xs font-medium text-white hover:bg-[#2A3342]"
            >
              E-Mail-Einladung erzeugen
            </button>
          </div>

          <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Link2 className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
              Teilbarer Team-Einladungslink
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={linkRolle}
                onChange={(e) => setLinkRolle(e.target.value as TeamRolle)}
                className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1.5 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
              >
                <option value="PLAYER">Standard-Rolle: Spieler</option>
                <option value="COACH">Standard-Rolle: Coach</option>
              </select>
              <select
                value={linkTage}
                onChange={(e) => setLinkTage(Number(e.target.value))}
                className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1.5 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
              >
                <option value={7}>Gültig: 7 Tage</option>
                <option value={14}>Gültig: 14 Tage</option>
                <option value={30}>Gültig: 30 Tage</option>
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-[#E6EDF3]">
              <input
                type="checkbox"
                checked={linkBestaetigung}
                onChange={(e) => setLinkBestaetigung(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#F59E0B]"
              />
              <span>Beitritte müssen vom Team Admin bestätigt werden (empfohlen)</span>
            </label>

            <button
              type="button"
              onClick={handleTeamLinkErstellen}
              className="w-full rounded bg-[#F59E0B] py-1.5 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24]"
            >
              Neuen Team-Link generieren
            </button>
          </div>
        </div>

        {einladungHinweis && (
          <div
            role="status"
            className="rounded border border-[#16A34A]/40 bg-[#16A34A]/10 px-3 py-2 text-xs text-[#86EFAC]"
          >
            {einladungHinweis}
          </div>
        )}

        {teamEinladungen.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-[#8B949E]">Aktive Einladungen</div>
            <div className="divide-y divide-[#232933] rounded-md border border-[#232933] bg-[#0B0E11]">
              {teamEinladungen.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[#E6EDF3]">{inv.pfad}</span>
                      <span className="text-[11px] text-[#8B949E]">
                        {inv.typ === 'EMAIL' ? `Mail: ${inv.zielEmail}` : 'Team-Link'} ·{' '}
                        {TEAM_ROLLEN_LABELS[inv.rolle]}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6E7681]">
                      Gültig bis {inv.gueltigBis} ·{' '}
                      {inv.bestaetigungErforderlich
                        ? 'Mit Admin-Bestätigung'
                        : 'Direkte Aktivierung'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {onEinladungTesten && (
                      <button
                        type="button"
                        onClick={() => onEinladungTesten(inv.token)}
                        title="Registrierungsseite /invite/<token> testen"
                        className="inline-flex items-center gap-1 rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1 text-[11px] font-medium text-[#F59E0B] hover:bg-[#F59E0B]/20"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        Öffnen
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleLinkKopieren(inv)}
                      className="inline-flex items-center gap-1 rounded border border-[#232933] bg-[#13171D] px-2.5 py-1 text-[11px] text-[#E6EDF3] hover:border-[#F59E0B]"
                    >
                      <Copy className="h-3 w-3" aria-hidden="true" />
                      {kopiertId === inv.id ? 'Kopiert' : 'Link kopieren'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void fuehreAus(() => onEinladungWiderrufen(inv.id))}
                      title="Einladung widerrufen"
                      aria-label="Einladung widerrufen"
                      className="rounded p-1 text-[#8B949E] hover:bg-[#DC2626]/15 hover:text-[#FCA5A5]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 4. Spieler-Profil Custom-Felder */}
      <section
        id="team-profilfelder"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-[#232933] pb-3">
          <ShieldCheck className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-white">
              Spieler-Profil Custom-Felder ({team.customProfilFelder.length})
            </h2>
            <p className="text-[11px] text-[#8B949E]">
              Definiere vereins- oder teamspezifische Zusatzfelder (z. B. Spielerpass-Nr.,
              Notfallkontakt, Jersey-Größe). Sie erscheinen automatisch im Profil jedes Mitglieds.
            </p>
          </div>
        </div>

        <div className="divide-y divide-[#232933] rounded-md border border-[#232933] bg-[#0B0E11]">
          {team.customProfilFelder.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-[#6E7681]">
              Noch keine eigenen Profilfelder angelegt.
            </div>
          ) : (
            team.customProfilFelder.map((feld) => (
              <div
                key={feld.key}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
              >
                <div>
                  <span className="font-medium text-[#E6EDF3]">{feld.label}</span>
                  <span className="ml-2 font-mono text-[11px] text-[#8B949E]">
                    ({feld.typ}
                    {feld.pflicht ? ' · Pflicht' : ''})
                  </span>
                  {feld.optionen && feld.optionen.length > 0 && (
                    <div className="text-[11px] text-[#6E7681]">
                      Optionen: {feld.optionen.join(', ')}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void fuehreAus(() => onProfilCustomFeldLoeschen(team.id, feld.key))}
                  aria-label={`Profilfeld ${feld.label} löschen`}
                  className="rounded p-1 text-[#8B949E] hover:bg-[#DC2626]/15 hover:text-[#FCA5A5]"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            type="text"
            value={profilFeldLabel}
            onChange={(e) => setProfilFeldLabel(e.target.value)}
            placeholder="Feldname (z. B. Helm-Größe)"
            className="rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
          />
          <select
            value={profilFeldTyp}
            onChange={(e) => setProfilFeldTyp(e.target.value as ProfilCustomFeld['typ'])}
            className="rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
          >
            <option value="text">Freitext</option>
            <option value="number">Zahl</option>
            <option value="select">Auswahlmenü</option>
          </select>
          <label className="flex cursor-pointer items-center gap-2 rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-[#E6EDF3]">
            <input
              type="checkbox"
              checked={profilFeldPflicht}
              onChange={(e) => setProfilFeldPflicht(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#F59E0B]"
            />
            <span>Pflichtfeld</span>
          </label>
        </div>

        {profilFeldTyp === 'select' && (
          <input
            type="text"
            value={profilFeldOptionen}
            onChange={(e) => setProfilFeldOptionen(e.target.value)}
            placeholder="Auswahl-Optionen kommagetrennt (z. B. S, M, L, XL)"
            className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
          />
        )}

        {profilFeldFehler && <p className="text-xs text-[#FCA5A5]">{profilFeldFehler}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleProfilCustomFeldAnlegen}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#232933] bg-[#1E2530] px-3 py-1.5 text-xs font-medium text-white hover:border-[#F59E0B]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Profilfeld hinzufügen
          </button>
        </div>
      </section>

      {/* 5. Dynamische Team-Einstellungs-Panels aller aktiven Plugins */}
      {pluginsMitTeamPanel.map((plugin) => {
        const TeamPanel = plugin.settingsPanels!.team!;
        return <TeamPanel key={plugin.manifest.id} ctx={settingsKontext} />;
      })}
    </SettingsShell>
  );
}
