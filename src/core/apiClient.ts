import type { UnterstuetzteSprache } from '../shared/i18n.ts';
import type {
  BenutzerKonto,
  PluginId,
  ProfilCustomFeld,
  S3Konfiguration,
  SmtpKonfiguration,
  SpielerUnit,
  TeamEinladung,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from '../shared/types.ts';
import type { PluginManifest } from '../sdk/plugin.ts';

export class CoreApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CoreApiError';
  }
}

export interface AuthSessionResponse {
  user: BenutzerKonto;
  memberships: TeamMitgliedschaft[];
  teams: TeamKontext[];
  token?: string;
}

export interface InviteCheckResponse {
  status: 'VALID';
  invitation: {
    id: string;
    teamId: string;
    typ: 'EMAIL' | 'TEAM_LINK';
    zielEmail?: string;
    rolle: TeamRolle;
    units: SpielerUnit[];
    gueltigBis: string;
    bestaetigungErforderlich: boolean;
  };
  team: {
    id: string;
    name: string;
    kurzname: string;
    aktiveSaison: string;
    primaerFarbe?: string;
    customProfilFelder: ProfilCustomFeld[];
  };
}

export interface InviteAcceptResponse {
  status: TeamMitgliedschaft['status'];
  user: BenutzerKonto;
  membership: TeamMitgliedschaft;
  team: TeamKontext;
  token?: string;
}

export interface TeamMemberEintrag {
  membership: TeamMitgliedschaft;
  user: {
    uuid: string;
    benutzername: string;
    vollerName: string;
    trikotNummer?: string;
    position?: string;
    email?: string;
    telefon?: string;
  } | null;
}

export interface SysadminPluginStatusDTO {
  manifest: PluginManifest;
  enabledGlobally: boolean;
  source: string;
  releaseTag: string;
  installedVersion?: string;
  previousVersion?: string | null;
  installMode?: string;
  packageSha256?: string | null;
  devBranch?: string | null;
}

export interface SysadminCapabilitiesDTO {
  devGitInstallErlaubt: boolean;
  disableUpdateCheck: boolean;
  coreVersion: string;
  supportedSdkVersion: string;
  brandName?: string;
  defaultLocale?: UnterstuetzteSprache;
}

export interface SysadminMitgliedschaftEingabeDTO {
  teamId: string;
  rolle: TeamRolle;
  units?: SpielerUnit[];
  status?: 'AKTIV' | 'WARTET_AUF_FREIGABE';
}

export interface S3CleanupStatistikDTO {
  wartendeObjekte: number;
  faelligeObjekte: number;
  gesamtBytes: number;
  faelligeBytes: number;
  schonfristTage: number;
  naechsterLoeschzeitpunkt: string | null;
}

export interface CoreUpdateInfoDTO {
  aktuell: string;
  verfuegbar: string | null;
  updateVerfuegbar: boolean;
  releaseUrl: string | null;
  veroeffentlichtAm: string | null;
  hinweis?: string;
}

export interface PluginUpdateEintragDTO {
  pluginId: string;
  name: string;
  aktuell: string;
  verfuegbar: string | null;
  updateVerfuegbar: boolean;
  sdkKompatibel: boolean;
  coreKompatibel?: boolean;
  releaseTag: string | null;
  releaseUrl: string | null;
}

export interface UpdatePruefErgebnisDTO {
  deaktiviert: boolean;
  geprueftAm: string;
  coreUpdate: CoreUpdateInfoDTO | null;
  pluginUpdates: PluginUpdateEintragDTO[];
  anzahlVerfuegbar: number;
}

export interface SysadminOverviewResponse {
  teams: TeamKontext[];
  users: BenutzerKonto[];
  memberships: TeamMitgliedschaft[];
  plugins: SysadminPluginStatusDTO[];
  capabilities?: SysadminCapabilitiesDTO;
  s3Config?: S3Konfiguration;
  smtpConfig?: SmtpKonfiguration;
  cleanupStats?: S3CleanupStatistikDTO;
}

export interface MailVersandStatus {
  gesendet: boolean;
  modus: 'SMTP' | 'OFFLINE_FALLBACK' | 'NICHT_ANGEFORDERT';
  hinweis: string;
}

export interface RuntimePluginClientDTO {
  pluginId: PluginId;
  version: string;
  manifest: PluginManifest;
  clientUrl: string;
  cssUrl?: string;
}

export interface RuntimeManifestResponse {
  installedPluginIds: PluginId[];
  enabledPluginIds: PluginId[];
  bundles: RuntimePluginClientDTO[];
}

/**
 * Hält optionales Bearer-Fallback-Token ausschließlich im RAM (niemals localStorage/sessionStorage),
 * während Browser standardmäßig über das HttpOnly-Cookie authentifiziert werden.
 */
let memoryBearerToken: string | null = null;

export function setzeMemoryBearerToken(token: string | null): void {
  memoryBearerToken = token;
}

async function apiRequest<T>(pfad: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }
  if (memoryBearerToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memoryBearerToken}`);
  }

  const res = await fetch(pfad, {
    ...init,
    credentials: 'include',
    headers,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? ((await res.json()) as Record<string, unknown>)
    : null;

  if (!res.ok) {
    if (res.status === 401) {
      memoryBearerToken = null;
    }
    const nachricht =
      typeof data?.fehler === 'string' ? data.fehler : `HTTP-Fehler ${res.status}`;
    throw new CoreApiError(res.status, nachricht, data ?? undefined);
  }

  return data as T;
}

export const coreApi = {
  // --- Auth & Profil ---
  async login(kennung: string, passwort: string): Promise<AuthSessionResponse> {
    const res = await apiRequest<AuthSessionResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ kennung, passwort }),
    });
    if (res.token) {
      memoryBearerToken = res.token;
    }
    return res;
  },

  async logout(): Promise<void> {
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      memoryBearerToken = null;
    }
  },

  holeAktuelleSitzung(): Promise<AuthSessionResponse> {
    return apiRequest<AuthSessionResponse>('/api/v1/auth/me');
  },

  aktualisiereEigenesProfil(daten: {
    vollerName?: string;
    benutzername?: string;
    email?: string;
    telefon?: string;
    trikotNummer?: string;
    position?: string;
    preferredLocale?: UnterstuetzteSprache;
    customProfilWerte?: Record<string, string>;
    altesPasswort?: string;
    neuesPasswort?: string;
  }): Promise<{ user: BenutzerKonto }> {
    return apiRequest<{ user: BenutzerKonto }>('/api/v1/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(daten),
    });
  },

  pruefeEinladung(token: string): Promise<InviteCheckResponse> {
    return apiRequest<InviteCheckResponse>(
      `/api/v1/auth/invite/${encodeURIComponent(token)}`
    );
  },

  async akzeptiereEinladung(
    token: string,
    payload:
      | { modus: 'bestehend'; kennung: string; passwort: string; units: SpielerUnit[] }
      | {
          modus: 'neu';
          vollerName: string;
          benutzername: string;
          email: string;
          passwort: string;
          telefon?: string;
          trikotNummer?: string;
          position?: string;
          preferredLocale?: UnterstuetzteSprache;
          units: SpielerUnit[];
          customProfilWerte?: Record<string, string>;
        }
  ): Promise<InviteAcceptResponse> {
    const res = await apiRequest<InviteAcceptResponse>(
      `/api/v1/auth/invite/${encodeURIComponent(token)}/accept`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    if (res.token) {
      memoryBearerToken = res.token;
    }
    return res;
  },

  // --- Teams & Mitglieder ---
  holeTeams(): Promise<{ teams: TeamKontext[]; memberships: TeamMitgliedschaft[] }> {
    return apiRequest('/api/v1/teams');
  },

  aktualisiereTeam(
    teamId: string,
    daten: Partial<Pick<TeamKontext, 'name' | 'kurzname' | 'aktiveSaison' | 'primaerFarbe' | 'customProfilFelder'>>
  ): Promise<{ team: TeamKontext }> {
    return apiRequest(`/api/v1/teams/${encodeURIComponent(teamId)}`, {
      method: 'PATCH',
      body: JSON.stringify(daten),
    });
  },

  starteNeueSaison(
    teamId: string,
    saison: string,
    alsAktiv = true
  ): Promise<{ team: TeamKontext }> {
    return apiRequest(`/api/v1/teams/${encodeURIComponent(teamId)}/seasons`, {
      method: 'POST',
      body: JSON.stringify({ saison, alsAktiv }),
    });
  },

  holeTeamMitglieder(teamId: string): Promise<{ members: TeamMemberEintrag[] }> {
    return apiRequest(`/api/v1/teams/${encodeURIComponent(teamId)}/members`);
  },

  aktualisiereMitglied(
    teamId: string,
    membershipId: string,
    patch: Partial<Pick<TeamMitgliedschaft, 'rolle' | 'units' | 'status'>>
  ): Promise<{ membership: TeamMitgliedschaft }> {
    return apiRequest(
      `/api/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
  },

  entferneMitglied(teamId: string, membershipId: string): Promise<{ ok: boolean }> {
    return apiRequest(
      `/api/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
      { method: 'DELETE' }
    );
  },

  holeEinladungen(teamId: string): Promise<{ invitations: TeamEinladung[] }> {
    return apiRequest(`/api/v1/teams/${encodeURIComponent(teamId)}/invitations`);
  },

  erstelleEinladung(
    teamId: string,
    payload: {
      typ: 'EMAIL' | 'TEAM_LINK';
      zielEmail?: string;
      rolle: TeamRolle;
      units: SpielerUnit[];
      gueltigTage?: number;
      bestaetigungErforderlich?: boolean;
    }
  ): Promise<{ invitation: TeamEinladung; mailStatus?: MailVersandStatus }> {
    return apiRequest(`/api/v1/teams/${encodeURIComponent(teamId)}/invitations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  widerrufeEinladung(teamId: string, invitationId: string): Promise<{ ok: boolean }> {
    return apiRequest(
      `/api/v1/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(invitationId)}`,
      { method: 'DELETE' }
    );
  },

  // --- Sysadmin ---
  holeSysadminUebersicht(): Promise<SysadminOverviewResponse> {
    return apiRequest('/api/v1/sysadmin/overview');
  },

  erstelleTeam(payload: {
    name: string;
    kurzname: string;
    aktiveSaison: string;
    primaerFarbe?: string;
    aktivierteModule?: PluginId[];
    customProfilFelder?: ProfilCustomFeld[];
  }): Promise<{ team: TeamKontext }> {
    return apiRequest('/api/v1/sysadmin/teams', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  aktualisiereSysadminTeam(
    teamId: string,
    daten: Partial<
      Pick<TeamKontext, 'name' | 'kurzname' | 'aktiveSaison' | 'primaerFarbe' | 'customProfilFelder'>
    >
  ): Promise<{ team: TeamKontext }> {
    return apiRequest(`/api/v1/sysadmin/teams/${encodeURIComponent(teamId)}`, {
      method: 'PATCH',
      body: JSON.stringify(daten),
    });
  },

  loescheTeam(teamId: string): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/sysadmin/teams/${encodeURIComponent(teamId)}`, {
      method: 'DELETE',
    });
  },

  erstelleBenutzer(payload: {
    vollerName: string;
    benutzername: string;
    email: string;
    passwort: string;
    istSysadmin: boolean;
    telefon?: string;
    trikotNummer?: string;
    position?: string;
    preferredLocale?: UnterstuetzteSprache;
    teamZuweisung?: { teamId: string; rolle: TeamRolle };
    mitgliedschaften?: SysadminMitgliedschaftEingabeDTO[];
  }): Promise<{
    user: BenutzerKonto;
    membership?: TeamMitgliedschaft;
    memberships?: TeamMitgliedschaft[];
  }> {
    return apiRequest('/api/v1/sysadmin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  aktualisiereBenutzer(
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
  ): Promise<{ user: BenutzerKonto; memberships: TeamMitgliedschaft[] }> {
    return apiRequest(`/api/v1/sysadmin/users/${encodeURIComponent(userUuid)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  setzeBenutzerSysadmin(
    userUuid: string,
    istSysadmin: boolean
  ): Promise<{ user: BenutzerKonto }> {
    return apiRequest(
      `/api/v1/sysadmin/users/${encodeURIComponent(userUuid)}/sysadmin`,
      {
        method: 'PATCH',
        body: JSON.stringify({ istSysadmin }),
      }
    );
  },

  loescheBenutzer(userUuid: string): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/sysadmin/users/${encodeURIComponent(userUuid)}`, {
      method: 'DELETE',
    });
  },

  setzePluginGlobalAktiv(
    pluginId: PluginId,
    enabledGlobally: boolean
  ): Promise<{ pluginId: string; enabledGlobally: boolean }> {
    return apiRequest(`/api/v1/sysadmin/plugins/${encodeURIComponent(pluginId)}/global`, {
      method: 'PATCH',
      body: JSON.stringify({ enabledGlobally }),
    });
  },

  setzeTeamPluginAktiv(
    teamId: string,
    pluginId: PluginId,
    enabled: boolean
  ): Promise<{ teamId: string; pluginId: string; enabled: boolean }> {
    return apiRequest(
      `/api/v1/sysadmin/teams/${encodeURIComponent(teamId)}/plugins/${encodeURIComponent(pluginId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }
    );
  },

  speichereS3Konfig(
    payload: S3Konfiguration & { secretKey?: string; clearSecretKey?: boolean }
  ): Promise<{ s3Config: S3Konfiguration }> {
    return apiRequest('/api/v1/sysadmin/s3', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  testeS3Verbindung(
    payload?: Partial<S3Konfiguration> & { secretKey?: string }
  ): Promise<{ ok: boolean; nachricht: string }> {
    return apiRequest('/api/v1/sysadmin/s3/test', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  },

  speichereSmtpKonfig(
    payload: SmtpKonfiguration & { passwort?: string; clearPasswort?: boolean }
  ): Promise<{ smtpConfig: SmtpKonfiguration }> {
    return apiRequest('/api/v1/sysadmin/smtp', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  testeSmtpVerbindung(
    payload?: Partial<SmtpKonfiguration> & { passwort?: string; testEmpfaenger?: string }
  ): Promise<{ ok: boolean; nachricht: string }> {
    return apiRequest('/api/v1/sysadmin/smtp/test', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  },

  // --- Phase 3: Updates, Plugin-Installer & S3-Cleanup ---
  holeUpdates(refresh = false): Promise<UpdatePruefErgebnisDTO> {
    return apiRequest(`/api/v1/sysadmin/updates${refresh ? '?refresh=true' : ''}`);
  },

  installierePluginRelease(
    repoUrl: string,
    tag?: string
  ): Promise<{
    ok: boolean;
    manifest: PluginManifest;
    sha256: string;
    releaseTag: string;
    migrationenAusgefuehrt: number;
  }> {
    return apiRequest('/api/v1/sysadmin/plugins/install-release', {
      method: 'POST',
      body: JSON.stringify({ repoUrl, ...(tag ? { tag } : {}) }),
    });
  },

  installierePluginUpload(
    contentBase64: string,
    expectedSha256?: string
  ): Promise<{
    ok: boolean;
    manifest: PluginManifest;
    sha256: string;
    migrationenAusgefuehrt: number;
  }> {
    return apiRequest('/api/v1/sysadmin/plugins/install-upload', {
      method: 'POST',
      body: JSON.stringify({
        contentBase64,
        ...(expectedSha256 ? { expectedSha256 } : {}),
      }),
    });
  },

  installierePluginDevGit(
    repoUrl: string,
    branch?: string
  ): Promise<{
    ok: boolean;
    manifest: PluginManifest;
    branch: string;
    migrationenAusgefuehrt: number;
  }> {
    return apiRequest('/api/v1/sysadmin/plugins/install-dev-git', {
      method: 'POST',
      body: JSON.stringify({ repoUrl, ...(branch ? { branch } : {}) }),
    });
  },

  rollbackPlugin(
    pluginId: string
  ): Promise<{ ok: boolean; manifest: PluginManifest; version: string }> {
    return apiRequest(`/api/v1/sysadmin/plugins/${encodeURIComponent(pluginId)}/rollback`, {
      method: 'POST',
    });
  },

  deinstallierePlugin(pluginId: string): Promise<{ ok: boolean }> {
    return apiRequest(`/api/v1/sysadmin/plugins/${encodeURIComponent(pluginId)}`, {
      method: 'DELETE',
    });
  },

  bereinigeS3Cleanup(auchVorfristig = false): Promise<{
    geloescht: number;
    fehler: number;
    freigegebeneBytes: number;
    statistik: S3CleanupStatistikDTO;
  }> {
    return apiRequest('/api/v1/sysadmin/s3/cleanup/run', {
      method: 'POST',
      body: JSON.stringify({ auchVorfristig }),
    });
  },

  holeRuntimePlugins(): Promise<RuntimeManifestResponse> {
    return apiRequest<RuntimeManifestResponse>('/api/v1/plugins/runtime/manifest');
  },

  holePublicRuntimePlugins(): Promise<{ bundles: RuntimePluginClientDTO[] }> {
    return apiRequest<{ bundles: RuntimePluginClientDTO[] }>(
      '/api/v1/plugins/runtime/public-manifest'
    );
  },
};
