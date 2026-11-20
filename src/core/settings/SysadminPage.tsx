import { useState } from 'react';
import {
  Archive,
  Blocks,
  Building2,
  HardDrive,
  Mail,
  Plus,
  RotateCcw,
  ShieldAlert,
  Terminal,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type {
  BenutzerKonto,
  ModulId,
  S3Konfiguration,
  SmtpKonfiguration,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from '../../shared/types.ts';
import { TEAM_ROLLEN_LABELS } from '../../shared/types.ts';
import { SIDELINE_MODULE_REGISTRY } from '../moduleRegistry.ts';
import { SettingsShell, type SettingsKategorie } from '../layout/SettingsShell.tsx';

interface CleanupEintrag {
  id: string;
  assetPfad: string;
  groesseGb: number;
  geplanteLoeschung: string;
  restTage: number;
}

const INITIALE_QUEUE: CleanupEintrag[] = [
  {
    id: 'gc-1',
    assetPfad: 'assets/reels/a8f12c90-4b21/clips/',
    groesseGb: 3.4,
    geplanteLoeschung: '04.12.2026',
    restTage: 14,
  },
  {
    id: 'gc-2',
    assetPfad: 'assets/reels/d390e112-90ab/raw_source.mp4',
    groesseGb: 8.7,
    geplanteLoeschung: '22.11.2026',
    restTage: 2,
  },
];

interface SysadminPageProps {
  globalAktivierteModule: ModulId[];
  teams: TeamKontext[];
  benutzerListe: BenutzerKonto[];
  mitgliedschaften: TeamMitgliedschaft[];
  s3Konfig: S3Konfiguration;
  smtpKonfig: SmtpKonfiguration;
  onGlobalModulToggle: (modulId: ModulId) => void;
  onTeamModulToggle: (teamId: string, modulId: ModulId) => void;
  onTeamErstellen: (team: TeamKontext) => void;
  onTeamArchivToggle: (teamId: string) => void;
  onTeamLoeschen: (teamId: string) => void;
  onBenutzerErstellen: (
    benutzer: BenutzerKonto,
    teamZuweisung?: { teamId: string; rolle: TeamRolle }
  ) => void;
  onBenutzerSysadminToggle: (userUuid: string) => void;
  onBenutzerLoeschen: (userUuid: string) => void;
  onS3Speichern: (neu: S3Konfiguration) => void;
  onSmtpSpeichern: (neu: SmtpKonfiguration) => void;
}

export function SysadminPage({
  globalAktivierteModule,
  teams,
  benutzerListe,
  mitgliedschaften,
  s3Konfig,
  smtpKonfig,
  onGlobalModulToggle,
  onTeamModulToggle,
  onTeamErstellen,
  onTeamArchivToggle,
  onTeamLoeschen,
  onBenutzerErstellen,
  onBenutzerSysadminToggle,
  onBenutzerLoeschen,
  onS3Speichern,
  onSmtpSpeichern,
}: SysadminPageProps) {
  // Neues Team
  const [neuesTeamName, setNeuesTeamName] = useState('');
  const [neuesTeamSaison, setNeuesTeamSaison] = useState('2026');
  const [neuesTeamKurz, setNeuesTeamKurz] = useState('');
  const [loeschTeamBestaetigungId, setLoeschTeamBestaetigungId] = useState<string | null>(null);

  // Neuer Benutzer
  const [neuName, setNeuName] = useState('');
  const [neuUsername, setNeuUsername] = useState('');
  const [neuEmail, setNeuEmail] = useState('');
  const [neuIstSysadmin, setNeuIstSysadmin] = useState(false);
  const [neuTeamId, setNeuTeamId] = useState<string>(teams[0]?.id ?? '');
  const [neuTeamRolle, setNeuTeamRolle] = useState<TeamRolle>('TEAM_ADMIN');

  // S3 & SMTP lokale Formular-Kopien
  const [s3Form, setS3Form] = useState<S3Konfiguration>(s3Konfig);
  const [s3Status, setS3Status] = useState<string | null>(null);
  const [smtpForm, setSmtpForm] = useState<SmtpKonfiguration>(smtpKonfig);
  const [smtpStatus, setSmtpStatus] = useState<string | null>(null);

  // S3-Cleanup-Queue (Videoanalyse-Beitrag)
  const [retentionTage, setRetentionTage] = useState<number>(14);
  const [queue, setQueue] = useState<CleanupEintrag[]>(INITIALE_QUEUE);
  const [cleanupStatus, setCleanupStatus] = useState<string | null>(null);

  const videoGlobalAktiv = globalAktivierteModule.includes('video-analysis');

  const kategorien: SettingsKategorie[] = [
    { id: 'sys-module', label: 'Module & Installation', gruppe: 'Instanz-Verwaltung' },
    { id: 'sys-teams', label: 'Teams / Mandanten', gruppe: 'Instanz-Verwaltung' },
    { id: 'sys-benutzer', label: 'Globale Benutzer & Rollen', gruppe: 'Instanz-Verwaltung' },
    { id: 'sys-storage', label: 'S3 Object Storage', gruppe: 'Infrastruktur' },
    { id: 'sys-smtp', label: 'E-Mail / SMTP', gruppe: 'Infrastruktur' },
    { id: 'sys-bootstrap', label: 'ENV-Ersteinrichtung', gruppe: 'Infrastruktur' },
  ];

  if (videoGlobalAktiv) {
    kategorien.push({
      id: 'modul-video-cleanup',
      label: 'S3-Cleanup & Schonfrist',
      gruppe: 'Modul: Videoanalyse',
      badge: queue.length,
    });
  }

  const handleTeamAnlegen = () => {
    const name = neuesTeamName.trim();
    if (!name) return;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    onTeamErstellen({
      id: `team-${slug || Date.now()}`,
      name,
      saison: neuesTeamSaison.trim() || '2026',
      kurzname: neuesTeamKurz.trim() || name.slice(0, 12),
      primaerFarbe: '#F59E0B',
      archiviert: false,
      aktivierteModule: [...globalAktivierteModule],
      customProfilFelder: [
        { key: 'notfallkontakt', label: 'Notfallkontakt', typ: 'text', pflicht: true },
      ],
    });
    setNeuesTeamName('');
    setNeuesTeamKurz('');
  };

  const handleBenutzerAnlegen = () => {
    const name = neuName.trim();
    const mail = neuEmail.trim();
    const username = (neuUsername.trim() || mail.split('@')[0] || '').toLowerCase();
    if (!name || !mail.includes('@') || !username) return;

    const neuerUser: BenutzerKonto = {
      uuid: `usr-${Date.now().toString(36)}`,
      benutzername: username,
      vollerName: name,
      email: mail,
      istSysadmin: neuIstSysadmin,
      erstelltAm: new Date().toISOString().slice(0, 10),
      customProfilWerte: {},
    };

    onBenutzerErstellen(
      neuerUser,
      neuTeamId ? { teamId: neuTeamId, rolle: neuTeamRolle } : undefined
    );
    setNeuName('');
    setNeuUsername('');
    setNeuEmail('');
    setNeuIstSysadmin(false);
  };

  return (
    <SettingsShell
      titel="Sysadmin · Instanz-Administration"
      untertitel="Strikte Datenschutz-Trennung: Als Instance Admin verwaltest du Module, Mandanten, globale Benutzer, S3-Storage und SMTP – ohne App-Zugriff auf Team-Videos, Breakdowns oder Notizen."
      kategorien={kategorien}
      kopfAktion={
        <div className="inline-flex items-center gap-1.5 rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-[#8B949E]">
          <ShieldAlert className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
          Kein Team-Inhaltszugriff
        </div>
      }
    >
      {/* 1. Modul-Verwaltung (Instanz & pro Team) */}
      <section
        id="sys-module"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232933] pb-3">
          <div className="flex items-center gap-2">
            <Blocks className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                Modul-Verwaltung (Instanz &amp; pro Team)
              </h2>
              <p className="text-[11px] text-[#8B949E]">
                Deaktivierte Module verschwinden sowohl aus dem SidelineOS-Hub als auch aus allen
                Einstellungsseiten.
              </p>
            </div>
          </div>

          <code className="rounded border border-[#232933] bg-[#0B0E11] px-2.5 py-1 font-mono text-[11px] text-[#E6EDF3]">
            ENABLED_MODULES=&quot;{globalAktivierteModule.join(',')}&quot;
          </code>
        </div>

        <div className="space-y-3">
          {SIDELINE_MODULE_REGISTRY.map((modul) => {
            const globalAn = globalAktivierteModule.includes(modul.id);
            return (
              <div
                key={modul.id}
                className="rounded-md border border-[#232933] bg-[#0B0E11] p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{modul.name}</span>
                      <span className="font-mono text-[11px] text-[#8B949E]">
                        ({modul.id} · v{modul.version})
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#8B949E]">{modul.kurzbeschreibung}</p>
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-[#232933] bg-[#13171D] px-3 py-1.5 text-xs font-medium text-[#E6EDF3]">
                    <input
                      type="checkbox"
                      checked={globalAn}
                      onChange={() => onGlobalModulToggle(modul.id)}
                      className="h-3.5 w-3.5 accent-[#F59E0B]"
                    />
                    <span>{globalAn ? 'Instanzweit aktiv' : 'Deaktiviert'}</span>
                  </label>
                </div>

                {globalAn && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-[#232933] pt-2.5 text-xs">
                    <span className="text-[#6E7681]">Freigabe je Team:</span>
                    {teams.map((team) => {
                      const teamAktiv = team.aktivierteModule.includes(modul.id);
                      return (
                        <label
                          key={team.id}
                          className="inline-flex cursor-pointer items-center gap-1.5 text-[#E6EDF3]"
                        >
                          <input
                            type="checkbox"
                            checked={teamAktiv}
                            onChange={() => onTeamModulToggle(team.id, modul.id)}
                            className="h-3.5 w-3.5 accent-[#F59E0B]"
                          />
                          <span>{team.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Teams / Mandanten */}
      <section
        id="sys-teams"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-[#232933] pb-3">
          <Building2 className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-white">Teams / Mandanten ({teams.length})</h2>
            <p className="text-[11px] text-[#8B949E]">
              Mandanten anlegen, vergangene Spielzeiten archivieren oder Teams entfernen.
            </p>
          </div>
        </div>

        <div className="divide-y divide-[#232933] rounded-md border border-[#232933] bg-[#0B0E11]">
          {teams.map((team) => {
            const mitgliederZahl = mitgliedschaften.filter(
              (m) => m.teamId === team.id && m.status === 'AKTIV'
            ).length;
            const fragtLoeschung = loeschTeamBestaetigungId === team.id;

            return (
              <div
                key={team.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
              >
                <div>
                  <div className="font-medium text-white">
                    {team.name}{' '}
                    <span className="font-mono text-[#8B949E]">· {team.saison}</span>
                    {team.archiviert && (
                      <span className="ml-2 font-mono text-[10px] text-[#F59E0B]">[ARCHIVIERT]</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#8B949E]">
                    {mitgliederZahl} aktive Mitglieder · {team.aktivierteModule.length} Module
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onTeamArchivToggle(team.id)}
                    className="inline-flex items-center gap-1 rounded border border-[#232933] bg-[#13171D] px-2.5 py-1 text-[11px] text-[#E6EDF3] hover:border-[#F59E0B]"
                  >
                    <Archive className="h-3 w-3" aria-hidden="true" />
                    {team.archiviert ? 'Reaktivieren' : 'Archivieren'}
                  </button>

                  {teams.length > 1 &&
                    (fragtLoeschung ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onTeamLoeschen(team.id);
                            setLoeschTeamBestaetigungId(null);
                          }}
                          className="rounded bg-[#DC2626] px-2 py-1 text-[11px] font-semibold text-white"
                        >
                          Endgültig löschen
                        </button>
                        <button
                          type="button"
                          onClick={() => setLoeschTeamBestaetigungId(null)}
                          className="rounded border border-[#232933] px-2 py-1 text-[11px] text-[#8B949E]"
                        >
                          Abbruch
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLoeschTeamBestaetigungId(team.id)}
                        aria-label={`Team ${team.name} löschen`}
                        className="rounded p-1.5 text-[#8B949E] hover:bg-[#DC2626]/15 hover:text-[#FCA5A5]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            type="text"
            value={neuesTeamName}
            onChange={(e) => setNeuesTeamName(e.target.value)}
            placeholder="Neuer Teamname (z. B. Munich Stallions Ladies)"
            className="rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none sm:col-span-2"
          />
          <input
            type="text"
            value={neuesTeamSaison}
            onChange={(e) => setNeuesTeamSaison(e.target.value)}
            placeholder="Saison (2026)"
            className="rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleTeamAnlegen}
            className="inline-flex items-center justify-center gap-1.5 rounded bg-[#F59E0B] px-3 py-1.5 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Team anlegen
          </button>
        </div>
      </section>

      {/* 3. Globale Benutzer & Rollen */}
      <section
        id="sys-benutzer"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-[#232933] pb-3">
          <UserPlus className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-white">
              Globale Benutzer &amp; Rollen ({benutzerListe.length})
            </h2>
            <p className="text-[11px] text-[#8B949E]">
              Benutzerkonten anlegen, Sysadmin-Rechte vergeben oder Konten vollständig löschen.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#232933] text-[#8B949E]">
                <th className="py-2 pr-3 font-medium">Benutzer</th>
                <th className="py-2 pr-3 font-medium">Teams &amp; Rollen</th>
                <th className="py-2 pr-3 font-medium">Sysadmin</th>
                <th className="py-2 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232933]">
              {benutzerListe.map((user) => {
                const userTeams = mitgliedschaften
                  .filter((m) => m.userUuid === user.uuid)
                  .map((m) => {
                    const t = teams.find((team) => team.id === m.teamId);
                    return `${t?.kurzname ?? m.teamId}: ${TEAM_ROLLEN_LABELS[m.rolle]}`;
                  });

                return (
                  <tr key={user.uuid}>
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-[#E6EDF3]">
                        {user.vollerName}{' '}
                        <span className="font-mono text-[11px] text-[#6E7681]">
                          @{user.benutzername}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#8B949E]">{user.email}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-[#8B949E]">
                      {userTeams.length > 0 ? userTeams.join(' · ') : 'Kein Team (nur Instanz)'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[#E6EDF3]">
                        <input
                          type="checkbox"
                          checked={user.istSysadmin}
                          onChange={() => onBenutzerSysadminToggle(user.uuid)}
                          className="h-3.5 w-3.5 accent-[#F59E0B]"
                        />
                        <span>{user.istSysadmin ? 'Ja' : 'Nein'}</span>
                      </label>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        disabled={benutzerListe.length <= 1}
                        onClick={() => onBenutzerLoeschen(user.uuid)}
                        className="rounded border border-[#232933] bg-[#0B0E11] px-2.5 py-1 text-[11px] text-[#8B949E] hover:border-[#DC2626]/50 hover:text-[#FCA5A5] disabled:opacity-40"
                      >
                        Konto löschen
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-2 rounded-md border border-[#232933] bg-[#0B0E11] p-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <input
            type="text"
            value={neuName}
            onChange={(e) => setNeuName(e.target.value)}
            placeholder="Voller Name"
            className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1.5 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
          />
          <input
            type="text"
            value={neuUsername}
            onChange={(e) => setNeuUsername(e.target.value)}
            placeholder="Benutzername (optional)"
            className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1.5 font-mono text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
          />
          <input
            type="email"
            value={neuEmail}
            onChange={(e) => setNeuEmail(e.target.value)}
            placeholder="E-Mail-Adresse"
            className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1.5 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
          />
          <select
            value={neuTeamId}
            onChange={(e) => setNeuTeamId(e.target.value)}
            className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1.5 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
          >
            <option value="">Kein Team (nur Instanz)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                Team: {t.name}
              </option>
            ))}
          </select>
          <select
            disabled={!neuTeamId}
            value={neuTeamRolle}
            onChange={(e) => setNeuTeamRolle(e.target.value as TeamRolle)}
            className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1.5 text-xs text-white disabled:opacity-40 focus:border-[#F59E0B] focus:outline-none"
          >
            <option value="TEAM_ADMIN">Rolle: Team Admin</option>
            <option value="COACH">Rolle: Coach</option>
            <option value="PLAYER">Rolle: Spieler</option>
          </select>
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[#E6EDF3]">
              <input
                type="checkbox"
                checked={neuIstSysadmin}
                onChange={(e) => setNeuIstSysadmin(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#F59E0B]"
              />
              <span>Sysadmin</span>
            </label>
            <button
              type="button"
              onClick={handleBenutzerAnlegen}
              className="rounded bg-[#F59E0B] px-3 py-1.5 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24]"
            >
              Anlegen
            </button>
          </div>
        </div>
      </section>

      {/* 4. S3 Object Storage */}
      <section
        id="sys-storage"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-[#232933] pb-3">
          <HardDrive className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-white">S3 Object Storage</h2>
            <p className="text-[11px] text-[#8B949E]">
              Kompatibel mit MinIO, Hetzner Object Storage, Ceph und AWS S3. Secrets werden primär
              über ENV-Variablen injiziert.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Endpoint URL</span>
            <input
              type="url"
              value={s3Form.endpoint}
              onChange={(e) => setS3Form((alt) => ({ ...alt, endpoint: e.target.value }))}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Bucket-Name</span>
            <input
              type="text"
              value={s3Form.bucket}
              onChange={(e) => setS3Form((alt) => ({ ...alt, bucket: e.target.value }))}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Region</span>
            <input
              type="text"
              value={s3Form.region}
              onChange={(e) => setS3Form((alt) => ({ ...alt, region: e.target.value }))}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Access Key ID</span>
            <input
              type="text"
              value={s3Form.accessKey}
              onChange={(e) => setS3Form((alt) => ({ ...alt, accessKey: e.target.value }))}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#E6EDF3]">
            <input
              type="checkbox"
              checked={s3Form.forcePathStyle}
              onChange={(e) => setS3Form((alt) => ({ ...alt, forcePathStyle: e.target.checked }))}
              className="h-3.5 w-3.5 accent-[#F59E0B]"
            />
            <span>Force Path-Style (empfohlen für MinIO / Self-Hosted S3)</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setS3Status(`Verbindung zu ${s3Form.bucket} (${s3Form.region}) im Prototyp OK.`);
                setTimeout(() => setS3Status(null), 2600);
              }}
              className="rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-[#E6EDF3] hover:border-[#F59E0B]"
            >
              Verbindung testen
            </button>
            <button
              type="button"
              onClick={() => {
                onS3Speichern(s3Form);
                setS3Status('S3-Konfiguration gespeichert.');
                setTimeout(() => setS3Status(null), 2200);
              }}
              className="rounded bg-[#F59E0B] px-3 py-1.5 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24]"
            >
              Speichern
            </button>
          </div>
        </div>
        {s3Status && <p className="text-xs text-[#86EFAC]">{s3Status}</p>}
      </section>

      {/* 5. E-Mail / SMTP */}
      <section
        id="sys-smtp"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-[#232933] pb-3">
          <Mail className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-white">E-Mail / SMTP</h2>
            <p className="text-[11px] text-[#8B949E]">
              Versand von Team-Einladungen und Passwort-Zurücksetzungen.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs text-[#8B949E] sm:col-span-2">
            <span>SMTP-Host</span>
            <input
              type="text"
              value={smtpForm.host}
              onChange={(e) => setSmtpForm((alt) => ({ ...alt, host: e.target.value }))}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Port</span>
            <input
              type="number"
              value={smtpForm.port}
              onChange={(e) =>
                setSmtpForm((alt) => ({ ...alt, port: Number(e.target.value) || 587 }))
              }
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Benutzer</span>
            <input
              type="text"
              value={smtpForm.benutzer}
              onChange={(e) => setSmtpForm((alt) => ({ ...alt, benutzer: e.target.value }))}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-[#8B949E] sm:col-span-2">
            <span>Absender (From)</span>
            <input
              type="text"
              value={smtpForm.absender}
              onChange={(e) => setSmtpForm((alt) => ({ ...alt, absender: e.target.value }))}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#E6EDF3]">
            <input
              type="checkbox"
              checked={smtpForm.tlsAktiv}
              onChange={(e) => setSmtpForm((alt) => ({ ...alt, tlsAktiv: e.target.checked }))}
              className="h-3.5 w-3.5 accent-[#F59E0B]"
            />
            <span>STARTTLS / TLS erzwingen</span>
          </label>

          <button
            type="button"
            onClick={() => {
              onSmtpSpeichern(smtpForm);
              setSmtpStatus('SMTP-Konfiguration gespeichert.');
              setTimeout(() => setSmtpStatus(null), 2200);
            }}
            className="rounded bg-[#F59E0B] px-3 py-1.5 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24]"
          >
            SMTP speichern
          </button>
        </div>
        {smtpStatus && <p className="text-xs text-[#86EFAC]">{smtpStatus}</p>}
      </section>

      {/* 6. ENV-Ersteinrichtung (kein UI-Wizard) */}
      <section
        id="sys-bootstrap"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-3"
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-white">
            Deployment-unabhängige Ersteinrichtung (.env)
          </h2>
        </div>
        <p className="text-xs leading-relaxed text-[#8B949E]">
          SidelineOS verzichtet bewusst auf einen unsicheren Erststart-Wizard im Browser. Der erste
          Sysadmin, Datenbank, S3, SMTP und die installierten Module werden einheitlich über
          Umgebungsvariablen (Docker Compose, Kubernetes, Proxmox LXC oder Systemd) gesetzt.
        </p>
        <pre className="overflow-x-auto rounded-md border border-[#232933] bg-[#0B0E11] p-3 font-mono text-[11px] leading-relaxed text-[#E6EDF3]">
{`INITIAL_SYSADMIN_EMAIL="admin@verein.example"
INITIAL_SYSADMIN_USERNAME="sysadmin"
INITIAL_SYSADMIN_PASSWORD="<starkes-passwort>"
ENABLED_MODULES="${globalAktivierteModule.join(',')}"`}
        </pre>
      </section>

      {/* 7. Dynamischer Modul-Beitrag: Videoanalyse S3-Cleanup-Queue */}
      {videoGlobalAktiv && (
        <section
          id="modul-video-cleanup"
          className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#232933] pb-4">
            <div className="flex items-center gap-2.5">
              <HardDrive className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-white">
                  S3-Cleanup-Queue (Modul: Videoanalyse · ref_count = 0)
                </h2>
                <p className="text-xs text-[#8B949E]">
                  Verwaiste Video-Assets bleiben bis zum Ablauf der Schonfrist wiederherstellbar.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[#8B949E]">
                Schonfrist (Tage)
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={retentionTage}
                  onChange={(e) => setRetentionTage(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 font-mono text-xs text-white tabular-nums focus:border-[#F59E0B] focus:outline-none"
                />
              </label>

              <button
                type="button"
                disabled={queue.length === 0}
                onClick={() => {
                  const anzahl = queue.length;
                  if (anzahl === 0) return;
                  setQueue([]);
                  setCleanupStatus(
                    `${anzahl} vorgemerkte S3-Assets wurden sofort aus dem Bucket bereinigt.`
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DC2626]/40 bg-[#DC2626]/10 px-3 py-1.5 text-xs font-medium text-[#FCA5A5] transition-colors hover:bg-[#DC2626]/20 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Cleanup jetzt ausführen
              </button>
            </div>
          </div>

          {cleanupStatus && (
            <div
              role="status"
              className="rounded-md border border-[#16A34A]/30 bg-[#16A34A]/10 px-3 py-2 text-xs text-[#86EFAC]"
            >
              {cleanupStatus}
            </div>
          )}

          {queue.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8B949E]">
              Keine verwaisten S3-Objekte in der Löschwarteschlange.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#232933] text-[#8B949E]">
                    <th className="py-2 font-medium">Anonymisierter S3-Pfad</th>
                    <th className="py-2 text-right font-medium">Größe</th>
                    <th className="py-2 text-right font-medium">Löschung am</th>
                    <th className="py-2 text-right font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232933]">
                  {queue.map((eintrag) => (
                    <tr key={eintrag.id} className="hover:bg-[#191F27]">
                      <td className="py-3 font-mono text-[#E6EDF3]">{eintrag.assetPfad}</td>
                      <td className="py-3 text-right font-mono text-[#E6EDF3] tabular-nums">
                        {eintrag.groesseGb.toFixed(1)} GB
                      </td>
                      <td className="py-3 text-right font-mono text-[#8B949E] tabular-nums">
                        {eintrag.geplanteLoeschung} ({eintrag.restTage} T.)
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setQueue((alt) => alt.filter((item) => item.id !== eintrag.id));
                            setCleanupStatus(
                              'Löschung zurückgenommen – Asset-Referenz wurde wiederhergestellt.'
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded border border-[#232933] bg-[#0B0E11] px-2.5 py-1 text-xs font-medium text-[#E6EDF3] transition-colors hover:border-[#F59E0B] hover:text-white"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          Wiederherstellen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </SettingsShell>
  );
}
