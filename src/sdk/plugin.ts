import type { ComponentType } from 'react';
import type { UnterstuetzteSprache } from '../shared/i18n.ts';
import type { PluginThemePreset } from '../shared/theme.ts';
import type {
  BenutzerKonto,
  ClubKontext,
  ClubMitgliedschaft,
  ClubRolle,
  ClubSpeicherStatus,
  EinladungEintrag,
  NotificationPrioritaet,
  PluginId,
  ScopeTyp,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
  TeamStatus,
} from '../shared/types.ts';

export type { PluginThemePreset } from '../shared/theme.ts';
export type {
  BenutzerKonto,
  ClubKontext,
  ClubMitgliedschaft,
  ClubRolle,
  ClubSpeicherStatus,
  EinladungEintrag,
  NotificationPrioritaet,
  PluginId,
  ScopeTyp,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
  TeamStatus,
} from '../shared/types.ts';

export const SIDELINE_SDK_VERSION = '2.0' as const;
export type PluginSdkVersion = typeof SIDELINE_SDK_VERSION;

export type PluginIconName =
  | 'film'
  | 'book-open'
  | 'clipboard-check'
  | 'layers'
  | 'puzzle'
  | 'users'
  | 'hard-drive'
  | 'mail'
  | 'store'
  | 'git-branch'
  | 'shield';

/** Standard-Berechtigungen (sofort mit Installation verfügbar). */
export type StandardPluginPermission =
  | 'db:plugin-schema'
  | 'storage:team-rw'
  | 'storage:club-rw'
  | 'notifications:send'
  | 'notifications:channel'
  | 'share:public-links'
  | 'theme:presets'
  | 'ui:account-panel'
  | 'ui:club-panel'
  | 'ui:system-panel';

/**
 * Privilegierte System-Capabilities (erfordern explizite Sysadmin-Freigabe).
 * Kein Plugin erhält jemals direkten SQL-Zugriff auf das Schema `core`.
 */
export type PrivilegiertePluginPermission =
  | 'storage:provider'
  | 'core:org-manage'
  | 'core:users-manage'
  | 'core:plugins-manage'
  | 'core:storage-quota-manage'
  | 'core:storage-nodes-manage'
  | 'dev:git-install';

export type PluginPermission = StandardPluginPermission | PrivilegiertePluginPermission;

export const PRIVILEGIERTE_CAPABILITIES: readonly PrivilegiertePluginPermission[] = [
  'storage:provider',
  'core:org-manage',
  'core:users-manage',
  'core:plugins-manage',
  'core:storage-quota-manage',
  'core:storage-nodes-manage',
  'dev:git-install',
];

export function istPrivilegierteCapability(
  permission: PluginPermission
): permission is PrivilegiertePluginPermission {
  return (PRIVILEGIERTE_CAPABILITIES as readonly string[]).includes(permission);
}

// ============================================================================
// Verbindlicher 4-Ebenen-Navigations- & Menü-Vertrag (SDK v2.0)
// ============================================================================

export type PluginSurfaceTyp = 'app' | 'headless' | 'system';
export type PluginScopeEbene = 'club' | 'team' | 'global';
export type SettingsPanelZiel = 'account' | 'club' | 'system';

/** Ebene-2-Eintrag in der einheitlichen linken Kontext-Sidebar. */
export interface PluginSidebarItem {
  id: string;
  label: string;
  routeSegment: string;
  requiredClubRoles?: ClubRolle[];
  requiredTeamRoles?: TeamRolle[];
  badgeKey?: string;
}

/** Max. 3 Gruppen pro Plugin in der Kontext-Sidebar. */
export interface PluginSidebarGroup {
  id: string;
  label: string;
  items: PluginSidebarItem[];
}

/** Registrierung eines Panels in /settings/account/*, /admin/club/* oder /admin/system/*. */
export interface PluginSettingsPanelDef {
  id: string;
  target: SettingsPanelZiel;
  group: string;
  label: string;
  routeSegment: string;
  requiredClubRoles?: ClubRolle[];
  requiredTeamRoles?: TeamRolle[];
}

export interface PluginNavigationManifest {
  /** 'app' = Kachel auf Start-Hub; 'headless'/'system' = kein Hub-Eintrag. */
  surface: PluginSurfaceTyp;
  /** Auf welcher Ebene das Plugin aktiviert und geöffnet wird. */
  scopes: PluginScopeEbene[];
  /** Ebene-2-Navigation in der einheitlichen Kontext-Sidebar (echte URL-Routen). */
  sidebarGroups?: PluginSidebarGroup[];
  /** Panels für Konto-, Vereins- oder System-Administration. */
  settingsPanels?: PluginSettingsPanelDef[];
}

export interface PluginManifest {
  id: PluginId;
  name: string;
  kurzbeschreibung: string;
  version: string;
  sdkVersion: PluginSdkVersion;
  minCoreVersion: string;
  icon: PluginIconName;
  permissions: PluginPermission[];
  navigation: PluginNavigationManifest;
  storagePrefix?: string;
  repositoryUrl?: string;
  author?: string;
  themes?: PluginThemePreset[];
}

// ============================================================================
// Virtueller Storage-Broker & Multi-Node Storage-Provider (#21, #22, #24)
// ============================================================================

export interface StorageMultipartPartRef {
  partNumber: number;
  etag: string;
}

export interface StoragePresignUploadParams {
  objectPath: string;
  contentType?: string;
  fileSizeBytes?: number;
  expiresInSeconds?: number;
}

export interface StoragePresignDownloadParams {
  objectPath: string;
  expiresInSeconds?: number;
}

/** Speicherort-agnostischer Scope für Fach-Plugins (Core erzwingt Präfix, Archiv- & Quota-Regeln). */
export interface PluginStorageScope {
  readonly prefix: string;
  getSignedUploadUrl(
    params: StoragePresignUploadParams
  ): Promise<{ url: string; key: string; expiresIn: number }>;
  getSignedDownloadUrl(
    params: StoragePresignDownloadParams
  ): Promise<{ url: string; key: string; expiresIn: number }>;
  initiateMultipartUpload(params: {
    objectPath: string;
    contentType?: string;
    fileSizeBytes?: number;
  }): Promise<{ uploadId: string; key: string; maxFileSizeBytes: number }>;
  getSignedMultipartPartUrl(params: {
    objectPath: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds?: number;
  }): Promise<{ url: string; key: string; partNumber: number; expiresIn: number }>;
  completeMultipartUpload(params: {
    objectPath: string;
    uploadId: string;
    parts: StorageMultipartPartRef[];
  }): Promise<{ key: string; etag?: string; location?: string }>;
  abortMultipartUpload(params: { objectPath: string; uploadId: string }): Promise<void>;
  deleteObject(objectPath: string, estimatedBytes?: number): Promise<void>;
}

/**
 * Provider-Interface für ein `storage:provider`-Plugin (z. B. `SidelineOS-storage-s3`).
 * Unterstützt virtuelles Multi-Node-Routing über `nodeId` (#22).
 */
export interface StorageProviderAdapter {
  readonly providerId: string;
  readonly label: string;
  presignUpload(params: {
    nodeId: string;
    key: string;
    contentType?: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; key: string; expiresIn: number }>;
  presignDownload(params: {
    nodeId: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; key: string; expiresIn: number }>;
  initiateMultipartUpload(params: {
    nodeId: string;
    key: string;
    contentType?: string;
  }): Promise<{ uploadId: string; key: string }>;
  presignMultipartPart(params: {
    nodeId: string;
    key: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; key: string; partNumber: number; expiresIn: number }>;
  completeMultipartUpload(params: {
    nodeId: string;
    key: string;
    uploadId: string;
    parts: StorageMultipartPartRef[];
  }): Promise<{ key: string; etag?: string; location?: string }>;
  abortMultipartUpload(params: {
    nodeId: string;
    key: string;
    uploadId: string;
  }): Promise<void>;
  deleteObject(params: { nodeId: string; key: string }): Promise<void>;
  healthCheck?(nodeId?: string): Promise<{ ok: boolean; nachricht: string }>;
}

// ============================================================================
// Notification-Dispatcher & Channel-Plugins (`SidelineOS-channel-smtp`, etc.)
// ============================================================================

export interface NotificationEmpfaengerInfo {
  uuid: string;
  vollerName: string;
  benutzername: string;
  email: string;
  preferredLocale: UnterstuetzteSprache;
}

export interface NotificationPayload {
  eventType: string;
  title: string;
  message: string;
  linkPath?: string;
  priority?: NotificationPrioritaet;
  recipientUserUuids?: string[];
  channels?: string[];
  metadata?: Record<string, unknown>;
}

export interface NotificationDispatchEvent {
  eventType: string;
  title: string;
  message: string;
  linkPath?: string;
  priority: NotificationPrioritaet;
  sourcePluginId: string;
  clubId?: string;
  teamId?: string;
  recipients: NotificationEmpfaengerInfo[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationChannelErgebnis {
  channelId: string;
  providerPluginId: string;
  status: 'sent' | 'skipped' | 'failed';
  delivered: number;
  error?: string;
}

export interface NotificationDispatchErgebnis {
  notificationIds: string[];
  recipientCount: number;
  channelResults: NotificationChannelErgebnis[];
}

export interface PluginNotificationChannelDef {
  id: string;
  label: string;
  description?: string;
  /** Wenn true, wird der Kanal nur versendet, wenn er explizit angefordert wird oder für System-Events aktiv ist. */
  explicitOnly?: boolean;
}

export interface PluginNotificationChannelInfo {
  id: string;
  label: string;
  description?: string;
  providerPluginId: string;
  aktiv: boolean;
}

export interface PluginNotificationScope {
  send(payload: NotificationPayload): Promise<NotificationDispatchErgebnis>;
  listChannels(): Promise<PluginNotificationChannelInfo[]>;
}

// ============================================================================
// Privilegierte Core-Admin-Scopes (ersetzen direkten Zugriff auf core.*)
// ============================================================================

export interface PluginCoreOrgScope {
  listClubs(): Promise<ClubKontext[]>;
  createClub(input: { slug: string; name: string; metadata?: Record<string, unknown> }): Promise<ClubKontext>;
  updateClub(clubId: string, patch: { name?: string; metadata?: Record<string, unknown> }): Promise<ClubKontext | null>;
  listTeams(clubId: string, optionen?: { includeArchived?: boolean }): Promise<TeamKontext[]>;
  createTeam(input: {
    clubId: string;
    slug: string;
    name: string;
    akzentFarbe?: string;
    metadata?: Record<string, unknown>;
  }): Promise<TeamKontext>;
  updateTeam(
    teamId: string,
    patch: { name?: string; akzentFarbe?: string; metadata?: Record<string, unknown> }
  ): Promise<TeamKontext | null>;
  setTeamStatus(teamId: string, status: TeamStatus): Promise<TeamKontext | null>;
  listClubMembers(clubId: string): Promise<Array<ClubMitgliedschaft & { user: BenutzerKonto }>>;
  upsertClubMembership(input: {
    userUuid: string;
    clubId: string;
    rolle: ClubRolle;
    status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  }): Promise<ClubMitgliedschaft>;
  listTeamMembers(teamId: string): Promise<Array<TeamMitgliedschaft & { user: BenutzerKonto }>>;
  upsertTeamMembership(input: {
    userUuid: string;
    teamId: string;
    rolle: TeamRolle;
    groups?: string[];
    status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  }): Promise<TeamMitgliedschaft>;
  createInvitation(input: {
    clubId: string;
    teamId?: string | null;
    clubRolle?: ClubRolle;
    teamRolle?: TeamRolle;
    groups?: string[];
    zielEmail?: string;
    bestaetigungErforderlich?: boolean;
    gueltigBis: string;
  }): Promise<{ einladung: EinladungEintrag; token: string; pfad: string }>;
  listInvitations(clubId: string): Promise<EinladungEintrag[]>;
  revokeInvitation(invitationId: string): Promise<boolean>;
}

export interface PluginCoreUsersScope {
  listUsers(): Promise<BenutzerKonto[]>;
  findUser(userUuid: string): Promise<BenutzerKonto | null>;
  createUser(input: {
    benutzername: string;
    vollerName: string;
    email: string;
    passwort: string;
    istSysadmin?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<BenutzerKonto>;
  updateUser(
    userUuid: string,
    patch: { vollerName?: string; email?: string; istSysadmin?: boolean; metadata?: Record<string, unknown> }
  ): Promise<BenutzerKonto | null>;
}

export interface PluginCorePluginsScope {
  listInstalled(): Promise<
    Array<{
      pluginId: PluginId;
      version: string;
      enabledGlobally: boolean;
      approvedCapabilities: PrivilegiertePluginPermission[];
      manifest: PluginManifest;
      lastError?: string | null;
    }>
  >;
  setEnabledGlobally(pluginId: PluginId, enabled: boolean): Promise<boolean>;
  setScopeModuleEnabled(scopeTyp: ScopeTyp, scopeId: string, pluginId: PluginId, enabled: boolean): Promise<void>;
  listScopeModules(scopeTyp: ScopeTyp, scopeId: string): Promise<PluginId[]>;
  installArchiveBuffer(archiveBuffer: Uint8Array, sourceLabel?: string): Promise<{ pluginId: PluginId; version: string }>;
  installArchiveUrl(archiveUrl: string): Promise<{ pluginId: PluginId; version: string }>;
  uninstall(pluginId: PluginId): Promise<boolean>;
}

export interface PluginCoreStorageQuotaScope {
  getClubStorage(clubId: string): Promise<ClubSpeicherStatus | null>;
  setClubQuota(
    clubId: string,
    params: { quotaBytes: number | null; softLimitPercent?: number }
  ): Promise<ClubSpeicherStatus | null>;
  reconcileClubUsage(clubId: string, exactUsedBytes: number): Promise<ClubSpeicherStatus | null>;
}

export interface PluginCoreStorageNodesScope {
  getClubNode(clubId: string): Promise<string | null>;
  assignClubNode(clubId: string, nodeId: string): Promise<ClubSpeicherStatus | null>;
}

export interface PluginCoreAdminScope {
  org?: PluginCoreOrgScope;
  users?: PluginCoreUsersScope;
  plugins?: PluginCorePluginsScope;
  storageQuota?: PluginCoreStorageQuotaScope;
  storageNodes?: PluginCoreStorageNodesScope;
}

// ============================================================================
// Frontend- & Backend-Plugin-Definitionen (SDK v2.0)
// ============================================================================

export interface PluginLaufzeitKontext {
  pluginId: PluginId;
  club: ClubKontext | null;
  team: TeamKontext | null;
  isReadOnly: boolean;
  clubRolle: ClubRolle | null;
  effektiveTeamRolle: TeamRolle | null;
  user: BenutzerKonto;
  userGroups: string[];
  activeView: string;
  navigateToView: (routeSegment: string) => void;
  locale: UnterstuetzteSprache;
  apiBaseUrl: string;
  apiFetch: (subPfad: string, init?: RequestInit) => Promise<Response>;
}

export interface PluginAnsichtProps {
  ctx: PluginLaufzeitKontext;
}

export interface PluginSettingsPanelProps {
  panelId: string;
  target: SettingsPanelZiel;
  club: ClubKontext | null;
  team: TeamKontext | null;
  user: BenutzerKonto;
  locale: UnterstuetzteSprache;
  apiFetch: (subPfad: string, init?: RequestInit) => Promise<Response>;
  onContextRefresh: () => Promise<void>;
}

export interface SidelinePlugin {
  manifest: PluginManifest;
  HauptAnsicht?: ComponentType<PluginAnsichtProps>;
  OeffentlicheAnsicht?: ComponentType<{ token: string; locale: UnterstuetzteSprache }>;
  SettingsPanel?: ComponentType<PluginSettingsPanelProps>;
}

export interface PluginSqlMigration {
  name: string;
  sql: string;
}

export interface PluginDbScope {
  readonly schemaName: string;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

export interface PluginBackendAnfrage {
  method: string;
  path: string;
  scope: 'team' | 'club' | 'system';
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
}

export interface PluginBackendAntwort {
  status: number;
  body: unknown;
}

export interface PluginBackendKontext {
  pluginId: PluginId;
  manifest: PluginManifest;
  db: PluginDbScope;
  storage?: PluginStorageScope;
  notifications?: PluginNotificationScope;
  coreAdmin?: PluginCoreAdminScope;
  user: BenutzerKonto;
  locale: UnterstuetzteSprache;
  club: ClubKontext | null;
  team: TeamKontext | null;
  isReadOnly: boolean;
  clubRolle: ClubRolle | null;
  effektiveTeamRolle: TeamRolle | null;
  userGroups: string[];
  hasPermission(permission: PluginPermission): boolean;
  hasApprovedCapability(capability: PrivilegiertePluginPermission): boolean;
}

export interface PluginPublicKontext {
  pluginId: PluginId;
  manifest: PluginManifest;
  getSignedDownloadUrlForTeam?: (params: {
    teamId: string;
    objectPath: string;
    expiresInSeconds?: number;
  }) => Promise<{ url: string; key: string; expiresIn: number }>;
}

export interface SidelineBackendPlugin {
  manifest: PluginManifest;
  migrations?: PluginSqlMigration[];
  storageProvider?: StorageProviderAdapter;
  notificationChannels?: PluginNotificationChannelDef[];
  deliverNotification?: (
    event: NotificationDispatchEvent,
    ctx: { pluginId: PluginId; manifest: PluginManifest; channelId: string; db: PluginDbScope }
  ) => Promise<{ delivered: number; error?: string }>;
  handleRequest?: (
    req: PluginBackendAnfrage,
    ctx: PluginBackendKontext
  ) => Promise<PluginBackendAntwort>;
  handlePublicRequest?: (
    req: Omit<PluginBackendAnfrage, 'params' | 'scope'>,
    db: PluginDbScope,
    publicCtx: PluginPublicKontext
  ) => Promise<PluginBackendAntwort>;
}

export function definierePlugin(plugin: SidelinePlugin): SidelinePlugin {
  return plugin;
}

export function definiereBackendPlugin(plugin: SidelineBackendPlugin): SidelineBackendPlugin {
  return plugin;
}
