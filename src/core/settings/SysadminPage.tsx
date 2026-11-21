import { useState } from 'react';
import {
  Blocks,
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  HardDrive,
  Mail,
  Plus,
  ShieldAlert,
  Store,
  Terminal,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type {
  BenutzerKonto,
  PluginId,
  S3Konfiguration,
  SmtpKonfiguration,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from '../../shared/types.ts';
import { TEAM_ROLLEN_LABELS } from '../../shared/types.ts';
import {
  PERMISSION_BESCHREIBUNGEN,
  type PluginSettingsKontext,
  type PluginStoreEintrag,
  type SidelinePlugin,
} from '../../sdk/plugin.ts';
import { parseGitHubPluginQuelle } from '../pluginRegistry.ts';
import { SettingsShell, type SettingsKategorie } from '../layout/SettingsShell.tsx';

interface SysadminPageProps {
  storeKatalog: PluginStoreEintrag[];
  installiertePlugins: SidelinePlugin[];
  installiertePluginIds: PluginId[];
  globalAktivierteModule: PluginId[];
  teams: TeamKontext[];
  benutzerListe: BenutzerKonto[];
  mitgliedschaften: TeamMitgliedschaft[];
  s3Konfig: S3Konfiguration;
  smtpKonfig: SmtpKonfiguration;
  onPluginInstallieren: (pluginId: PluginId) => void;
  onPluginDeinstallieren: (pluginId: PluginId) => void;
  onCustomGitHubPluginHinzufuegen: (repoUrl: string, slug: string) => void;
  onGlobalModulToggle: (modulId: PluginId) => void;
  onTeamModulToggle: (teamId: string, modulId: PluginId) => void;
  onTeamErstellen: (team: TeamKontext) => void;
  onTeamLoeschen: (teamId: string) => void;
  onBenutzerErstellen: (
    benutzer: BenutzerKonto,
    teamZuweisung?: { teamId: string; rolle: TeamRolle }
  ) => void;
  onBenutzerSysadminToggle: (userUuid: string) => void;
  onBenutzerLoeschen: (userUuid: string) => void;
  onS3Speichern: (neu: S3Konfiguration) => void;
  onSmtpSpeichern: (neu: SmtpKonfiguration) => void;
  onZurueck?: () => void;
}

export function SysadminPage({
  storeKatalog,
  installiertePlugins,
  installiertePluginIds,
  globalAktivierteModule,
  teams,
  benutzerListe,
  mitgliedschaften,
  s3Konfig,
  smtpKonfig,
  onPluginInstallieren,
  onPluginDeinstallieren,
  onCustomGitHubPluginHinzufuegen,
  onGlobalModulToggle,
  onTeamModulToggle,
  onTeamErstellen,
  onTeamLoeschen,
  onBenutzerErstellen,
  onBenutzerSysadminToggle,
  onBenutzerLoeschen,
  onS3Speichern,
  onSmtpSpeichern,
  onZurueck,
}: SysadminPageProps) {
  // Plugin Store (Custom GitHub-Repo)
  const [githubUrl, setGithubUrl] = useState('');
  const [storeFehler, setStoreFehler] = useState<string | null>(null);
  const [storeHinweis, setStoreHinweis] = useState<string | null>(null);

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

  const globalAktivePlugins = installiertePlugins.filter((p) =>
    globalAktivierteModule.includes(p.manifest.id)
  );
  const pluginsMitSysadminPanel = globalAktivePlugins.filter((p) =>
    Boolean(p.settingsPanels?.sysadmin)
  );

  const kategorien: SettingsKategorie[] = [
    {
      id: 'sys-store',
      label: 'Plugin Store (GitHub)',
      gruppe: 'Erweiterungen',
      badge: storeKatalog.length,
    },
    { id: 'sys-module', label: 'Team-Freigabe-Matrix', gruppe: 'Erweiterungen' },
    { id: 'sys-teams', label: 'Teams / Mandanten', gruppe: 'Instanz-Verwaltung' },
    { id: 'sys-benutzer', label: 'Globale Benutzer & Rollen', gruppe: 'Instanz-Verwaltung' },
    { id: 'sys-storage', label: 'S3 Object Storage', gruppe: 'Infrastruktur' },
    { id: 'sys-smtp', label: 'E-Mail / SMTP', gruppe: 'Infrastruktur' },
    { id: 'sys-bootstrap', label: 'ENV-Ersteinrichtung', gruppe: 'Infrastruktur' },
  ];

  for (const plugin of pluginsMitSysadminPanel) {
    for (const anker of plugin.manifest.settingsAnker.sysadmin ?? []) {
      kategorien.push({
        id: anker.id,
        label: anker.label,
        gruppe: `Plugin: ${plugin.manifest.name}`,
        badge: anker.badge,
      });
    }
  }

  const handleGitHubPluginEinbinden = () => {
    setStoreFehler(null);
    setStoreHinweis(null);
    const pruefung = parseGitHubPluginQuelle(githubUrl);
    if (!pruefung.ok || !pruefung.repoUrl || !pruefung.slug) {
      setStoreFehler(pruefung.fehler ?? 'Ungültige GitHub-URL.');
      return;
    }
    if (storeKatalog.some((e) => e.manifest.id === pruefung.slug)) {
      setStoreFehler(`Ein Plugin mit ID "${pruefung.slug}" ist bereits im Store vorhanden.`);
      return;
    }
    onCustomGitHubPluginHinzufuegen(pruefung.repoUrl, pruefung.slug);
    setGithubUrl('');
    setStoreHinweis(`GitHub-Plugin "${pruefung.slug}" installiert und im Store registriert.`);
    setTimeout(() => setStoreHinweis(null), 3000);
  };

  const handleTeamAnlegen = () => {
    const name = neuesTeamName.trim();
    if (!name) return;
    const startSaison = neuesTeamSaison.trim() || '2026';
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    onTeamErstellen({
      id: `team-${slug || Date.now()}`,
      name,
      aktiveSaison: startSaison,
      saisons: [startSaison],
      kurzname: neuesTeamKurz.trim() || name.slice(0, 12),
      primaerFarbe: '#F59E0B',
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

  const settingsKontext: PluginSettingsKontext = {
    team: teams[0],
    benutzer: benutzerListe[0],
    aktiveTeamAnsicht: null,
    s3Konfig,
  };

  return (
    <SettingsShell
      titel="Sysadmin · Instanz-Administration"
      untertitel="SidelineOS Core verwaltet ausschließlich Auth, Mandanten, S3/SMTP und den Plugin Store. Alle Fachmodule laufen isoliert als installierbare GitHub-Plugins."
      kategorien={kategorien}
      zurueckLabel="Alle Einstellungen"
      onZurueck={onZurueck}
      kopfAktion={
        <div className="inline-flex items-center gap-1.5 rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-[#8B949E]">
          <ShieldAlert className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
          Kein Team-Inhaltszugriff
        </div>
      }
    >
      {/* 1. Plugin Store (GitHub-Repositories) */}
      <section
        id="sys-store"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232933] pb-3">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                Plugin Store · Unabhängige GitHub-Module
              </h2>
              <p className="text-[11px] text-[#8B949E]">
                Jedes Plugin wird in einem eigenen Repo gegen{' '}
                <code className="font-mono text-[#E6EDF3]">@sidelineos/plugin-sdk</code> entwickelt
                und mit isoliertem DB-/S3-Präfix geladen.
              </p>
            </div>
          </div>

          <span className="font-mono text-[11px] text-[#8B949E]">
            {installiertePlugins.length} installiert · SDK v1.0
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {storeKatalog.map((eintrag) => {
            const { manifest } = eintrag;
            const installiert = installiertePluginIds.includes(manifest.id);
            const globalAn = globalAktivierteModule.includes(manifest.id);

            return (
              <div
                key={manifest.id}
                className={`flex flex-col justify-between rounded-md border p-4 space-y-3 ${
                  installiert
                    ? 'border-[#F59E0B]/40 bg-[#0B0E11]'
                    : 'border-[#232933] bg-[#0B0E11]/60'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{manifest.name}</div>
                      <div className="font-mono text-[10px] text-[#8B949E]">
                        {manifest.id} · {eintrag.releaseTag}
                      </div>
                    </div>
                    {eintrag.verifiziert ? (
                      <span className="inline-flex items-center gap-1 rounded border border-[#16A34A]/40 bg-[#16A34A]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#86EFAC]">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Offiziell
                      </span>
                    ) : (
                      <span className="rounded border border-[#232933] px-1.5 py-0.5 font-mono text-[10px] text-[#8B949E]">
                        GitHub
                      </span>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed text-[#8B949E]">
                    {manifest.kurzbeschreibung}
                  </p>

                  <div className="space-y-1 border-t border-[#232933] pt-2 font-mono text-[10px] text-[#6E7681]">
                    <div>DB: {manifest.dbPrefix}*</div>
                    {manifest.s3Prefix && <div>S3: teams/&#123;id&#125;/{manifest.s3Prefix}</div>}
                    <div
                      title={manifest.permissions
                        .map((p) => `${p}: ${PERMISSION_BESCHREIBUNGEN[p]}`)
                        .join('\n')}
                    >
                      Rechte: {manifest.permissions.join(', ')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-[#232933] pt-3">
                  <a
                    href={manifest.repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-[#8B949E] hover:text-white"
                  >
                    Repo
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>

                  {installiert ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onGlobalModulToggle(manifest.id)}
                        className={`rounded border px-2 py-1 text-[11px] font-medium ${
                          globalAn
                            ? 'border-[#16A34A]/40 bg-[#16A34A]/10 text-[#86EFAC]'
                            : 'border-[#232933] bg-[#13171D] text-[#8B949E]'
                        }`}
                      >
                        {globalAn ? 'Aktiv' : 'Pausiert'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onPluginDeinstallieren(manifest.id)}
                        className="rounded border border-[#232933] bg-[#13171D] px-2 py-1 text-[11px] text-[#8B949E] hover:border-[#DC2626]/50 hover:text-[#FCA5A5]"
                      >
                        Entfernen
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPluginInstallieren(manifest.id)}
                      className="inline-flex items-center gap-1 rounded bg-[#F59E0B] px-2.5 py-1 text-[11px] font-semibold text-[#0B0E11] hover:bg-[#FBBF24]"
                    >
                      <Download className="h-3 w-3" aria-hidden="true" />
                      Installieren
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Externes GitHub-Plugin per URL einbinden */}
        <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-4 space-y-2.5">
          <div className="text-xs font-semibold text-white">
            Drittanbieter- oder eigenes GitHub-Plugin hinzufügen
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/dein-verein/sidelineos-plugin-scouting"
              className="flex-1 rounded border border-[#232933] bg-[#13171D] px-3 py-1.5 font-mono text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleGitHubPluginEinbinden}
              className="inline-flex items-center justify-center gap-1.5 rounded bg-[#1E2530] px-3.5 py-1.5 text-xs font-medium text-white hover:border hover:border-[#F59E0B]"
            >
              <Plus className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
              Aus GitHub installieren
            </button>
          </div>
          {storeFehler && <p className="text-xs text-[#FCA5A5]">{storeFehler}</p>}
          {storeHinweis && <p className="text-xs text-[#86EFAC]">{storeHinweis}</p>}
        </div>
      </section>

      {/* 2. Team-sortierte Freigabe-Matrix */}
      <section
        id="sys-module"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232933] pb-3">
          <div className="flex items-center gap-2">
            <Blocks className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                Modul-Freigabe (nach Team sortiert)
              </h2>
              <p className="text-[11px] text-[#8B949E]">
                Nicht installierte oder für ein Team deaktivierte Plugins verschwinden vollständig
                auf der Startseite und in den Einstellungen.
              </p>
            </div>
          </div>

          <code className="rounded border border-[#232933] bg-[#0B0E11] px-2.5 py-1 font-mono text-[11px] text-[#E6EDF3]">
            ENABLED_MODULES=&quot;{globalAktivierteModule.join(',')}&quot;
          </code>
        </div>

        {globalAktivePlugins.length === 0 ? (
          <div className="rounded-md border border-[#232933] bg-[#0B0E11] px-4 py-5 text-center text-xs text-[#6E7681]">
            Aktuell ist kein installiertes Plugin instanzweit aktiviert.
          </div>
        ) : (
          <div className="divide-y divide-[#232933] rounded-md border border-[#232933] bg-[#0B0E11]">
            {teams.map((team) => {
              const aktivAnzahl = globalAktivePlugins.filter((p) =>
                team.aktivierteModule.includes(p.manifest.id)
              ).length;

              return (
                <div
                  key={team.id}
                  className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{team.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-[#8B949E]">
                      Aktuelle Saison {team.aktiveSaison} · {aktivAnzahl}/
                      {globalAktivePlugins.length} Module aktiv
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {globalAktivePlugins.map((plugin) => {
                      const teamAktiv = team.aktivierteModule.includes(plugin.manifest.id);
                      return (
                        <label
                          key={plugin.manifest.id}
                          className={`inline-flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-xs transition-colors ${
                            teamAktiv
                              ? 'border-[#232933] bg-[#13171D] text-[#E6EDF3]'
                              : 'border-[#232933]/60 bg-transparent text-[#6E7681]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={teamAktiv}
                            onChange={() => onTeamModulToggle(team.id, plugin.manifest.id)}
                            className="h-3.5 w-3.5 accent-[#F59E0B]"
                          />
                          <span>{plugin.manifest.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Teams / Mandanten */}
      <section
        id="sys-teams"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-[#232933] pb-3">
          <Building2 className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-white">Teams / Mandanten ({teams.length})</h2>
            <p className="text-[11px] text-[#8B949E]">
              Teams bleiben dauerhaft über Saisons hinweg bestehen. Neue Spielzeiten startet der
              jeweilige Team Admin direkt im Team, alte Saisons bleiben abrufbar.
            </p>
          </div>
        </div>

        <div className="divide-y divide-[#232933] rounded-md border border-[#232933] bg-[#0B0E11]">
          {teams.map((team) => {
            const mitgliederZahl = mitgliedschaften.filter(
              (m) => m.teamId === team.id && m.status === 'AKTIV'
            ).length;
            const alteSaisons = team.saisons.filter((s) => s !== team.aktiveSaison);
            const fragtLoeschung = loeschTeamBestaetigungId === team.id;

            return (
              <div
                key={team.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
              >
                <div>
                  <div className="font-medium text-white">
                    {team.name}{' '}
                    <span className="font-mono text-[#F59E0B]">· Saison {team.aktiveSaison}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#8B949E]">
                    {mitgliederZahl} aktive Mitglieder · {team.aktivierteModule.length} Plugins
                    {alteSaisons.length > 0 && ` · Archivierte Saisons: ${alteSaisons.join(', ')}`}
                  </div>
                </div>

                <div className="flex items-center gap-2">
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

      {/* 4. Globale Benutzer & Rollen */}
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

      {/* 5. S3 Object Storage */}
      <section
        id="sys-storage"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-[#232933] pb-3">
          <HardDrive className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-white">S3 Object Storage</h2>
            <p className="text-[11px] text-[#8B949E]">
              Kompatibel mit MinIO, Hetzner Object Storage, Ceph und AWS S3. Plugins erhalten
              ausschließlich zeitlich signierte Presigned-URLs auf ihren S3-Präfix.
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

      {/* 6. E-Mail / SMTP */}
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

      {/* 7. ENV-Ersteinrichtung */}
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
          Sysadmin, Datenbank, S3, SMTP und die installierten Plugins werden einheitlich über
          Umgebungsvariablen (Docker Compose, Kubernetes, Proxmox LXC oder Systemd) gesetzt.
        </p>
        <pre className="overflow-x-auto rounded-md border border-[#232933] bg-[#0B0E11] p-3 font-mono text-[11px] leading-relaxed text-[#E6EDF3]">
{`INITIAL_SYSADMIN_EMAIL="admin@verein.example"
INITIAL_SYSADMIN_USERNAME="sysadmin"
INITIAL_SYSADMIN_PASSWORD="<starkes-passwort>"
ENABLED_MODULES="${globalAktivierteModule.join(',')}"`}
        </pre>
      </section>

      {/* 8. Dynamische Sysadmin-Panels aller aktivierten Plugins */}
      {pluginsMitSysadminPanel.map((plugin) => {
        const SysadminPanel = plugin.settingsPanels!.sysadmin!;
        return <SysadminPanel key={plugin.manifest.id} ctx={settingsKontext} />;
      })}
    </SettingsShell>
  );
}
