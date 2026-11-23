import { useEffect, useState } from 'react';
import {
  ArrowUpCircle,
  Blocks,
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  GitBranch,
  HardDrive,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Store,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import type {
  CoreApiError as _CoreApiError,
  S3CleanupStatistikDTO,
  SysadminCapabilitiesDTO,
  SysadminPluginStatusDTO,
  UpdatePruefErgebnisDTO,
} from '../apiClient.ts';
import type {
  BenutzerKonto,
  PluginId,
  S3Konfiguration,
  SmtpKonfiguration,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from '../../shared/types.ts';
import { holeRollenLabel } from '../../shared/types.ts';
import {
  holePermissionBeschreibung,
  type PluginSettingsKontext,
  type PluginStoreEintrag,
  type SidelinePlugin,
} from '../../sdk/plugin.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { parseGitHubPluginQuelle } from '../pluginRegistry.ts';
import { SettingsShell, type SettingsKategorie } from '../layout/SettingsShell.tsx';

import type { ApiAktionErgebnis } from './UserSettingsPage.tsx';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const einheiten = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(einheiten.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const wert = bytes / 1024 ** idx;
  return `${wert >= 10 || idx === 0 ? wert.toFixed(0) : wert.toFixed(1)} ${einheiten[idx]}`;
}

function dateiAlsBase64Lesen(datei: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const ergebnis = typeof reader.result === 'string' ? reader.result : '';
      const kommaIdx = ergebnis.indexOf(',');
      resolve(kommaIdx >= 0 ? ergebnis.slice(kommaIdx + 1) : ergebnis);
    };
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(datei);
  });
}

interface SysadminPageProps {
  storeKatalog: PluginStoreEintrag[];
  installiertePlugins: SidelinePlugin[];
  installiertePluginIds: PluginId[];
  globalAktivierteModule: PluginId[];
  installedPluginsMeta?: SysadminPluginStatusDTO[];
  capabilities?: SysadminCapabilitiesDTO;
  updateStatus?: UpdatePruefErgebnisDTO | null;
  cleanupStats?: S3CleanupStatistikDTO | null;
  teams: TeamKontext[];
  benutzerListe: BenutzerKonto[];
  mitgliedschaften: TeamMitgliedschaft[];
  s3Konfig: S3Konfiguration;
  smtpKonfig: SmtpKonfiguration;
  onPluginInstallieren: (pluginId: PluginId) => void;
  onPluginDeinstallieren: (pluginId: PluginId) => void;
  onCustomGitHubPluginHinzufuegen: (repoUrl: string, slug: string) => void;
  onUpdatesPruefen?: () => Promise<ApiAktionErgebnis>;
  onPluginReleaseInstallieren?: (repoUrl: string, tag?: string) => Promise<ApiAktionErgebnis>;
  onPluginUploadInstallieren?: (
    contentBase64: string,
    expectedSha256?: string
  ) => Promise<ApiAktionErgebnis>;
  onPluginDevGitInstallieren?: (repoUrl: string, branch?: string) => Promise<ApiAktionErgebnis>;
  onPluginRollback?: (pluginId: string) => Promise<ApiAktionErgebnis>;
  onPluginBackendDeinstallieren?: (pluginId: string) => Promise<ApiAktionErgebnis>;
  onS3CleanupAusfuehren?: (
    auchVorfristig?: boolean
  ) => Promise<ApiAktionErgebnis & { geloescht?: number }>;
  onGlobalModulToggle: (modulId: PluginId) => Promise<ApiAktionErgebnis> | void;
  onTeamModulToggle: (teamId: string, modulId: PluginId) => Promise<ApiAktionErgebnis>;
  onTeamErstellen: (payload: {
    name: string;
    kurzname: string;
    aktiveSaison: string;
    primaerFarbe?: string;
    aktivierteModule?: PluginId[];
    customProfilFelder?: TeamKontext['customProfilFelder'];
  }) => Promise<ApiAktionErgebnis>;
  onTeamLoeschen: (teamId: string) => Promise<ApiAktionErgebnis>;
  onBenutzerErstellen: (
    payload: {
      vollerName: string;
      benutzername: string;
      email: string;
      passwort: string;
      istSysadmin: boolean;
    },
    teamZuweisung?: { teamId: string; rolle: TeamRolle }
  ) => Promise<ApiAktionErgebnis>;
  onBenutzerSysadminToggle: (userUuid: string) => Promise<ApiAktionErgebnis>;
  onBenutzerLoeschen: (userUuid: string) => Promise<ApiAktionErgebnis>;
  onS3Speichern: (neu: S3Konfiguration & { secretKey?: string }) => Promise<ApiAktionErgebnis>;
  onS3Testen: (
    kandidat: S3Konfiguration & { secretKey?: string }
  ) => Promise<{ ok: boolean; nachricht: string }>;
  onSmtpSpeichern: (neu: SmtpKonfiguration & { passwort?: string }) => Promise<ApiAktionErgebnis>;
  onSmtpTesten: (
    kandidat: SmtpKonfiguration & { passwort?: string; testEmpfaenger?: string }
  ) => Promise<{ ok: boolean; nachricht: string }>;
  onZurueck?: () => void;
}

export function SysadminPage({
  storeKatalog,
  installiertePlugins,
  installiertePluginIds,
  globalAktivierteModule,
  installedPluginsMeta = [],
  capabilities,
  updateStatus = null,
  cleanupStats = null,
  teams,
  benutzerListe,
  mitgliedschaften,
  s3Konfig,
  smtpKonfig,
  onPluginInstallieren,
  onPluginDeinstallieren,
  onCustomGitHubPluginHinzufuegen,
  onUpdatesPruefen,
  onPluginReleaseInstallieren,
  onPluginUploadInstallieren,
  onPluginDevGitInstallieren,
  onPluginRollback,
  onPluginBackendDeinstallieren,
  onS3CleanupAusfuehren,
  onGlobalModulToggle,
  onTeamModulToggle,
  onTeamErstellen,
  onTeamLoeschen,
  onBenutzerErstellen,
  onBenutzerSysadminToggle,
  onBenutzerLoeschen,
  onS3Speichern,
  onS3Testen,
  onSmtpSpeichern,
  onSmtpTesten,
  onZurueck,
}: SysadminPageProps) {
  const { locale, brand, t } = useI18n();
  // Plugin Store & Installer-Modi
  const [installModus, setInstallModus] = useState<'release' | 'upload' | 'dev-git'>('release');
  const [githubUrl, setGithubUrl] = useState('');
  const [releaseTag, setReleaseTag] = useState('');
  const [devBranch, setDevBranch] = useState('');
  const [uploadDatei, setUploadDatei] = useState<File | null>(null);
  const [uploadSha256, setUploadSha256] = useState('');
  const [storeBeschaeftigt, setStoreBeschaeftigt] = useState(false);
  const [updatePruefungLaeuft, setUpdatePruefungLaeuft] = useState(false);
  const [storeFehler, setStoreFehler] = useState<string | null>(null);
  const [storeHinweis, setStoreHinweis] = useState<string | null>(null);
  const [cleanupStatus, setCleanupStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [cleanupBeschaeftigt, setCleanupBeschaeftigt] = useState(false);

  // Neues Team
  const [neuesTeamName, setNeuesTeamName] = useState('');
  const [neuesTeamSaison, setNeuesTeamSaison] = useState('2026');
  const [neuesTeamKurz, setNeuesTeamKurz] = useState('');
  const [loeschTeamBestaetigungId, setLoeschTeamBestaetigungId] = useState<string | null>(null);

  // Neuer Benutzer
  const [neuName, setNeuName] = useState('');
  const [neuUsername, setNeuUsername] = useState('');
  const [neuEmail, setNeuEmail] = useState('');
  const [neuPasswort, setNeuPasswort] = useState('');
  const [neuIstSysadmin, setNeuIstSysadmin] = useState(false);
  const [neuTeamId, setNeuTeamId] = useState<string>(teams[0]?.id ?? '');
  const [neuTeamRolle, setNeuTeamRolle] = useState<TeamRolle>('TEAM_ADMIN');
  const [sysadminFehler, setSysadminFehler] = useState<string | null>(null);

  // S3 & SMTP lokale Formular-Kopien (Secrets werden nie im Klartext zurückgegeben)
  const [s3Form, setS3Form] = useState<S3Konfiguration>(s3Konfig);
  const [s3SecretEingabe, setS3SecretEingabe] = useState('');
  const [s3Status, setS3Status] = useState<{ ok: boolean; text: string } | null>(null);
  const [s3Beschaeftigt, setS3Beschaeftigt] = useState(false);

  const [smtpForm, setSmtpForm] = useState<SmtpKonfiguration>(smtpKonfig);
  const [smtpPasswortEingabe, setSmtpPasswortEingabe] = useState('');
  const [smtpTestEmpfaenger, setSmtpTestEmpfaenger] = useState('');
  const [smtpStatus, setSmtpStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [smtpBeschaeftigt, setSmtpBeschaeftigt] = useState(false);

  useEffect(() => {
    setS3Form(s3Konfig);
  }, [s3Konfig]);

  useEffect(() => {
    setSmtpForm(smtpKonfig);
  }, [smtpKonfig]);

  const globalAktivePlugins = installiertePlugins.filter((p) =>
    globalAktivierteModule.includes(p.manifest.id)
  );
  const pluginsMitSysadminPanel = globalAktivePlugins.filter((p) =>
    Boolean(p.settingsPanels?.sysadmin)
  );

  const verfuegbareUpdatesAnzahl = updateStatus?.anzahlVerfuegbar ?? 0;

  // Backend-installierte Plugins (z. B. Offline-Upload/Dev-Git) nahtlos in Katalogansicht einbinden
  const vollstaendigerKatalog: PluginStoreEintrag[] = [
    ...storeKatalog,
    ...installedPluginsMeta
      .filter((meta) => !storeKatalog.some((k) => k.manifest.id === meta.manifest.id))
      .map(
        (meta): PluginStoreEintrag => ({
          manifest: meta.manifest,
          quelle: meta.source === 'OFFICIAL_CATALOG' ? 'OFFICIAL_GITHUB' : 'CUSTOM_GITHUB',
          verifiziert: meta.installMode === 'RELEASE_BUNDLE',
          releaseTag: meta.releaseTag || `v${meta.manifest.version}`,
          paketFormat: 'sideline-plugin-v1',
        })
      ),
  ];

  const kategorien: SettingsKategorie[] = [
    {
      id: 'sys-store',
      label: 'Plugin Store (GitHub)',
      gruppe: 'Erweiterungen',
      badge: verfuegbareUpdatesAnzahl > 0 ? verfuegbareUpdatesAnzahl : vollstaendigerKatalog.length,
    },
    { id: 'sys-module', label: 'Team-Freigabe-Matrix', gruppe: 'Erweiterungen' },
    { id: 'sys-teams', label: 'Teams / Mandanten', gruppe: 'Instanz-Verwaltung' },
    { id: 'sys-benutzer', label: 'Globale Benutzer & Rollen', gruppe: 'Instanz-Verwaltung' },
    { id: 'sys-storage', label: 'S3 Object Storage', gruppe: 'Infrastruktur' },
    { id: 'sys-smtp', label: 'E-Mail / SMTP', gruppe: 'Infrastruktur' },
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

  const zeigeStoreHinweis = (text: string) => {
    setStoreHinweis(text);
    setTimeout(() => setStoreHinweis(null), 4500);
  };

  const handleUpdatesPruefenKlick = async () => {
    if (!onUpdatesPruefen) return;
    setStoreFehler(null);
    setUpdatePruefungLaeuft(true);
    const res = await onUpdatesPruefen();
    setUpdatePruefungLaeuft(false);
    if (!res.ok) {
      setStoreFehler(res.fehler ?? 'Update-Prüfung fehlgeschlagen.');
    } else {
      zeigeStoreHinweis('Update-Status aktualisiert.');
    }
  };

  const handleReleaseInstallieren = async () => {
    setStoreFehler(null);
    setStoreHinweis(null);
    const pruefung = parseGitHubPluginQuelle(githubUrl);
    if (!pruefung.ok || !pruefung.repoUrl || !pruefung.slug) {
      setStoreFehler(pruefung.fehler ?? 'Ungültige GitHub-URL.');
      return;
    }

    if (onPluginReleaseInstallieren) {
      setStoreBeschaeftigt(true);
      const res = await onPluginReleaseInstallieren(
        pruefung.repoUrl,
        releaseTag.trim() || undefined
      );
      setStoreBeschaeftigt(false);
      if (!res.ok) {
        setStoreFehler(res.fehler ?? 'Release-Installation fehlgeschlagen.');
        return;
      }
      setGithubUrl('');
      setReleaseTag('');
      zeigeStoreHinweis(`Release-Bundle aus "${pruefung.repoUrl}" installiert.`);
      return;
    }

    if (storeKatalog.some((e) => e.manifest.id === pruefung.slug)) {
      setStoreFehler(`Ein Plugin mit ID "${pruefung.slug}" ist bereits im Store vorhanden.`);
      return;
    }
    onCustomGitHubPluginHinzufuegen(pruefung.repoUrl, pruefung.slug);
    setGithubUrl('');
    zeigeStoreHinweis(`GitHub-Plugin "${pruefung.slug}" installiert und im Store registriert.`);
  };

  const handleOfflineUploadInstallieren = async () => {
    setStoreFehler(null);
    setStoreHinweis(null);
    if (!uploadDatei) {
      setStoreFehler('Bitte eine gültige .tar.gz-Paketdatei auswählen.');
      return;
    }
    if (!onPluginUploadInstallieren) {
      setStoreFehler('Offline-Upload erfordert aktives Backend.');
      return;
    }
    setStoreBeschaeftigt(true);
    try {
      const base64 = await dateiAlsBase64Lesen(uploadDatei);
      const res = await onPluginUploadInstallieren(
        base64,
        uploadSha256.trim() || undefined
      );
      if (!res.ok) {
        setStoreFehler(res.fehler ?? 'Upload-Installation fehlgeschlagen.');
      } else {
        setUploadDatei(null);
        setUploadSha256('');
        zeigeStoreHinweis('Offline-Paket geprüft, entpackt und installiert.');
      }
    } catch (err) {
      setStoreFehler(err instanceof Error ? err.message : 'Datei konnte nicht hochgeladen werden.');
    } finally {
      setStoreBeschaeftigt(false);
    }
  };

  const handleDevGitInstallieren = async () => {
    setStoreFehler(null);
    setStoreHinweis(null);
    const pruefung = parseGitHubPluginQuelle(githubUrl);
    if (!pruefung.ok || !pruefung.repoUrl) {
      setStoreFehler(pruefung.fehler ?? 'Ungültige GitHub-URL.');
      return;
    }
    if (!onPluginDevGitInstallieren) {
      setStoreFehler('Dev-Git-Installation erfordert aktives Backend.');
      return;
    }
    setStoreBeschaeftigt(true);
    const res = await onPluginDevGitInstallieren(pruefung.repoUrl, devBranch.trim() || undefined);
    setStoreBeschaeftigt(false);
    if (!res.ok) {
      setStoreFehler(res.fehler ?? 'Dev-Git-Installation fehlgeschlagen.');
      return;
    }
    setGithubUrl('');
    setDevBranch('');
    zeigeStoreHinweis('Dev-Plugin geklont, gebaut und installiert.');
  };

  const fuehreSysAktionAus = async (
    fn: () => Promise<ApiAktionErgebnis> | ApiAktionErgebnis | void,
    erfolgCb?: () => void
  ) => {
    setSysadminFehler(null);
    const res = await fn();
    if (res && !res.ok) {
      setSysadminFehler(res.fehler ?? 'Aktion fehlgeschlagen.');
      return;
    }
    erfolgCb?.();
  };

  const handleTeamAnlegen = async () => {
    const name = neuesTeamName.trim();
    if (!name) return;
    const startSaison = neuesTeamSaison.trim() || '2026';
    await fuehreSysAktionAus(
      () =>
        onTeamErstellen({
          name,
          aktiveSaison: startSaison,
          kurzname: neuesTeamKurz.trim() || name.slice(0, 12),
          primaerFarbe: '#F59E0B',
          aktivierteModule: [...globalAktivierteModule],
          customProfilFelder: [
            { key: 'notfallkontakt', label: 'Notfallkontakt', typ: 'text', pflicht: true },
          ],
        }),
      () => {
        setNeuesTeamName('');
        setNeuesTeamKurz('');
      }
    );
  };

  const handleBenutzerAnlegen = async () => {
    const name = neuName.trim();
    const mail = neuEmail.trim();
    const username = (neuUsername.trim() || mail.split('@')[0] || '').toLowerCase();
    if (!name || !mail.includes('@') || !username) {
      setSysadminFehler('Bitte Name, gültige E-Mail-Adresse und Benutzername eingeben.');
      return;
    }
    if (neuPasswort.length < 10) {
      setSysadminFehler('Das Initialpasswort muss mindestens 10 Zeichen lang sein.');
      return;
    }

    await fuehreSysAktionAus(
      () =>
        onBenutzerErstellen(
          {
            vollerName: name,
            benutzername: username,
            email: mail,
            passwort: neuPasswort,
            istSysadmin: neuIstSysadmin,
          },
          neuTeamId ? { teamId: neuTeamId, rolle: neuTeamRolle } : undefined
        ),
      () => {
        setNeuName('');
        setNeuUsername('');
        setNeuEmail('');
        setNeuPasswort('');
        setNeuIstSysadmin(false);
      }
    );
  };

  const settingsKontext: PluginSettingsKontext | null =
    teams[0] && benutzerListe[0]
      ? {
          team: teams[0],
          benutzer: benutzerListe[0],
          aktiveTeamAnsicht: null,
          s3Konfig,
          locale,
        }
      : null;

  return (
    <SettingsShell
      titel={t('sysadmin.title')}
      untertitel={t('sysadmin.subtitle')}
      kategorien={kategorien}
      zurueckLabel={t('settingsShell.allSettings')}
      onZurueck={onZurueck}
      kopfAktion={
        <div className="flex flex-wrap items-center gap-2">
          {verfuegbareUpdatesAnzahl > 0 && (
            <a
              href="#sys-store"
              className="inline-flex items-center gap-1.5 rounded border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-3 py-1.5 text-xs font-medium text-[#FBBF24] hover:bg-[#F59E0B]/20"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {verfuegbareUpdatesAnzahl === 1
                ? t('sysadmin.updateAvailableBadgeSingular', {
                    count: verfuegbareUpdatesAnzahl,
                  })
                : t('sysadmin.updateAvailableBadgePlural', {
                    count: verfuegbareUpdatesAnzahl,
                  })}
            </a>
          )}
          <div className="inline-flex items-center gap-1.5 rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-[#8B949E]">
            <ShieldAlert className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
            {t('sysadmin.noContentAccess')}
          </div>
        </div>
      }
    >
      {updateStatus?.coreUpdate?.updateVerfuegbar && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-4 py-3 text-xs text-[#FDE68A]"
        >
          <div className="flex items-start gap-2.5">
            <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
            <div>
              <div className="font-semibold text-white">
                {t('sysadmin.coreUpdateTitle', {
                  coreName: brand.coreName,
                  available: updateStatus.coreUpdate.verfuegbar ?? '',
                  current: updateStatus.coreUpdate.aktuell,
                })}
              </div>
              {updateStatus.coreUpdate.hinweis && (
                <p className="mt-0.5 text-[11px] text-[#FDE68A]/90">
                  {updateStatus.coreUpdate.hinweis}
                </p>
              )}
            </div>
          </div>
          {updateStatus.coreUpdate.releaseUrl && (
            <a
              href={updateStatus.coreUpdate.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded border border-[#F59E0B]/50 bg-[#0B0E11] px-2.5 py-1 text-[11px] font-medium text-[#F59E0B] hover:bg-[#13171D]"
            >
              {t('sysadmin.openGithubRelease')}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {sysadminFehler && (
        <div
          role="alert"
          className="rounded-lg border border-[#DC2626]/50 bg-[#DC2626]/10 px-4 py-2.5 text-xs text-[#FCA5A5]"
        >
          {sysadminFehler}
        </div>
      )}
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

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] text-[#8B949E]">
              {installiertePlugins.length} installiert · Core v{capabilities?.coreVersion ?? '0.1.0'}{' '}
              · SDK v{capabilities?.supportedSdkVersion ?? '1.0'}
            </span>
            {onUpdatesPruefen && (
              <button
                type="button"
                disabled={updatePruefungLaeuft || Boolean(capabilities?.disableUpdateCheck)}
                onClick={() => void handleUpdatesPruefenKlick()}
                title={
                  capabilities?.disableUpdateCheck
                    ? 'Update-Check per ENV (DISABLE_UPDATE_CHECK=true) deaktiviert'
                    : 'Jetzt auf Core- & Plugin-Releases prüfen'
                }
                className="inline-flex items-center gap-1.5 rounded border border-[#232933] bg-[#0B0E11] px-2.5 py-1 text-[11px] font-medium text-[#E6EDF3] hover:border-[#F59E0B] disabled:opacity-45"
              >
                <RefreshCw
                  className={`h-3 w-3 ${updatePruefungLaeuft ? 'animate-spin text-[#F59E0B]' : 'text-[#8B949E]'}`}
                  aria-hidden="true"
                />
                {capabilities?.disableUpdateCheck ? 'Update-Check aus' : 'Nach Updates prüfen'}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {vollstaendigerKatalog.map((eintrag) => {
            const { manifest } = eintrag;
            const backendMeta = installedPluginsMeta.find((m) => m.manifest.id === manifest.id);
            const installiert = installiertePluginIds.includes(manifest.id) || Boolean(backendMeta);
            const globalAn = globalAktivierteModule.includes(manifest.id);
            const pluginUpdate = updateStatus?.pluginUpdates.find(
              (u) => u.pluginId === manifest.id
            );
            const angezeigteVersion = backendMeta?.installedVersion ?? eintrag.releaseTag;

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
                        {manifest.id} · {angezeigteVersion}
                        {backendMeta?.installMode && backendMeta.installMode !== 'CATALOG'
                          ? ` · ${
                              backendMeta.installMode === 'DEV_GIT'
                                ? `Dev (${backendMeta.devBranch ?? 'main'})`
                                : backendMeta.installMode === 'OFFLINE_UPLOAD'
                                  ? 'Offline-Paket'
                                  : 'Release'
                            }`
                          : ''}
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

                  {pluginUpdate?.updateVerfuegbar && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1.5 text-[11px] text-[#FDE68A]">
                      <span>
                        Update: v{pluginUpdate.verfuegbar}
                        {!pluginUpdate.sdkKompatibel ? ' (SDK inkompatibel)' : ''}
                      </span>
                      {pluginUpdate.sdkKompatibel &&
                        manifest.repositoryUrl &&
                        onPluginReleaseInstallieren && (
                          <button
                            type="button"
                            disabled={storeBeschaeftigt}
                            onClick={() => {
                              void (async () => {
                                setStoreBeschaeftigt(true);
                                setStoreFehler(null);
                                const res = await onPluginReleaseInstallieren(
                                  manifest.repositoryUrl,
                                  pluginUpdate.releaseTag ?? undefined
                                );
                                setStoreBeschaeftigt(false);
                                if (!res.ok) {
                                  setStoreFehler(
                                    res.fehler ?? `Update für "${manifest.name}" fehlgeschlagen.`
                                  );
                                } else {
                                  zeigeStoreHinweis(
                                    `Plugin "${manifest.name}" auf v${pluginUpdate.verfuegbar} aktualisiert.`
                                  );
                                }
                              })();
                            }}
                            className="rounded bg-[#F59E0B] px-2 py-0.5 text-[10px] font-semibold text-[#0B0E11] hover:bg-[#FBBF24] disabled:opacity-50"
                          >
                            Aktualisieren
                          </button>
                        )}
                    </div>
                  )}

                  <p className="text-xs leading-relaxed text-[#8B949E]">
                    {manifest.kurzbeschreibung}
                  </p>

                  <div className="space-y-1 border-t border-[#232933] pt-2 font-mono text-[10px] text-[#6E7681]">
                    <div>DB: {manifest.dbPrefix}*</div>
                    {manifest.s3Prefix && <div>S3: teams/&#123;id&#125;/{manifest.s3Prefix}</div>}
                    <div
                      title={manifest.permissions
                        .map((p) => `${p}: ${holePermissionBeschreibung(p, locale)}`)
                        .join('\n')}
                    >
                      Rechte: {manifest.permissions.join(', ')}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#232933] pt-3">
                  {manifest.repositoryUrl ? (
                    <a
                      href={manifest.repositoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-[#8B949E] hover:text-white"
                    >
                      Repo
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="font-mono text-[10px] text-[#6E7681]">Lokal</span>
                  )}

                  {installiert ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void fuehreSysAktionAus(() => onGlobalModulToggle(manifest.id))}
                        className={`rounded border px-2 py-1 text-[11px] font-medium ${
                          globalAn
                            ? 'border-[#16A34A]/40 bg-[#16A34A]/10 text-[#86EFAC]'
                            : 'border-[#232933] bg-[#13171D] text-[#8B949E]'
                        }`}
                      >
                        {globalAn ? 'Aktiv' : 'Pausiert'}
                      </button>
                      {backendMeta?.previousVersion && onPluginRollback && (
                        <button
                          type="button"
                          disabled={storeBeschaeftigt}
                          onClick={() => {
                            void (async () => {
                              setStoreBeschaeftigt(true);
                              setStoreFehler(null);
                              const res = await onPluginRollback(manifest.id);
                              setStoreBeschaeftigt(false);
                              if (!res.ok) {
                                setStoreFehler(res.fehler ?? 'Rollback fehlgeschlagen.');
                              } else {
                                zeigeStoreHinweis(
                                  `Rollback auf v${backendMeta.previousVersion} durchgeführt.`
                                );
                              }
                            })();
                          }}
                          className="inline-flex items-center gap-1 rounded border border-[#232933] bg-[#13171D] px-2 py-1 text-[11px] text-[#E6EDF3] hover:border-[#F59E0B] disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3 text-[#F59E0B]" aria-hidden="true" />
                          v{backendMeta.previousVersion}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            if (backendMeta && onPluginBackendDeinstallieren) {
                              const res = await onPluginBackendDeinstallieren(manifest.id);
                              if (!res.ok) {
                                setStoreFehler(
                                  res.fehler ?? `Plugin "${manifest.name}" konnte nicht entfernt werden.`
                                );
                                return;
                              }
                            }
                            onPluginDeinstallieren(manifest.id);
                          })();
                        }}
                        className="rounded border border-[#232933] bg-[#13171D] px-2 py-1 text-[11px] text-[#8B949E] hover:border-[#DC2626]/50 hover:text-[#FCA5A5]"
                      >
                        Entfernen
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={storeBeschaeftigt}
                      onClick={() => {
                        if (onPluginReleaseInstallieren && manifest.repositoryUrl) {
                          void (async () => {
                            setStoreBeschaeftigt(true);
                            setStoreFehler(null);
                            setStoreHinweis(null);
                            const res = await onPluginReleaseInstallieren(manifest.repositoryUrl);
                            setStoreBeschaeftigt(false);
                            if (!res.ok) {
                              setStoreFehler(
                                res.fehler ?? `Installation von "${manifest.name}" fehlgeschlagen.`
                              );
                            } else {
                              zeigeStoreHinweis(
                                `Plugin "${manifest.name}" aus ${manifest.repositoryUrl} installiert.`
                              );
                            }
                          })();
                        } else {
                          onPluginInstallieren(manifest.id);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded bg-[#F59E0B] px-2.5 py-1 text-[11px] font-semibold text-[#0B0E11] hover:bg-[#FBBF24] disabled:opacity-50"
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

        {/* Dual-Mode Plugin-Installer: Release-Bundle / Offline .tar.gz / Dev-Git */}
        <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-white">
              Drittanbieter-, Release- oder Dev-Plugin installieren
            </div>
            <div
              role="tablist"
              aria-label="Installationsmodus"
              className="flex items-center gap-1 rounded border border-[#232933] bg-[#13171D] p-0.5 text-[11px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={installModus === 'release'}
                onClick={() => setInstallModus('release')}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  installModus === 'release'
                    ? 'bg-[#232933] text-white'
                    : 'text-[#8B949E] hover:text-white'
                }`}
              >
                GitHub Release (SHA-256)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={installModus === 'upload'}
                onClick={() => setInstallModus('upload')}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  installModus === 'upload'
                    ? 'bg-[#232933] text-white'
                    : 'text-[#8B949E] hover:text-white'
                }`}
              >
                Offline .tar.gz
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={installModus === 'dev-git'}
                disabled={!capabilities?.devGitInstallErlaubt}
                onClick={() => setInstallModus('dev-git')}
                title={
                  capabilities?.devGitInstallErlaubt
                    ? 'Nur im Dev-Modus: Repo klonen & lokal bauen'
                    : 'Im Produktionsmodus gesperrt (DEV_ALLOW_GIT_INSTALL=false)'
                }
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors disabled:opacity-40 ${
                  installModus === 'dev-git'
                    ? 'bg-[#232933] text-[#F59E0B]'
                    : 'text-[#8B949E] hover:text-white'
                }`}
              >
                <GitBranch className="h-3 w-3" aria-hidden="true" />
                Dev: Git Clone &amp; Build
              </button>
            </div>
          </div>

          {installModus === 'release' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/dein-verein/sidelineos-plugin-scouting"
                className="rounded border border-[#232933] bg-[#13171D] px-3 py-1.5 font-mono text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
              />
              <input
                type="text"
                value={releaseTag}
                onChange={(e) => setReleaseTag(e.target.value)}
                placeholder="Tag (optional, z. B. v0.2.0)"
                className="rounded border border-[#232933] bg-[#13171D] px-3 py-1.5 font-mono text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
              />
              <button
                type="button"
                disabled={storeBeschaeftigt}
                onClick={() => void handleReleaseInstallieren()}
                className="inline-flex items-center justify-center gap-1.5 rounded bg-[#1E2530] px-3.5 py-1.5 text-xs font-medium text-white hover:border hover:border-[#F59E0B] disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                Release installieren
              </button>
            </div>
          )}

          {installModus === 'upload' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
              <input
                type="file"
                accept=".tar.gz,.tgz"
                onChange={(e) => setUploadDatei(e.target.files?.[0] ?? null)}
                className="rounded border border-[#232933] bg-[#13171D] px-3 py-1 text-xs text-[#E6EDF3] file:mr-2.5 file:rounded file:border-0 file:bg-[#232933] file:px-2.5 file:py-1 file:text-xs file:text-white"
              />
              <input
                type="text"
                value={uploadSha256}
                onChange={(e) => setUploadSha256(e.target.value)}
                placeholder="SHA-256 (optional)"
                className="rounded border border-[#232933] bg-[#13171D] px-3 py-1.5 font-mono text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
              />
              <button
                type="button"
                disabled={storeBeschaeftigt || !uploadDatei}
                onClick={() => void handleOfflineUploadInstallieren()}
                className="inline-flex items-center justify-center gap-1.5 rounded bg-[#1E2530] px-3.5 py-1.5 text-xs font-medium text-white hover:border hover:border-[#F59E0B] disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                Paket installieren
              </button>
            </div>
          )}

          {installModus === 'dev-git' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/dein-verein/sidelineos-plugin-scouting"
                className="rounded border border-[#232933] bg-[#13171D] px-3 py-1.5 font-mono text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
              />
              <input
                type="text"
                value={devBranch}
                onChange={(e) => setDevBranch(e.target.value)}
                placeholder="Branch (Standard: main)"
                className="rounded border border-[#232933] bg-[#13171D] px-3 py-1.5 font-mono text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
              />
              <button
                type="button"
                disabled={storeBeschaeftigt}
                onClick={() => void handleDevGitInstallieren()}
                className="inline-flex items-center justify-center gap-1.5 rounded bg-[#F59E0B] px-3.5 py-1.5 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24] disabled:opacity-50"
              >
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                Klonen &amp; Bauen
              </button>
            </div>
          )}

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
                            onChange={() =>
                              void fuehreSysAktionAus(() =>
                                onTeamModulToggle(team.id, plugin.manifest.id)
                              )
                            }
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
                            void fuehreSysAktionAus(
                              () => onTeamLoeschen(team.id),
                              () => setLoeschTeamBestaetigungId(null)
                            );
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
            onClick={() => void handleTeamAnlegen()}
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
                    const teamObj = teams.find((team) => team.id === m.teamId);
                    return `${teamObj?.kurzname ?? m.teamId}: ${holeRollenLabel(m.rolle, locale)}`;
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
                          onChange={() => void fuehreSysAktionAus(() => onBenutzerSysadminToggle(user.uuid))}
                          className="h-3.5 w-3.5 accent-[#F59E0B]"
                        />
                        <span>{user.istSysadmin ? 'Ja' : 'Nein'}</span>
                      </label>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        disabled={benutzerListe.length <= 1}
                        onClick={() => void fuehreSysAktionAus(() => onBenutzerLoeschen(user.uuid))}
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
          <input
            type="password"
            value={neuPasswort}
            onChange={(e) => setNeuPasswort(e.target.value)}
            placeholder="Initialpasswort (mind. 10 Zeichen)"
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
          <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-3">
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
              onClick={() => void handleBenutzerAnlegen()}
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232933] pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">S3 Object Storage</h2>
              <p className="text-[11px] text-[#8B949E]">
                Kompatibel mit MinIO, Hetzner Object Storage, Ceph und AWS S3. Plugins erhalten
                ausschließlich zeitlich signierte Presigned-URLs auf ihren S3-Präfix.
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] text-[#8B949E]">
            {s3Form.konfiguriert ? 'Aktiv konfiguriert' : 'Noch unvollständig'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Endpoint URL</span>
            <input
              type="url"
              value={s3Form.endpoint}
              onChange={(e) => setS3Form((alt) => ({ ...alt, endpoint: e.target.value }))}
              placeholder="http://localhost:9000"
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
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Secret Access Key</span>
            <input
              type="password"
              value={s3SecretEingabe}
              onChange={(e) => setS3SecretEingabe(e.target.value)}
              placeholder={
                s3Form.hatSecretKey
                  ? '•••••••• (gespeichert — leer lassen zum Behalten)'
                  : 'Neuen Secret Key eingeben'
              }
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 font-mono text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Cleanup-Schonfrist (Tage)</span>
            <input
              type="number"
              min={1}
              max={365}
              value={s3Form.cleanupRetentionDays ?? 14}
              onChange={(e) =>
                setS3Form((alt) => ({
                  ...alt,
                  cleanupRetentionDays: Math.max(1, Math.min(365, Number(e.target.value) || 14)),
                }))
              }
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
              disabled={s3Beschaeftigt}
              onClick={() => {
                void (async () => {
                  setS3Beschaeftigt(true);
                  setS3Status(null);
                  const res = await onS3Testen({
                    ...s3Form,
                    ...(s3SecretEingabe.trim() ? { secretKey: s3SecretEingabe.trim() } : {}),
                  });
                  setS3Status({ ok: res.ok, text: res.nachricht });
                  setS3Beschaeftigt(false);
                })();
              }}
              className="rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-[#E6EDF3] hover:border-[#F59E0B] disabled:opacity-50"
            >
              Verbindung testen
            </button>
            <button
              type="button"
              disabled={s3Beschaeftigt}
              onClick={() => {
                void (async () => {
                  setS3Beschaeftigt(true);
                  setS3Status(null);
                  const res = await onS3Speichern({
                    ...s3Form,
                    ...(s3SecretEingabe.trim() ? { secretKey: s3SecretEingabe.trim() } : {}),
                  });
                  if (res.ok) {
                    setS3SecretEingabe('');
                    setS3Status({
                      ok: true,
                      text: 'S3-Konfiguration verschlüsselt gespeichert.',
                    });
                  } else {
                    setS3Status({
                      ok: false,
                      text: res.fehler ?? 'S3-Konfiguration konnte nicht gespeichert werden.',
                    });
                  }
                  setS3Beschaeftigt(false);
                })();
              }}
              className="rounded bg-[#F59E0B] px-3 py-1.5 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24] disabled:opacity-50"
            >
              Speichern
            </button>
          </div>
        </div>
        {s3Status && (
          <p className={`text-xs ${s3Status.ok ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'}`}>
            {s3Status.text}
          </p>
        )}

        {/* Anonymisierte S3-Cleanup-Queue (ohne Dateinamen / Team-Inhalte) */}
        <div className="border-t border-[#232933] pt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-white">
              S3-Cleanup-Queue (Schonfrist-Löschung, anonymisiert)
            </div>
            <div className="font-mono text-[11px] text-[#8B949E]">
              {cleanupStats
                ? `${cleanupStats.wartendeObjekte} vorgemerkt (${formatBytes(cleanupStats.gesamtBytes)}) · ${cleanupStats.faelligeObjekte} fällig · Schonfrist ${cleanupStats.schonfristTage} Tage`
                : `Schonfrist ${s3Form.cleanupRetentionDays ?? 14} Tage aktiv`}
            </div>
          </div>
          {onS3CleanupAusfuehren && (
            <button
              type="button"
              disabled={cleanupBeschaeftigt}
              onClick={() => {
                void (async () => {
                  setCleanupBeschaeftigt(true);
                  setCleanupStatus(null);
                  const res = await onS3CleanupAusfuehren(false);
                  setCleanupStatus({
                    ok: res.ok,
                    text: res.ok
                      ? `Cleanup ausgeführt (${res.geloescht ?? 0} fällige Objekte bereinigt).`
                      : res.fehler ?? 'Cleanup fehlgeschlagen.',
                  });
                  setCleanupBeschaeftigt(false);
                })();
              }}
              className="rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-[#E6EDF3] hover:border-[#F59E0B] disabled:opacity-50"
            >
              Fällige jetzt bereinigen
            </button>
          )}
        </div>
        {cleanupStatus && (
          <p className={`text-xs ${cleanupStatus.ok ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'}`}>
            {cleanupStatus.text}
          </p>
        )}
      </section>

      {/* 6. E-Mail / SMTP */}
      <section
        id="sys-smtp"
        className="scroll-mt-20 rounded-lg border border-[#232933] bg-[#13171D] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232933] pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-white">E-Mail / SMTP</h2>
              <p className="text-[11px] text-[#8B949E]">
                Versand von Team-Einladungen. Ohne aktiven SMTP-Server bleibt der Link-Fallback im
                Team-Admin-Bereich erhalten.
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] text-[#8B949E]">
            {smtpForm.konfiguriert ? 'SMTP aktiv' : 'Offline-Link-Fallback'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs text-[#8B949E] sm:col-span-2">
            <span>SMTP-Host</span>
            <input
              type="text"
              value={smtpForm.host}
              onChange={(e) => setSmtpForm((alt) => ({ ...alt, host: e.target.value }))}
              placeholder="smtp.verein.example"
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
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>SMTP-Passwort</span>
            <input
              type="password"
              value={smtpPasswortEingabe}
              onChange={(e) => setSmtpPasswortEingabe(e.target.value)}
              placeholder={
                smtpForm.hatPasswort ? '•••••••• (gespeichert)' : 'Neues Passwort eingeben'
              }
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 font-mono text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>Test-Empfänger (optional)</span>
            <input
              type="email"
              value={smtpTestEmpfaenger}
              onChange={(e) => setSmtpTestEmpfaenger(e.target.value)}
              placeholder="test@verein.example"
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={smtpBeschaeftigt}
              onClick={() => {
                void (async () => {
                  setSmtpBeschaeftigt(true);
                  setSmtpStatus(null);
                  const res = await onSmtpTesten({
                    ...smtpForm,
                    ...(smtpPasswortEingabe.trim() ? { passwort: smtpPasswortEingabe.trim() } : {}),
                    ...(smtpTestEmpfaenger.trim()
                      ? { testEmpfaenger: smtpTestEmpfaenger.trim() }
                      : {}),
                  });
                  setSmtpStatus({ ok: res.ok, text: res.nachricht });
                  setSmtpBeschaeftigt(false);
                })();
              }}
              className="rounded border border-[#232933] bg-[#0B0E11] px-3 py-1.5 text-xs text-[#E6EDF3] hover:border-[#F59E0B] disabled:opacity-50"
            >
              Verbindung testen
            </button>
            <button
              type="button"
              disabled={smtpBeschaeftigt}
              onClick={() => {
                void (async () => {
                  setSmtpBeschaeftigt(true);
                  setSmtpStatus(null);
                  const res = await onSmtpSpeichern({
                    ...smtpForm,
                    ...(smtpPasswortEingabe.trim() ? { passwort: smtpPasswortEingabe.trim() } : {}),
                  });
                  if (res.ok) {
                    setSmtpPasswortEingabe('');
                    setSmtpStatus({
                      ok: true,
                      text: 'SMTP-Konfiguration verschlüsselt gespeichert.',
                    });
                  } else {
                    setSmtpStatus({
                      ok: false,
                      text: res.fehler ?? 'SMTP-Konfiguration konnte nicht gespeichert werden.',
                    });
                  }
                  setSmtpBeschaeftigt(false);
                })();
              }}
              className="rounded bg-[#F59E0B] px-3 py-1.5 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24] disabled:opacity-50"
            >
              SMTP speichern
            </button>
          </div>
        </div>
        {smtpStatus && (
          <p className={`text-xs ${smtpStatus.ok ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'}`}>
            {smtpStatus.text}
          </p>
        )}
      </section>

      {/* 7. Dynamische Sysadmin-Panels aller aktivierten Plugins */}
      {settingsKontext &&
        pluginsMitSysadminPanel.map((plugin) => {
          const SysadminPanel = plugin.settingsPanels!.sysadmin!;
          return <SysadminPanel key={plugin.manifest.id} ctx={settingsKontext} />;
        })}
    </SettingsShell>
  );
}
