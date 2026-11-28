import type {
  PluginManifest,
  PrivilegiertePluginPermission,
} from '../sdk/plugin.ts';
import type { PluginThemePreset } from '../shared/theme.ts';
import type {
  BenutzerKonto,
  ClubKontext,
  ClubRolle,
  ClubSpeicherStatus,
  NotificationEintrag,
  OeffentlicheEinladungInfo,
  PluginId,
  TeamKontext,
  TeamRolle,
} from '../shared/types.ts';

export interface PublicThemePluginDTO {
  pluginId: string;
  pluginName: string;
  themes: PluginThemePreset[];
}

export interface BootstrapStatusDTO {
  ersteinrichtungOffen: boolean;
  coreVersion: string;
  sdkVersion: string;
  defaultLocale: string;
  instanzTheme: string;
  pluginThemes: PublicThemePluginDTO[];
}

export interface SessionClubDTO extends ClubKontext {
  clubRolle: ClubRolle;
}

export interface SessionTeamDTO extends TeamKontext {
  effektiveTeamRolle: TeamRolle;
  istKaskadiertVonClubAdmin: boolean;
  groups: string[];
}

export interface AuthMeDTO {
  user: BenutzerKonto;
  clubs: SessionClubDTO[];
  teams: SessionTeamDTO[];
  scopeModules: {
    clubs: Record<string, PluginId[]>;
    teams: Record<string, PluginId[]>;
  };
  instanzTheme: string;
  pluginThemes: PublicThemePluginDTO[];
  ungeleseneNotifications: number;
}

export interface RuntimePluginClientDTO {
  pluginId: PluginId;
  version: string;
  manifest: PluginManifest;
  clientUrl: string;
  cssUrl?: string;
  cacheBuster?: string;
}

export interface RuntimeManifestDTO {
  installedPluginIds: PluginId[];
  enabledPluginIds: PluginId[];
  bundles: RuntimePluginClientDTO[];
}

export interface InstalliertesPluginDTO {
  pluginId: PluginId;
  version: string;
  previousVersion: string | null;
  manifest: PluginManifest;
  enabledGlobally: boolean;
  approvedCapabilities: PrivilegiertePluginPermission[];
  sourceUrl: string | null;
  sha256: string | null;
  installedAt: string;
  lastError: string | null;
}

export interface SystemStatusDTO {
  coreVersion: string;
  sdkVersion: string;
  dbDialekt: string;
  allowDevPlugins: boolean;
  storageProvider: {
    konfiguriert: boolean;
    pluginId?: string;
    providerId?: string;
    label?: string;
  };
  pluginsGesamt: number;
  pluginsAktiv: number;
  instanzTheme: string;
}

export class CoreApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'CoreApiError';
  }
}

let inMemoryBearerToken: string | null = null;

export function setzeBearerToken(token: string | null): void {
  inMemoryBearerToken = token;
}

async function apiJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Requested-With', 'SidelineOS-Core');
  if (inMemoryBearerToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryBearerToken}`);
  }

  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new CoreApiError(
      res.status,
      typeof data.fehler === 'string' ? data.fehler : `Anfrage fehlgeschlagen (HTTP ${res.status}).`,
      typeof data.code === 'string' ? data.code : undefined
    );
  }
  return data as T;
}

export function bauePluginApiFetch(baseUrl: string): (subPfad: string, init?: RequestInit) => Promise<Response> {
  return (subPfad: string, init: RequestInit = {}) => {
    const clean = subPfad.startsWith('/') ? subPfad : `/${subPfad}`;
    const headers = new Headers(init.headers);
    headers.set('X-Requested-With', 'SidelineOS-Core');
    if (inMemoryBearerToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${inMemoryBearerToken}`);
    }
    return fetch(`${baseUrl}${clean}`, {
      ...init,
      credentials: 'include',
      headers,
    });
  };
}

export const coreApi = {
  // Auth & Konto
  holeBootstrapStatus: () => apiJson<BootstrapStatusDTO>('/api/v2/auth/bootstrap-status'),
  erstelleErstAdmin: (body: {
    benutzername: string;
    vollerName: string;
    email: string;
    passwort: string;
  }) =>
    apiJson<{ user: BenutzerKonto; token: string }>('/api/v2/auth/bootstrap-admin', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (kennung: string, passwort: string) =>
    apiJson<{ user: BenutzerKonto; token: string }>('/api/v2/auth/login', {
      method: 'POST',
      body: JSON.stringify({ kennung, passwort }),
    }),
  logout: () => apiJson<{ ok: boolean }>('/api/v2/auth/logout', { method: 'POST' }),
  me: () => apiJson<AuthMeDTO>('/api/v2/auth/me'),
  aktualisiereProfil: (patch: {
    vollerName?: string;
    email?: string;
    preferredLocale?: string;
    preferredTheme?: string | null;
  }) =>
    apiJson<{ user: BenutzerKonto }>('/api/v2/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  aenderePasswort: (altesPasswort: string, neuesPasswort: string) =>
    apiJson<{ ok: boolean }>('/api/v2/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ altesPasswort, neuesPasswort }),
    }),
  pruefeEinladung: (token: string) =>
    apiJson<{ einladung: OeffentlicheEinladungInfo }>(
      `/api/v2/auth/invite/${encodeURIComponent(token)}`
    ),
  akzeptiereEinladung: (
    token: string,
    body: { benutzername: string; vollerName: string; email: string; passwort: string }
  ) =>
    apiJson<{ user: BenutzerKonto; token: string }>(
      `/api/v2/auth/invite/${encodeURIComponent(token)}/accept`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  // Notifications
  listeNotifications: (limit = 25) =>
    apiJson<{ notifications: NotificationEintrag[]; ungelesen: number }>(
      `/api/v2/notifications?limit=${limit}`
    ),
  markiereNotificationGelesen: (id: string) =>
    apiJson<{ ok: boolean; ungelesen: number }>(
      `/api/v2/notifications/${encodeURIComponent(id)}/read`,
      { method: 'POST' }
    ),
  markiereAlleNotificationsGelesen: () =>
    apiJson<{ ok: boolean; ungelesen: number }>('/api/v2/notifications/read-all', {
      method: 'POST',
    }),

  // Plugin-Runtime
  holeRuntimeManifest: () => apiJson<RuntimeManifestDTO>('/api/v2/plugins/runtime/manifest'),
  holePublicManifest: () =>
    apiJson<{ bundles: RuntimePluginClientDTO[] }>('/api/v2/plugins/runtime/public-manifest'),

  // Minimaler System-Notfall-Admin (/admin/system/recovery)
  holeSystemStatus: () => apiJson<SystemStatusDTO>('/api/v2/admin/system/status'),
  listeSystemPlugins: () =>
    apiJson<{ plugins: InstalliertesPluginDTO[] }>('/api/v2/admin/system/plugins'),
  installierePluginArchiv: (payload: {
    archiveBase64?: string;
    fileName?: string;
    archiveUrl?: string;
    autoEnable?: boolean;
    autoApproveCapabilities?: boolean;
  }) =>
    apiJson<{ plugin: InstalliertesPluginDTO }>('/api/v2/admin/system/plugins/install-archive', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  aktualisiereSystemPlugin: (
    pluginId: string,
    patch: { enabledGlobally?: boolean; approvedCapabilities?: PrivilegiertePluginPermission[] }
  ) =>
    apiJson<{ plugin: InstalliertesPluginDTO }>(
      `/api/v2/admin/system/plugins/${encodeURIComponent(pluginId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) }
    ),
  deinstalliereSystemPlugin: (pluginId: string) =>
    apiJson<{ ok: boolean }>(`/api/v2/admin/system/plugins/${encodeURIComponent(pluginId)}`, {
      method: 'DELETE',
    }),
  setzeInstanzTheme: (instanzTheme: string) =>
    apiJson<{ instanzTheme: string }>('/api/v2/admin/system/theme', {
      method: 'PUT',
      body: JSON.stringify({ instanzTheme }),
    }),
  listeClubsSpeicher: () =>
    apiJson<{
      clubs: Array<{ id: string; slug: string; name: string; speicher: ClubSpeicherStatus }>;
    }>('/api/v2/admin/system/clubs-storage'),
};
