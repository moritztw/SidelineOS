import type {
  BenutzerKonto,
  PluginId,
  ProfilCustomFeld,
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

export interface SysadminOverviewResponse {
  teams: TeamKontext[];
  users: BenutzerKonto[];
  memberships: TeamMitgliedschaft[];
  plugins: Array<{
    manifest: PluginManifest;
    enabledGlobally: boolean;
    source: string;
    releaseTag: string;
  }>;
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
  ): Promise<{ invitation: TeamEinladung }> {
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
    teamZuweisung?: { teamId: string; rolle: TeamRolle };
  }): Promise<{ user: BenutzerKonto; membership?: TeamMitgliedschaft }> {
    return apiRequest('/api/v1/sysadmin/users', {
      method: 'POST',
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
};
