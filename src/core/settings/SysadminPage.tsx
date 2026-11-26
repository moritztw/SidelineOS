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
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Store,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  CoreApiError as _CoreApiError,
  S3CleanupStatistikDTO,
  SysadminCapabilitiesDTO,
  SysadminMitgliedschaftEingabeDTO,
  SysadminPluginStatusDTO,
  UpdatePruefErgebnisDTO,
} from '../apiClient.ts';
import type {
  BenutzerKonto,
  PluginId,
  S3Konfiguration,
  SmtpKonfiguration,
  SpielerUnit,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from '../../shared/types.ts';
import type { UnterstuetzteSprache } from '../../shared/i18n.ts';
import { holeRollenLabel } from '../../shared/types.ts';
import {
  holePermissionBeschreibung,
  type PluginSettingsKontext,
  type PluginStoreEintrag,
  type SidelinePlugin,
  type VerfuegbaresThemeEintrag,
} from '../../sdk/plugin.ts';
import { STANDARD_THEME_REF } from '../../shared/theme.ts';
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
  defaultTheme?: string;
  verfuegbareThemes?: VerfuegbaresThemeEintrag[];
  onDefaultThemeSpeichern?: (themeRef: string) => Promise<ApiAktionErgebnis>;
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
  onTeamAktualisieren?: (
    teamId: string,
    daten: Partial<
      Pick<TeamKontext, 'name' | 'kurzname' | 'aktiveSaison' | 'primaerFarbe' | 'customProfilFelder'>
    >
  ) => Promise<ApiAktionErgebnis>;
  onTeamLoeschen: (teamId: string) => Promise<ApiAktionErgebnis>;
  onBenutzerErstellen: (
    payload: {
      vollerName: string;
      benutzername: string;
      email: string;
      passwort: string;
      istSysadmin: boolean;
      telefon?: string;
      trikotNummer?: string;
      position?: string;
      preferredLocale?: UnterstuetzteSprache;
    },
    teamZuweisung?: { teamId: string; rolle: TeamRolle },
    mitgliedschaften?: SysadminMitgliedschaftEingabeDTO[]
  ) => Promise<ApiAktionErgebnis>;
  onBenutzerAktualisieren?: (
    userUuid: string,
    payload: {
      vollerName: string;
      benutzername: string;
      email: string;
      istSysadmin: boolean;
      telefon?: string;
      trikotNummer?: string;
      position?: string;
      preferredLocale?: UnterstuetzteSprache;
      neuesPasswort?: string;
      mitgliedschaften: SysadminMitgliedschaftEingabeDTO[];
    }
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
  defaultTheme = STANDARD_THEME_REF,
  verfuegbareThemes = [],
  onDefaultThemeSpeichern,
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
  onTeamAktualisieren,
  onTeamLoeschen,
  onBenutzerErstellen,
  onBenutzerAktualisieren,
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

  // Teams (Neu + Bearbeiten-Overlay)
  const [neuesTeamName, setNeuesTeamName] = useState('');
  const [neuesTeamSaison, setNeuesTeamSaison] = useState('2026');
  const [neuesTeamKurz, setNeuesTeamKurz] = useState('');
  const [loeschTeamBestaetigungId, setLoeschTeamBestaetigungId] = useState<string | null>(null);
  const [teamDialogZiel, setTeamDialogZiel] = useState<TeamKontext | null>(null);
  const [teamDialogName, setTeamDialogName] = useState('');
  const [teamDialogKurzname, setTeamDialogKurzname] = useState('');
  const [teamDialogSaison, setTeamDialogSaison] = useState('');
  const [teamDialogFarbe, setTeamDialogFarbe] = useState('#F59E0B');
  const [teamDialogFehler, setTeamDialogFehler] = useState<string | null>(null);
  const [teamDialogSpeichert, setTeamDialogSpeichert] = useState(false);

  // Benutzer- & Rechteverwaltung (Liste + verbundenes Create/Edit-Overlay)
  const [benutzerSuche, setBenutzerSuche] = useState('');
  const [benutzerDialogModus, setBenutzerDialogModus] = useState<
    { typ: 'neu' } | { typ: 'bearbeiten'; userUuid: string } | null
  >(null);
  const [dialogName, setDialogName] = useState('');
  const [dialogUsername, setDialogUsername] = useState('');
  const [dialogEmail, setDialogEmail] = useState('');
  const [dialogPasswort, setDialogPasswort] = useState('');
  const [dialogTelefon, setDialogTelefon] = useState('');
  const [dialogTrikot, setDialogTrikot] = useState('');
  const [dialogPosition, setDialogPosition] = useState('');
  const [dialogSprache, setDialogSprache] = useState<UnterstuetzteSprache>('de');
  const [dialogIstSysadmin, setDialogIstSysadmin] = useState(false);
  const [dialogMitgliedschaften, setDialogMitgliedschaften] = useState<
    Array<{
      teamId: string;
      rolle: TeamRolle;
      units: SpielerUnit[];
      status: 'AKTIV' | 'WARTET_AUF_FREIGABE';
    }>
  >([]);
  const [neuesTeamZuweisungId, setNeuesTeamZuweisungId] = useState<string>(teams[0]?.id ?? '');
  const [neuesTeamZuweisungRolle, setNeuesTeamZuweisungRolle] = useState<TeamRolle>('PLAYER');
  const [dialogFehler, setDialogFehler] = useState<string | null>(null);
  const [dialogSpeichert, setDialogSpeichert] = useState(false);
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

  const [themeAuswahl, setThemeAuswahl] = useState(defaultTheme);
  const [themeStatus, setThemeStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [themeBeschaeftigt, setThemeBeschaeftigt] = useState(false);

  useEffect(() => {
    setThemeAuswahl(defaultTheme);
  }, [defaultTheme]);

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
    { id: 'sys-theme', label: 'Erscheinungsbild & Theme', gruppe: 'Instanz-Verwaltung' },
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

  const oeffneTeamBearbeitenDialog = (team: TeamKontext) => {
    setTeamDialogFehler(null);
    setTeamDialogZiel(team);
    setTeamDialogName(team.name);
    setTeamDialogKurzname(team.kurzname);
    setTeamDialogSaison(team.aktiveSaison);
    setTeamDialogFarbe(team.primaerFarbe ?? '#F59E0B');
  };

  const handleTeamDialogSpeichern = async () => {
    if (!teamDialogZiel) return;
    const name = teamDialogName.trim();
    const kurzname = teamDialogKurzname.trim();
    const aktiveSaison = teamDialogSaison.trim();
    const primaerFarbe = teamDialogFarbe.trim() || '#F59E0B';

    if (!name || !kurzname || !aktiveSaison) {
      setTeamDialogFehler('Bitte Teamname, Kurzname und aktive Saison angeben.');
      return;
    }
    if (!onTeamAktualisieren) {
      setTeamDialogFehler('Team-Bearbeitungsfunktion ist nicht verfügbar.');
      return;
    }

    setTeamDialogFehler(null);
    setTeamDialogSpeichert(true);
    try {
      const res = await onTeamAktualisieren(teamDialogZiel.id, {
        name,
        kurzname,
        aktiveSaison,
        primaerFarbe,
      });
      if (!res.ok) {
        setTeamDialogFehler(res.fehler ?? 'Team konnte nicht gespeichert werden.');
        return;
      }
      setTeamDialogZiel(null);
    } finally {
      setTeamDialogSpeichert(false);
    }
  };

  const oeffneNeuerBenutzerDialog = () => {
    setDialogFehler(null);
    setBenutzerDialogModus({ typ: 'neu' });
    setDialogName('');
    setDialogUsername('');
    setDialogEmail('');
    setDialogPasswort('');
    setDialogTelefon('');
    setDialogTrikot('');
    setDialogPosition('');
    setDialogSprache(locale);
    setDialogIstSysadmin(false);
    setDialogMitgliedschaften(
      teams[0]
        ? [{ teamId: teams[0].id, rolle: 'PLAYER', units: ['OFFENSE'], status: 'AKTIV' }]
        : []
    );
    setNeuesTeamZuweisungId(teams[1]?.id ?? teams[0]?.id ?? '');
    setNeuesTeamZuweisungRolle('PLAYER');
  };

  const oeffneBenutzerBearbeitenDialog = (user: BenutzerKonto) => {
    setDialogFehler(null);
    setBenutzerDialogModus({ typ: 'bearbeiten', userUuid: user.uuid });
    setDialogName(user.vollerName);
    setDialogUsername(user.benutzername);
    setDialogEmail(user.email);
    setDialogPasswort('');
    setDialogTelefon(user.telefon ?? '');
    setDialogTrikot(user.trikotNummer ?? '');
    setDialogPosition(user.position ?? '');
    setDialogSprache(user.preferredLocale ?? 'de');
    setDialogIstSysadmin(user.istSysadmin);

    const bestehend = mitgliedschaften
      .filter((m) => m.userUuid === user.uuid)
      .map((m) => ({
        teamId: m.teamId,
        rolle: m.rolle,
        units: m.units.length > 0 ? [...m.units] : (['OFFENSE'] as SpielerUnit[]),
        status: m.status,
      }));
    setDialogMitgliedschaften(bestehend);
    const verfuegbaresTeam = teams.find((t) => !bestehend.some((b) => b.teamId === t.id));
    setNeuesTeamZuweisungId(verfuegbaresTeam?.id ?? '');
    setNeuesTeamZuweisungRolle('PLAYER');
  };

  const handleDialogTeamHinzufuegen = () => {
    if (!neuesTeamZuweisungId) return;
    if (dialogMitgliedschaften.some((m) => m.teamId === neuesTeamZuweisungId)) return;
    const naechste = [
      ...dialogMitgliedschaften,
      {
        teamId: neuesTeamZuweisungId,
        rolle: neuesTeamZuweisungRolle,
        units: ['OFFENSE'] as SpielerUnit[],
        status: 'AKTIV' as const,
      },
    ];
    setDialogMitgliedschaften(naechste);
    const verbleibend = teams.find((t) => !naechste.some((m) => m.teamId === t.id));
    setNeuesTeamZuweisungId(verbleibend?.id ?? '');
  };

  const handleDialogUnitToggle = (teamId: string, unit: SpielerUnit) => {
    setDialogMitgliedschaften((alt) =>
      alt.map((m) => {
        if (m.teamId !== teamId) return m;
        const aktiv = m.units.includes(unit);
        if (aktiv && m.units.length <= 1) return m;
        return {
          ...m,
          units: aktiv ? m.units.filter((u) => u !== unit) : [...m.units, unit],
        };
      })
    );
  };

  const handleBenutzerDialogSpeichern = async () => {
    if (!benutzerDialogModus) return;
    const name = dialogName.trim();
    const mail = dialogEmail.trim().toLowerCase();
    const username = (dialogUsername.trim() || mail.split('@')[0] || '').toLowerCase();

    if (!name || !mail.includes('@') || !username) {
      setDialogFehler('Bitte Name, gültige E-Mail-Adresse und Benutzername eingeben.');
      return;
    }

    if (benutzerDialogModus.typ === 'neu' && dialogPasswort.length < 10) {
      setDialogFehler('Das Initialpasswort muss mindestens 10 Zeichen lang sein.');
      return;
    }
    if (
      benutzerDialogModus.typ === 'bearbeiten' &&
      dialogPasswort.length > 0 &&
      dialogPasswort.length < 10
    ) {
      setDialogFehler('Ein neues Passwort muss mindestens 10 Zeichen lang sein.');
      return;
    }

    setDialogFehler(null);
    setDialogSpeichert(true);
    try {
      if (benutzerDialogModus.typ === 'neu') {
        const res = await onBenutzerErstellen(
          {
            vollerName: name,
            benutzername: username,
            email: mail,
            passwort: dialogPasswort,
            istSysadmin: dialogIstSysadmin,
            telefon: dialogTelefon.trim(),
            trikotNummer: dialogTrikot.trim(),
            position: dialogPosition.trim(),
            preferredLocale: dialogSprache,
          },
          dialogMitgliedschaften[0]
            ? { teamId: dialogMitgliedschaften[0].teamId, rolle: dialogMitgliedschaften[0].rolle }
            : undefined,
          dialogMitgliedschaften
        );
        if (!res.ok) {
          setDialogFehler(res.fehler ?? 'Benutzerkonto konnte nicht angelegt werden.');
          return;
        }
        setBenutzerDialogModus(null);
        return;
      }

      if (!onBenutzerAktualisieren) {
        setDialogFehler('Bearbeitungsfunktion ist nicht verfügbar.');
        return;
      }

      const res = await onBenutzerAktualisieren(benutzerDialogModus.userUuid, {
        vollerName: name,
        benutzername: username,
        email: mail,
        istSysadmin: dialogIstSysadmin,
        telefon: dialogTelefon.trim(),
        trikotNummer: dialogTrikot.trim(),
        position: dialogPosition.trim(),
        preferredLocale: dialogSprache,
        ...(dialogPasswort ? { neuesPasswort: dialogPasswort } : {}),
        mitgliedschaften: dialogMitgliedschaften,
      });
      if (!res.ok) {
        setDialogFehler(res.fehler ?? 'Benutzerkonto konnte nicht gespeichert werden.');
        return;
      }
      setBenutzerDialogModus(null);
    } finally {
      setDialogSpeichert(false);
    }
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
              className="inline-flex items-center gap-1.5 rounded border border-sl-accent/50 bg-sl-accent/10 px-3 py-1.5 text-xs font-medium text-sl-accent-hover hover:bg-sl-accent/20"
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
          <div className="inline-flex items-center gap-1.5 rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-muted">
            <ShieldAlert className="h-3.5 w-3.5 text-sl-accent" aria-hidden="true" />
            {t('sysadmin.noContentAccess')}
          </div>
        </div>
      }
    >
      {updateStatus?.coreUpdate?.updateVerfuegbar && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sl-accent/40 bg-sl-accent/10 px-4 py-3 text-xs text-sl-warning-text"
        >
          <div className="flex items-start gap-2.5">
            <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-sl-accent" aria-hidden="true" />
            <div>
              <div className="font-semibold text-sl-heading">
                {t('sysadmin.coreUpdateTitle', {
                  coreName: brand.coreName,
                  available: updateStatus.coreUpdate.verfuegbar ?? '',
                  current: updateStatus.coreUpdate.aktuell,
                })}
              </div>
              {updateStatus.coreUpdate.hinweis && (
                <p className="mt-0.5 text-[11px] text-sl-warning-text/90">
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
              className="inline-flex items-center gap-1 rounded border border-sl-accent/50 bg-sl-canvas px-2.5 py-1 text-[11px] font-medium text-sl-accent hover:bg-sl-surface"
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
          className="rounded-lg border border-sl-danger/50 bg-sl-danger/10 px-4 py-2.5 text-xs text-sl-danger-text"
        >
          {sysadminFehler}
        </div>
      )}
      {/* 1. Plugin Store (GitHub-Repositories) */}
      <section
        id="sys-store"
        className="scroll-mt-20 rounded-lg border border-sl-border bg-sl-surface p-5 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sl-border pb-3">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-sl-accent" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-sl-heading">
                Plugin Store · Unabhängige GitHub-Module
              </h2>
              <p className="text-[11px] text-sl-muted">
                Jedes Plugin wird in einem eigenen Repo gegen{' '}
                <code className="font-mono text-sl-primary">@sidelineos/plugin-sdk</code> entwickelt
                und mit isoliertem DB-/S3-Präfix geladen.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] text-sl-muted">
              {installiertePlugins.length} installiert · Core{' '}
              {capabilities?.coreVersion
                ? /^\d/.test(capabilities.coreVersion)
                  ? `v${capabilities.coreVersion}`
                  : capabilities.coreVersion
                : 'v0.1.0'}{' '}
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
                className="inline-flex items-center gap-1.5 rounded border border-sl-border bg-sl-canvas px-2.5 py-1 text-[11px] font-medium text-sl-primary hover:border-sl-accent disabled:opacity-45"
              >
                <RefreshCw
                  className={`h-3 w-3 ${updatePruefungLaeuft ? 'animate-spin text-sl-accent' : 'text-sl-muted'}`}
                  aria-hidden="true"
                />
                {capabilities?.disableUpdateCheck ? 'Update-Check aus' : 'Nach Updates prüfen'}
              </button>
            )}
          </div>
        </div>

        {vollstaendigerKatalog.length === 0 ? (
          <div className="rounded-md border border-sl-border bg-sl-canvas px-4 py-5 text-center text-xs text-sl-subtle">
            Noch keine Plugins installiert. Installiere externe Module unten per GitHub-Release,
            Offline-Paket (`.tar.gz`) oder Git-Branch.
          </div>
        ) : (
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
                    ? 'border-sl-accent/40 bg-sl-canvas'
                    : 'border-sl-border bg-sl-canvas/60'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-sl-heading">{manifest.name}</div>
                      <div className="font-mono text-[10px] text-sl-muted">
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
                      <span className="inline-flex items-center gap-1 rounded border border-sl-success/40 bg-sl-success/10 px-1.5 py-0.5 font-mono text-[10px] text-sl-success-text">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Offiziell
                      </span>
                    ) : (
                      <span className="rounded border border-sl-border px-1.5 py-0.5 font-mono text-[10px] text-sl-muted">
                        GitHub
                      </span>
                    )}
                  </div>

                  {pluginUpdate?.updateVerfuegbar && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-sl-accent/40 bg-sl-accent/10 px-2.5 py-1.5 text-[11px] text-sl-warning-text">
                      <span>
                        Update: v{pluginUpdate.verfuegbar}
                        {!pluginUpdate.sdkKompatibel ? ' (SDK inkompatibel)' : ''}
                        {pluginUpdate.coreKompatibel === false ? ' (Core-Version inkompatibel)' : ''}
                      </span>
                      {pluginUpdate.sdkKompatibel &&
                        pluginUpdate.coreKompatibel !== false &&
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
                            className="rounded bg-sl-accent px-2 py-0.5 text-[10px] font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-50"
                          >
                            Aktualisieren
                          </button>
                        )}
                    </div>
                  )}

                  <p className="text-xs leading-relaxed text-sl-muted">
                    {manifest.kurzbeschreibung}
                  </p>

                  <div className="space-y-1 border-t border-sl-border pt-2 font-mono text-[10px] text-sl-subtle">
                    <div>
                      SDK: v{manifest.sdkVersion}
                      {manifest.minCoreVersion ? ` · Core >= v${manifest.minCoreVersion}` : ''}
                      {manifest.maxCoreVersion ? ` · Core <= v${manifest.maxCoreVersion}` : ''}
                    </div>
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

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sl-border pt-3">
                  {manifest.repositoryUrl ? (
                    <a
                      href={manifest.repositoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-sl-muted hover:text-sl-heading"
                    >
                      Repo
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="font-mono text-[10px] text-sl-subtle">Lokal</span>
                  )}

                  {installiert ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void fuehreSysAktionAus(() => onGlobalModulToggle(manifest.id))}
                        className={`rounded border px-2 py-1 text-[11px] font-medium ${
                          globalAn
                            ? 'border-sl-success/40 bg-sl-success/10 text-sl-success-text'
                            : 'border-sl-border bg-sl-surface text-sl-muted'
                        }`}
                      >
                        {globalAn ? 'Aktiv' : 'Pausiert'}
                      </button>
                      {backendMeta?.installMode === 'DEV_GIT' &&
                        manifest.repositoryUrl &&
                        onPluginDevGitInstallieren && (
                          <button
                            type="button"
                            disabled={storeBeschaeftigt || !capabilities?.devGitInstallErlaubt}
                            title={
                              capabilities?.devGitInstallErlaubt
                                ? `Git Pull (${backendMeta.devBranch ?? 'main'})`
                                : 'Deaktiviert (DEV_ALLOW_GIT_INSTALL=false)'
                            }
                            onClick={() => {
                              void (async () => {
                                setStoreBeschaeftigt(true);
                                setStoreFehler(null);
                                setStoreHinweis(null);
                                const res = await onPluginDevGitInstallieren(
                                  manifest.repositoryUrl,
                                  backendMeta.devBranch ?? undefined
                                );
                                setStoreBeschaeftigt(false);
                                if (!res.ok) {
                                  setStoreFehler(
                                    res.fehler ??
                                      `Git Pull für "${manifest.name}" fehlgeschlagen.`
                                  );
                                } else {
                                  zeigeStoreHinweis(
                                    `Git Pull für "${manifest.name}" (${backendMeta.devBranch ?? 'main'}) abgeschlossen.`
                                  );
                                }
                              })();
                            }}
                            className="inline-flex items-center gap-1 rounded border border-sl-border bg-sl-surface px-2 py-1 text-[11px] text-sl-primary hover:border-sl-accent disabled:opacity-50"
                          >
                            <RefreshCw className="h-3 w-3 text-sl-accent" aria-hidden="true" />
                            Git Pull
                          </button>
                        )}
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
                                  `Rollback auf ${backendMeta.previousVersion} durchgeführt.`
                                );
                              }
                            })();
                          }}
                          className="inline-flex items-center gap-1 rounded border border-sl-border bg-sl-surface px-2 py-1 text-[11px] text-sl-primary hover:border-sl-accent disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3 text-sl-accent" aria-hidden="true" />
                          {/^\d/.test(backendMeta.previousVersion)
                            ? `v${backendMeta.previousVersion}`
                            : backendMeta.previousVersion}
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
                        className="rounded border border-sl-border bg-sl-surface px-2 py-1 text-[11px] text-sl-muted hover:border-sl-danger/50 hover:text-sl-danger-text"
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
                      className="inline-flex items-center gap-1 rounded bg-sl-accent px-2.5 py-1 text-[11px] font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-50"
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
        )}

        {/* Dual-Mode Plugin-Installer: Release-Bundle / Offline .tar.gz / Dev-Git */}
        <div className="rounded-md border border-sl-border bg-sl-canvas p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-sl-heading">
              Drittanbieter-, Release- oder Dev-Plugin installieren
            </div>
            <div
              role="tablist"
              aria-label="Installationsmodus"
              className="flex items-center gap-1 rounded border border-sl-border bg-sl-surface p-0.5 text-[11px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={installModus === 'release'}
                onClick={() => setInstallModus('release')}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  installModus === 'release'
                    ? 'bg-sl-border text-sl-heading'
                    : 'text-sl-muted hover:text-sl-heading'
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
                    ? 'bg-sl-border text-sl-heading'
                    : 'text-sl-muted hover:text-sl-heading'
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
                    ? 'Git-Repo klonen & lokal bauen (DEV_ALLOW_GIT_INSTALL=true)'
                    : 'Deaktiviert (DEV_ALLOW_GIT_INSTALL=false)'
                }
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors disabled:opacity-40 ${
                  installModus === 'dev-git'
                    ? 'bg-sl-border text-sl-accent'
                    : 'text-sl-muted hover:text-sl-heading'
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
                placeholder="https://github.com/dein-verein/SidelineOS-scouting"
                className="rounded border border-sl-border bg-sl-surface px-3 py-1.5 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
              />
              <input
                type="text"
                value={releaseTag}
                onChange={(e) => setReleaseTag(e.target.value)}
                placeholder="Tag (optional, z. B. v0.2.0)"
                className="rounded border border-sl-border bg-sl-surface px-3 py-1.5 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={storeBeschaeftigt}
                onClick={() => void handleReleaseInstallieren()}
                className="inline-flex items-center justify-center gap-1.5 rounded bg-sl-elevated px-3.5 py-1.5 text-xs font-medium text-sl-heading hover:border hover:border-sl-accent disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5 text-sl-accent" aria-hidden="true" />
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
                className="rounded border border-sl-border bg-sl-surface px-3 py-1 text-xs text-sl-primary file:mr-2.5 file:rounded file:border-0 file:bg-sl-border file:px-2.5 file:py-1 file:text-xs file:text-sl-heading"
              />
              <input
                type="text"
                value={uploadSha256}
                onChange={(e) => setUploadSha256(e.target.value)}
                placeholder="SHA-256 (optional)"
                className="rounded border border-sl-border bg-sl-surface px-3 py-1.5 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={storeBeschaeftigt || !uploadDatei}
                onClick={() => void handleOfflineUploadInstallieren()}
                className="inline-flex items-center justify-center gap-1.5 rounded bg-sl-elevated px-3.5 py-1.5 text-xs font-medium text-sl-heading hover:border hover:border-sl-accent disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5 text-sl-accent" aria-hidden="true" />
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
                placeholder="https://github.com/dein-verein/SidelineOS-scouting"
                className="rounded border border-sl-border bg-sl-surface px-3 py-1.5 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
              />
              <input
                type="text"
                value={devBranch}
                onChange={(e) => setDevBranch(e.target.value)}
                placeholder="Branch (Standard: main)"
                className="rounded border border-sl-border bg-sl-surface px-3 py-1.5 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={storeBeschaeftigt}
                onClick={() => void handleDevGitInstallieren()}
                className="inline-flex items-center justify-center gap-1.5 rounded bg-sl-accent px-3.5 py-1.5 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-50"
              >
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                Klonen &amp; Bauen
              </button>
            </div>
          )}

          {storeFehler && <p className="text-xs text-sl-danger-text">{storeFehler}</p>}
          {storeHinweis && <p className="text-xs text-sl-success-text">{storeHinweis}</p>}
        </div>
      </section>

      {/* 2. Team-sortierte Freigabe-Matrix */}
      <section
        id="sys-module"
        className="scroll-mt-20 rounded-lg border border-sl-border bg-sl-surface p-5 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sl-border pb-3">
          <div className="flex items-center gap-2">
            <Blocks className="h-4 w-4 text-sl-accent" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-sl-heading">
                Modul-Freigabe (nach Team sortiert)
              </h2>
              <p className="text-[11px] text-sl-muted">
                Nicht installierte oder für ein Team deaktivierte Plugins verschwinden vollständig
                auf der Startseite und in den Einstellungen.
              </p>
            </div>
          </div>
        </div>

        {globalAktivePlugins.length === 0 ? (
          <div className="rounded-md border border-sl-border bg-sl-canvas px-4 py-5 text-center text-xs text-sl-subtle">
            Aktuell ist kein installiertes Plugin instanzweit aktiviert.
          </div>
        ) : (
          <div className="divide-y divide-sl-border rounded-md border border-sl-border bg-sl-canvas">
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
                    <div className="text-sm font-semibold text-sl-heading">{team.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-sl-muted">
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
                              ? 'border-sl-border bg-sl-surface text-sl-primary'
                              : 'border-sl-border/60 bg-transparent text-sl-subtle'
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
                            className="h-3.5 w-3.5 accent-sl-accent"
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
        className="scroll-mt-20 rounded-lg border border-sl-border bg-sl-surface p-5 space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-sl-border pb-3">
          <Building2 className="h-4 w-4 text-sl-accent" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-sl-heading">Teams / Mandanten ({teams.length})</h2>
            <p className="text-[11px] text-sl-muted">
              Teams bleiben dauerhaft über Saisons hinweg bestehen. Neue Spielzeiten startet der
              jeweilige Team Admin direkt im Team, alte Saisons bleiben abrufbar.
            </p>
          </div>
        </div>

        <div className="divide-y divide-sl-border rounded-md border border-sl-border bg-sl-canvas">
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
                  <div className="flex flex-wrap items-center gap-2 font-medium text-sl-heading">
                    <svg
                      className="h-2.5 w-2.5 shrink-0"
                      viewBox="0 0 10 10"
                      aria-hidden="true"
                    >
                      <circle cx="5" cy="5" r="5" fill={team.primaerFarbe ?? '#F59E0B'} />
                    </svg>
                    <span>{team.name}</span>
                    <span className="rounded border border-sl-border bg-sl-surface px-1.5 py-0.5 font-mono text-[10px] text-sl-muted">
                      {team.kurzname}
                    </span>
                    <span className="font-mono text-sl-accent">· Saison {team.aktiveSaison}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-sl-muted">
                    {mitgliederZahl} aktive Mitglieder · {team.aktivierteModule.length} Plugins
                    {alteSaisons.length > 0 && ` · Archivierte Saisons: ${alteSaisons.join(', ')}`}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => oeffneTeamBearbeitenDialog(team)}
                    className="inline-flex items-center gap-1 rounded border border-sl-border bg-sl-surface px-2.5 py-1 text-[11px] text-sl-primary hover:border-sl-accent"
                  >
                    <Pencil className="h-3 w-3 text-sl-accent" aria-hidden="true" />
                    Bearbeiten
                  </button>
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
                          className="rounded bg-sl-danger px-2 py-1 text-[11px] font-semibold text-white"
                        >
                          Endgültig löschen
                        </button>
                        <button
                          type="button"
                          onClick={() => setLoeschTeamBestaetigungId(null)}
                          className="rounded border border-sl-border px-2 py-1 text-[11px] text-sl-muted"
                        >
                          Abbruch
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLoeschTeamBestaetigungId(team.id)}
                        aria-label={`Team ${team.name} löschen`}
                        className="rounded p-1.5 text-sl-muted hover:bg-sl-danger/15 hover:text-sl-danger-text"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <input
            type="text"
            value={neuesTeamName}
            onChange={(e) => setNeuesTeamName(e.target.value)}
            placeholder="Neuer Teamname (z. B. Munich Stallions Ladies)"
            className="rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none sm:col-span-2"
          />
          <input
            type="text"
            value={neuesTeamKurz}
            onChange={(e) => setNeuesTeamKurz(e.target.value)}
            placeholder="Kurzname (optional)"
            className="rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
          />
          <input
            type="text"
            value={neuesTeamSaison}
            onChange={(e) => setNeuesTeamSaison(e.target.value)}
            placeholder="Saison (2026)"
            className="rounded border border-sl-border bg-sl-canvas px-3 py-1.5 font-mono text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleTeamAnlegen()}
            className="inline-flex items-center justify-center gap-1.5 rounded bg-sl-accent px-3 py-1.5 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Team anlegen
          </button>
        </div>
      </section>

      {teamDialogZiel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sysadmin-team-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-sl-border bg-sl-surface p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-sl-border pb-3">
              <div>
                <h3
                  id="sysadmin-team-dialog-title"
                  className="text-sm font-semibold text-sl-heading"
                >
                  Team bearbeiten
                </h3>
                <p className="text-[11px] text-sl-muted">
                  Stammdaten, aktive Saison und Primärfarbe für{' '}
                  <span className="font-mono text-sl-primary">{teamDialogZiel.id}</span> anpassen.
                </p>
              </div>
              <button
                type="button"
                disabled={teamDialogSpeichert}
                onClick={() => setTeamDialogZiel(null)}
                aria-label="Team-Dialog schließen"
                className="rounded p-1 text-sl-muted hover:bg-sl-border hover:text-sl-heading"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-sl-muted sm:col-span-2">
                <span>Teamname *</span>
                <input
                  type="text"
                  value={teamDialogName}
                  onChange={(e) => setTeamDialogName(e.target.value)}
                  placeholder="Munich Stallions U19"
                  className="w-full rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
                />
              </label>

              <label className="space-y-1 text-xs text-sl-muted">
                <span>Kurzname *</span>
                <input
                  type="text"
                  value={teamDialogKurzname}
                  onChange={(e) => setTeamDialogKurzname(e.target.value)}
                  placeholder="U19"
                  className="w-full rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
                />
              </label>

              <label className="space-y-1 text-xs text-sl-muted">
                <span>Aktive Saison *</span>
                <input
                  type="text"
                  value={teamDialogSaison}
                  onChange={(e) => setTeamDialogSaison(e.target.value)}
                  placeholder="2026"
                  className="w-full rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
                />
              </label>
            </div>

            {teamDialogZiel.saisons.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] text-sl-muted">
                  Vorhandene Saisons (Klick übernimmt als aktive Saison, neuer Wert legt Saison an):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {teamDialogZiel.saisons.map((s) => {
                    const ausgewaehlt = teamDialogSaison.trim() === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setTeamDialogSaison(s)}
                        className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                          ausgewaehlt
                            ? 'border-sl-accent bg-sl-accent/15 text-sl-warning-text'
                            : 'border-sl-border bg-sl-canvas text-sl-muted hover:text-sl-heading'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1 text-xs text-sl-muted">
              <span>Primäre Teamfarbe</span>
              <div className="flex items-center gap-2.5">
                <input
                  type="color"
                  aria-label="Primäre Teamfarbe wählen"
                  value={/^#[0-9a-fA-F]{6}$/.test(teamDialogFarbe) ? teamDialogFarbe : '#F59E0B'}
                  onChange={(e) => setTeamDialogFarbe(e.target.value)}
                  className="h-8 w-11 cursor-pointer rounded border border-sl-border bg-sl-canvas"
                />
                <input
                  type="text"
                  aria-label="Primäre Teamfarbe Hex-Wert"
                  value={teamDialogFarbe}
                  onChange={(e) => setTeamDialogFarbe(e.target.value)}
                  placeholder="#F59E0B"
                  className="w-32 rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 font-mono text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
                />
              </div>
            </div>

            {teamDialogFehler && (
              <div className="rounded border border-sl-danger/50 bg-sl-danger/10 px-3 py-2 text-xs text-sl-danger-text">
                {teamDialogFehler}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-sl-border pt-3">
              <button
                type="button"
                disabled={teamDialogSpeichert}
                onClick={() => setTeamDialogZiel(null)}
                className="rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-muted hover:text-sl-heading disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={teamDialogSpeichert}
                onClick={() => void handleTeamDialogSpeichern()}
                className="rounded bg-sl-accent px-3.5 py-1.5 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-50"
              >
                {teamDialogSpeichert ? 'Speichert...' : 'Änderungen speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Globale Benutzer & Rechteverwaltung */}
      <section
        id="sys-benutzer"
        className="scroll-mt-20 rounded-lg border border-sl-border bg-sl-surface p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sl-border pb-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-sl-accent" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-sl-heading">
                Benutzer &amp; Rechteverwaltung ({benutzerListe.length})
              </h2>
              <p className="text-[11px] text-sl-muted">
                Konten anlegen, Stammdaten aktualisieren sowie Sysadmin- und Team-Rechte pro
                Mandant zuweisen oder entziehen.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={benutzerSuche}
              onChange={(e) => setBenutzerSuche(e.target.value)}
              placeholder="Suchen (Name, E-Mail, Team)..."
              className="rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={oeffneNeuerBenutzerDialog}
              className="inline-flex items-center gap-1.5 rounded bg-sl-accent px-3 py-1.5 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Neuer Benutzer
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-sl-border text-sl-muted">
                <th className="py-2 pr-3 font-medium">Benutzer</th>
                <th className="py-2 pr-3 font-medium">Teams &amp; Rechte</th>
                <th className="py-2 pr-3 font-medium">Sysadmin</th>
                <th className="py-2 text-right font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sl-border">
              {benutzerListe
                .filter((user) => {
                  const q = benutzerSuche.trim().toLowerCase();
                  if (!q) return true;
                  const userTeamsText = mitgliedschaften
                    .filter((m) => m.userUuid === user.uuid)
                    .map((m) => {
                      const tObj = teams.find((team) => team.id === m.teamId);
                      return `${tObj?.name ?? ''} ${tObj?.kurzname ?? ''} ${m.rolle}`;
                    })
                    .join(' ')
                    .toLowerCase();
                  return (
                    user.vollerName.toLowerCase().includes(q) ||
                    user.benutzername.toLowerCase().includes(q) ||
                    user.email.toLowerCase().includes(q) ||
                    userTeamsText.includes(q)
                  );
                })
                .map((user) => {
                  const userMemberships = mitgliedschaften.filter((m) => m.userUuid === user.uuid);

                  return (
                    <tr key={user.uuid}>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-sl-primary">
                          {user.vollerName}{' '}
                          <span className="font-mono text-[11px] text-sl-subtle">
                            @{user.benutzername}
                          </span>
                        </div>
                        <div className="text-[11px] text-sl-muted">
                          {user.email}
                          {user.trikotNummer || user.position
                            ? ` · ${[
                                user.trikotNummer ? `#${user.trikotNummer}` : '',
                                user.position ?? '',
                              ]
                                .filter(Boolean)
                                .join(' ')}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        {userMemberships.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {userMemberships.map((m) => {
                              const teamObj = teams.find((team) => team.id === m.teamId);
                              return (
                                <span
                                  key={m.id}
                                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${
                                    m.status === 'AKTIV'
                                      ? 'border-sl-border bg-sl-canvas text-sl-primary'
                                      : 'border-sl-accent/40 bg-sl-accent/10 text-sl-warning-text'
                                  }`}
                                >
                                  <span className="font-medium">
                                    {teamObj?.kurzname ?? m.teamId}:
                                  </span>
                                  <span>{holeRollenLabel(m.rolle, locale)}</span>
                                  {m.status !== 'AKTIV' && (
                                    <span className="text-[10px]">(Wartet)</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-sl-subtle">Kein Team (nur Instanz)</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sl-primary">
                          <input
                            type="checkbox"
                            checked={user.istSysadmin}
                            onChange={() =>
                              void fuehreSysAktionAus(() => onBenutzerSysadminToggle(user.uuid))
                            }
                            className="h-3.5 w-3.5 accent-sl-accent"
                          />
                          <span>{user.istSysadmin ? 'Ja' : 'Nein'}</span>
                        </label>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => oeffneBenutzerBearbeitenDialog(user)}
                            className="inline-flex items-center gap-1 rounded border border-sl-border bg-sl-canvas px-2.5 py-1 text-[11px] text-sl-primary hover:border-sl-accent"
                          >
                            <Pencil className="h-3 w-3 text-sl-accent" aria-hidden="true" />
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            disabled={benutzerListe.length <= 1}
                            onClick={() =>
                              void fuehreSysAktionAus(() => onBenutzerLoeschen(user.uuid))
                            }
                            className="rounded border border-sl-border bg-sl-canvas px-2.5 py-1 text-[11px] text-sl-muted hover:border-sl-danger/50 hover:text-sl-danger-text disabled:opacity-40"
                          >
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {benutzerDialogModus && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sysadmin-user-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-sl-border bg-sl-surface p-5 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-sl-border pb-3">
              <div>
                <h3
                  id="sysadmin-user-dialog-title"
                  className="text-sm font-semibold text-sl-heading"
                >
                  {benutzerDialogModus.typ === 'neu'
                    ? 'Neuen Benutzer & Rechte anlegen'
                    : `Benutzer & Rechte bearbeiten`}
                </h3>
                <p className="text-[11px] text-sl-muted">
                  {benutzerDialogModus.typ === 'neu'
                    ? 'Konto mit Stammdaten, optionalem Sysadmin-Zugriff und Team-Mitgliedschaften erstellen.'
                    : 'Stammdaten, Passwort, Sysadmin-Status sowie Rechte und Rollen je Team anpassen.'}
                </p>
              </div>
              <button
                type="button"
                disabled={dialogSpeichert}
                onClick={() => setBenutzerDialogModus(null)}
                aria-label="Dialog schließen"
                className="rounded p-1 text-sl-muted hover:bg-sl-border hover:text-sl-heading"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-sl-muted">
                <span>Voller Name *</span>
                <input
                  type="text"
                  value={dialogName}
                  onChange={(e) => setDialogName(e.target.value)}
                  placeholder="Max Mustermann"
                  className="w-full rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-xs text-sl-muted">
                <span>Benutzername *</span>
                <input
                  type="text"
                  value={dialogUsername}
                  onChange={(e) => setDialogUsername(e.target.value)}
                  placeholder="max.mustermann"
                  className="w-full rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-xs text-sl-muted">
                <span>E-Mail-Adresse *</span>
                <input
                  type="email"
                  value={dialogEmail}
                  onChange={(e) => setDialogEmail(e.target.value)}
                  placeholder="max@verein.de"
                  className="w-full rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-xs text-sl-muted">
                <span>
                  {benutzerDialogModus.typ === 'neu'
                    ? 'Initialpasswort (mind. 10 Zeichen) *'
                    : 'Neues Passwort (optional)'}
                </span>
                <input
                  type="password"
                  value={dialogPasswort}
                  onChange={(e) => setDialogPasswort(e.target.value)}
                  placeholder={
                    benutzerDialogModus.typ === 'neu'
                      ? 'Mindestens 10 Zeichen'
                      : 'Leer lassen, um Passwort zu behalten'
                  }
                  className="w-full rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-xs text-sl-muted">
                <span>Telefon</span>
                <input
                  type="text"
                  value={dialogTelefon}
                  onChange={(e) => setDialogTelefon(e.target.value)}
                  placeholder="+49 ..."
                  className="w-full rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 text-xs text-sl-muted">
                  <span>Trikot #</span>
                  <input
                    type="text"
                    value={dialogTrikot}
                    onChange={(e) => setDialogTrikot(e.target.value)}
                    placeholder="12"
                    className="w-full rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-sl-muted">
                  <span>Position</span>
                  <input
                    type="text"
                    value={dialogPosition}
                    onChange={(e) => setDialogPosition(e.target.value)}
                    placeholder="QB"
                    className="w-full rounded border border-sl-border bg-sl-canvas px-2.5 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-sl-muted">
                  <span>Sprache</span>
                  <select
                    value={dialogSprache}
                    onChange={(e) => setDialogSprache(e.target.value as UnterstuetzteSprache)}
                    className="w-full rounded border border-sl-border bg-sl-canvas px-2 py-1.5 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
                  >
                    <option value="de">Deutsch</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-md border border-sl-border bg-sl-canvas px-3.5 py-2.5">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-sl-primary">
                <input
                  type="checkbox"
                  checked={dialogIstSysadmin}
                  onChange={(e) => setDialogIstSysadmin(e.target.checked)}
                  className="h-3.5 w-3.5 accent-sl-accent"
                />
                <span className="font-medium">Sysadmin</span>
                <span className="text-[11px] text-sl-muted">
                  (Instanzweiter Vollzugriff auf Teams, Benutzer, Plugins &amp; Infrastruktur)
                </span>
              </label>
            </div>

            <div className="space-y-2.5 rounded-md border border-sl-border bg-sl-canvas p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-sl-heading">
                    Team-Mitgliedschaften &amp; Rechte ({dialogMitgliedschaften.length})
                  </div>
                  <p className="text-[11px] text-sl-muted">
                    Rolle, Status und Units je Team zuweisen oder komplette Team-Rechte entfernen.
                  </p>
                </div>
              </div>

              {dialogMitgliedschaften.length === 0 ? (
                <div className="rounded border border-dashed border-sl-border px-3 py-2.5 text-xs text-sl-subtle">
                  Keine Team-Mitgliedschaft zugewiesen (Konto hat nur Instanz-Ebene).
                </div>
              ) : (
                <div className="space-y-2">
                  {dialogMitgliedschaften.map((m) => {
                    const teamObj = teams.find((team) => team.id === m.teamId);
                    return (
                      <div
                        key={m.teamId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-sl-border bg-sl-surface px-3 py-2 text-xs"
                      >
                        <div className="min-w-[140px]">
                          <div className="font-medium text-sl-heading">
                            {teamObj?.name ?? m.teamId}
                          </div>
                          <div className="font-mono text-[10px] text-sl-subtle">
                            {teamObj?.kurzname ?? m.teamId}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label={`Rolle für ${teamObj?.name ?? m.teamId}`}
                            value={m.rolle}
                            onChange={(e) => {
                              const neueRolle = e.target.value as TeamRolle;
                              setDialogMitgliedschaften((alt) =>
                                alt.map((item) =>
                                  item.teamId === m.teamId ? { ...item, rolle: neueRolle } : item
                                )
                              );
                            }}
                            className="rounded border border-sl-border bg-sl-canvas px-2 py-1 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
                          >
                            <option value="TEAM_ADMIN">Team Admin</option>
                            <option value="COACH">Coach</option>
                            <option value="PLAYER">Spieler</option>
                          </select>

                          <select
                            aria-label={`Status für ${teamObj?.name ?? m.teamId}`}
                            value={m.status}
                            onChange={(e) => {
                              const neuerStatus = e.target.value as
                                | 'AKTIV'
                                | 'WARTET_AUF_FREIGABE';
                              setDialogMitgliedschaften((alt) =>
                                alt.map((item) =>
                                  item.teamId === m.teamId ? { ...item, status: neuerStatus } : item
                                )
                              );
                            }}
                            className="rounded border border-sl-border bg-sl-canvas px-2 py-1 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
                          >
                            <option value="AKTIV">Aktiv</option>
                            <option value="WARTET_AUF_FREIGABE">Wartet auf Freigabe</option>
                          </select>

                          <div className="flex items-center gap-1">
                            {(
                              [
                                { unit: 'OFFENSE', label: 'OFF' },
                                { unit: 'DEFENSE', label: 'DEF' },
                                { unit: 'SPECIAL_TEAMS', label: 'ST' },
                              ] as const
                            ).map(({ unit, label }) => {
                              const aktiv = m.units.includes(unit);
                              return (
                                <button
                                  key={unit}
                                  type="button"
                                  onClick={() => handleDialogUnitToggle(m.teamId, unit)}
                                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                                    aktiv
                                      ? 'border-sl-accent/60 bg-sl-accent/15 text-sl-warning-text'
                                      : 'border-sl-border bg-sl-canvas text-sl-subtle'
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setDialogMitgliedschaften((alt) =>
                                alt.filter((item) => item.teamId !== m.teamId)
                              )
                            }
                            aria-label={`Team-Rechte für ${teamObj?.name ?? m.teamId} entfernen`}
                            className="rounded border border-sl-border bg-sl-canvas p-1 text-sl-muted hover:border-sl-danger/50 hover:text-sl-danger-text"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {teams.some((t) => !dialogMitgliedschaften.some((m) => m.teamId === t.id)) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <select
                    aria-label="Team auswählen"
                    value={neuesTeamZuweisungId}
                    onChange={(e) => setNeuesTeamZuweisungId(e.target.value)}
                    className="min-w-[180px] flex-1 rounded border border-sl-border bg-sl-surface px-2.5 py-1.5 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
                  >
                    <option value="">Team zum Hinzufügen wählen...</option>
                    {teams
                      .filter((t) => !dialogMitgliedschaften.some((m) => m.teamId === t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                  <select
                    aria-label="Rolle für neues Team"
                    value={neuesTeamZuweisungRolle}
                    onChange={(e) => setNeuesTeamZuweisungRolle(e.target.value as TeamRolle)}
                    className="rounded border border-sl-border bg-sl-surface px-2.5 py-1.5 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
                  >
                    <option value="TEAM_ADMIN">Team Admin</option>
                    <option value="COACH">Coach</option>
                    <option value="PLAYER">Spieler</option>
                  </select>
                  <button
                    type="button"
                    disabled={!neuesTeamZuweisungId}
                    onClick={handleDialogTeamHinzufuegen}
                    className="inline-flex items-center gap-1 rounded border border-sl-border bg-sl-elevated px-3 py-1.5 text-xs font-medium text-sl-heading hover:border-sl-accent disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5 text-sl-accent" aria-hidden="true" />
                    Team hinzufügen
                  </button>
                </div>
              )}
            </div>

            {dialogFehler && (
              <div className="rounded border border-sl-danger/50 bg-sl-danger/10 px-3 py-2 text-xs text-sl-danger-text">
                {dialogFehler}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-sl-border pt-3">
              <button
                type="button"
                disabled={dialogSpeichert}
                onClick={() => setBenutzerDialogModus(null)}
                className="rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-muted hover:text-sl-heading disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={dialogSpeichert}
                onClick={() => void handleBenutzerDialogSpeichern()}
                className="rounded bg-sl-accent px-3.5 py-1.5 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-50"
              >
                {dialogSpeichert
                  ? 'Speichert...'
                  : benutzerDialogModus.typ === 'neu'
                    ? 'Benutzer anlegen'
                    : 'Änderungen speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instanz-Standard-Theme */}
      {onDefaultThemeSpeichern && (
        <section
          id="sys-theme"
          className="scroll-mt-20 rounded-lg border border-sl-border bg-sl-surface p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sl-border pb-3">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-sl-accent" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-sl-heading">
                  Erscheinungsbild &amp; Instanz-Standard-Theme
                </h2>
                <p className="text-[11px] text-sl-muted">
                  Legt das Standard-Theme für Anmeldung, Einladungen und Konten ohne eigene
                  Theme-Auswahl fest. Zusätzliche Themes stammen aus global aktivierten Plugins.
                </p>
              </div>
            </div>
            <span className="font-mono text-[11px] text-sl-muted">{themeAuswahl}</span>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[240px] flex-1 space-y-1 text-xs text-sl-muted sm:max-w-md">
              <span>Standard-Theme der Instanz</span>
              <select
                aria-label="Standard-Theme der Instanz"
                value={
                  themeAuswahl === STANDARD_THEME_REF ||
                  verfuegbareThemes.some((th) => th.themeRef === themeAuswahl)
                    ? themeAuswahl
                    : STANDARD_THEME_REF
                }
                onChange={(e) => setThemeAuswahl(e.target.value)}
                className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
              >
                <option value={STANDARD_THEME_REF} className="bg-sl-surface">
                  SidelineOS Standard (Dark)
                </option>
                {Array.from(
                  verfuegbareThemes.reduce<Map<string, VerfuegbaresThemeEintrag[]>>((map, eintrag) => {
                    const gruppe = eintrag.pluginName ?? eintrag.pluginId ?? 'Plugin';
                    const liste = map.get(gruppe) ?? [];
                    liste.push(eintrag);
                    map.set(gruppe, liste);
                    return map;
                  }, new Map())
                ).map(([gruppe, eintraege]) => (
                  <optgroup key={gruppe} label={gruppe} className="bg-sl-surface">
                    {eintraege.map((eintrag) => (
                      <option
                        key={eintrag.themeRef}
                        value={eintrag.themeRef}
                        className="bg-sl-surface"
                      >
                        {eintrag.preset.name} ({eintrag.preset.colorScheme})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={themeBeschaeftigt}
              onClick={() => {
                void (async () => {
                  setThemeBeschaeftigt(true);
                  setThemeStatus(null);
                  const res = await onDefaultThemeSpeichern(themeAuswahl);
                  setThemeStatus({
                    ok: res.ok,
                    text: res.ok
                      ? 'Instanz-Standard-Theme gespeichert.'
                      : res.fehler ?? 'Standard-Theme konnte nicht gespeichert werden.',
                  });
                  setThemeBeschaeftigt(false);
                })();
              }}
              className="rounded bg-sl-accent px-3.5 py-2 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-50"
            >
              {themeBeschaeftigt ? 'Speichert...' : 'Standard-Theme speichern'}
            </button>
          </div>

          {verfuegbareThemes.length === 0 && (
            <p className="text-[11px] text-sl-subtle">
              Aktuell ist kein global aktives Plugin mit Theme-Presets installiert. Es gilt das
              integrierte SidelineOS-Standard-Theme.
            </p>
          )}
          {themeStatus && (
            <p className={`text-xs ${themeStatus.ok ? 'text-sl-success-text' : 'text-sl-danger-text'}`}>
              {themeStatus.text}
            </p>
          )}
        </section>
      )}

      {/* 5. S3 Object Storage */}
      <section
        id="sys-storage"
        className="scroll-mt-20 rounded-lg border border-sl-border bg-sl-surface p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sl-border pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-sl-accent" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-sl-heading">S3 Object Storage</h2>
              <p className="text-[11px] text-sl-muted">
                Kompatibel mit MinIO, Hetzner Object Storage, Ceph und AWS S3. Plugins erhalten
                ausschließlich zeitlich signierte Presigned-URLs auf ihren S3-Präfix.
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] text-sl-muted">
            {s3Form.konfiguriert ? 'Aktiv konfiguriert' : 'Noch unvollständig'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs text-sl-muted">
            <span>Endpoint URL</span>
            <input
              type="url"
              value={s3Form.endpoint}
              onChange={(e) => setS3Form((alt) => ({ ...alt, endpoint: e.target.value }))}
              placeholder="http://localhost:9000"
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 font-mono text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-sl-muted">
            <span>Bucket-Name</span>
            <input
              type="text"
              value={s3Form.bucket}
              onChange={(e) => setS3Form((alt) => ({ ...alt, bucket: e.target.value }))}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 font-mono text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-sl-muted">
            <span>Region</span>
            <input
              type="text"
              value={s3Form.region}
              onChange={(e) => setS3Form((alt) => ({ ...alt, region: e.target.value }))}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 font-mono text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-sl-muted">
            <span>Access Key ID</span>
            <input
              type="text"
              value={s3Form.accessKey}
              onChange={(e) => setS3Form((alt) => ({ ...alt, accessKey: e.target.value }))}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 font-mono text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-sl-muted">
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
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-sl-muted">
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
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 font-mono text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-sl-primary">
            <input
              type="checkbox"
              checked={s3Form.forcePathStyle}
              onChange={(e) => setS3Form((alt) => ({ ...alt, forcePathStyle: e.target.checked }))}
              className="h-3.5 w-3.5 accent-sl-accent"
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
              className="rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-primary hover:border-sl-accent disabled:opacity-50"
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
              className="rounded bg-sl-accent px-3 py-1.5 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-50"
            >
              Speichern
            </button>
          </div>
        </div>
        {s3Status && (
          <p className={`text-xs ${s3Status.ok ? 'text-sl-success-text' : 'text-sl-danger-text'}`}>
            {s3Status.text}
          </p>
        )}

        {/* Anonymisierte S3-Cleanup-Queue (ohne Dateinamen / Team-Inhalte) */}
        <div className="border-t border-sl-border pt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-sl-heading">
              S3-Cleanup-Queue (Schonfrist-Löschung, anonymisiert)
            </div>
            <div className="font-mono text-[11px] text-sl-muted">
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
              className="rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-primary hover:border-sl-accent disabled:opacity-50"
            >
              Fällige jetzt bereinigen
            </button>
          )}
        </div>
        {cleanupStatus && (
          <p className={`text-xs ${cleanupStatus.ok ? 'text-sl-success-text' : 'text-sl-danger-text'}`}>
            {cleanupStatus.text}
          </p>
        )}
      </section>

      {/* 6. E-Mail / SMTP */}
      <section
        id="sys-smtp"
        className="scroll-mt-20 rounded-lg border border-sl-border bg-sl-surface p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sl-border pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-sl-accent" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-sl-heading">E-Mail / SMTP</h2>
              <p className="text-[11px] text-sl-muted">
                Versand von Team-Einladungen. Ohne aktiven SMTP-Server bleibt der Link-Fallback im
                Team-Admin-Bereich erhalten.
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] text-sl-muted">
            {smtpForm.konfiguriert ? 'SMTP aktiv' : 'Offline-Link-Fallback'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs text-sl-muted sm:col-span-2">
            <span>SMTP-Host</span>
            <input
              type="text"
              value={smtpForm.host}
              onChange={(e) => setSmtpForm((alt) => ({ ...alt, host: e.target.value }))}
              placeholder="smtp.verein.example"
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 font-mono text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-sl-muted">
            <span>Port</span>
            <input
              type="number"
              value={smtpForm.port}
              onChange={(e) =>
                setSmtpForm((alt) => ({ ...alt, port: Number(e.target.value) || 587 }))
              }
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 font-mono text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-sl-muted">
            <span>Benutzer</span>
            <input
              type="text"
              value={smtpForm.benutzer}
              onChange={(e) => setSmtpForm((alt) => ({ ...alt, benutzer: e.target.value }))}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-sl-muted sm:col-span-2">
            <span>Absender (From)</span>
            <input
              type="text"
              value={smtpForm.absender}
              onChange={(e) => setSmtpForm((alt) => ({ ...alt, absender: e.target.value }))}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-sl-muted">
            <span>SMTP-Passwort</span>
            <input
              type="password"
              value={smtpPasswortEingabe}
              onChange={(e) => setSmtpPasswortEingabe(e.target.value)}
              placeholder={
                smtpForm.hatPasswort ? '•••••••• (gespeichert)' : 'Neues Passwort eingeben'
              }
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-xs text-sl-muted">
            <span>Test-Empfänger (optional)</span>
            <input
              type="email"
              value={smtpTestEmpfaenger}
              onChange={(e) => setSmtpTestEmpfaenger(e.target.value)}
              placeholder="test@verein.example"
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-sl-primary">
            <input
              type="checkbox"
              checked={smtpForm.tlsAktiv}
              onChange={(e) => setSmtpForm((alt) => ({ ...alt, tlsAktiv: e.target.checked }))}
              className="h-3.5 w-3.5 accent-sl-accent"
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
              className="rounded border border-sl-border bg-sl-canvas px-3 py-1.5 text-xs text-sl-primary hover:border-sl-accent disabled:opacity-50"
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
              className="rounded bg-sl-accent px-3 py-1.5 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-50"
            >
              SMTP speichern
            </button>
          </div>
        </div>
        {smtpStatus && (
          <p className={`text-xs ${smtpStatus.ok ? 'text-sl-success-text' : 'text-sl-danger-text'}`}>
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
