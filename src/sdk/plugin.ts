import type { ComponentType, ReactNode } from 'react';
import type { UnterstuetzteSprache } from '../shared/i18n.ts';
import type {
  BenutzerKonto,
  PluginId,
  S3Konfiguration,
  TeamKontext,
  TeamRolle,
} from '../shared/types.ts';

export type {
  BenutzerKonto,
  PluginId,
  S3Konfiguration,
  TeamKontext,
  TeamRolle,
} from '../shared/types.ts';

export type {
  SprachPaket,
  SprachWoerterbuecher,
  UnterstuetzteSprache,
} from '../shared/i18n.ts';

export type { BrandKonfiguration } from '../shared/brand.ts';
export { holeAktuelleBrandKonfig, teileWortmarke } from '../shared/brand.ts';
export { createPluginTranslator, uebersetzeSchluessel } from '../shared/i18n.ts';

/**
 * Granulare Berechtigungen, die ein externes Plugin in seinem `plugin.manifest.json`
 * anfordern muss. Der SidelineOS-Core erzwingt diese Grenzen serverseitig.
 */
export type PluginPermission =
  | 'team:read'
  | 'team:roster-read'
  | 's3:team-rw'
  | 's3:cleanup-queue'
  | 'db:plugin-tables'
  | 'share:public-links'
  | 'notifications:send'
  | 'notifications:channel';

export type PluginIconName = 'film' | 'book-open' | 'clipboard-check' | 'layers' | 'puzzle';

export interface PluginSettingsAnker {
  id: string;
  label: string;
  badge?: number;
}

/**
 * Deklaratives Manifest jedes externen SidelineOS-Plugins (`plugin.manifest.json`).
 * Kann ohne Laden von JavaScript-Code im Plugin-Store und in den Core-Einstellungen gelesen werden.
 */
export interface PluginManifest {
  id: PluginId;
  name: string;
  kurzbeschreibung: string;
  /** Basisversion im Paket (wird bei GitHub-Release vom Tag bzw. bei Dev-Git als <branch>-<commit> überschrieben) */
  version: string;
  /** SDK-Schnittstellen-Version (Major.Minor, aktuell "1.0") */
  sdkVersion: '1.0' | (string & {});
  /** Minimale kompatible Core-SemVer-Version (optional, z. B. "0.1.0-alpha.1") */
  minCoreVersion?: string;
  /** Maximale kompatible Core-SemVer-Version (optional, z. B. "0.99.99") */
  maxCoreVersion?: string;
  autor: string;
  repositoryUrl: string;
  icon: PluginIconName;
  status: 'AKTIV' | 'VORSCHAU';
  standardAktiviert: boolean;
  permissions: PluginPermission[];
  /** Isoliertes Datenbank-Präfix für Tabellen dieses Plugins (z. B. "mod_video_") */
  dbPrefix: string;
  /** Isolierter S3-Schlüssel-Präfix pro Team (z. B. "plugins/video-analysis/") */
  s3Prefix?: string;
  /** Kategorien, die das Plugin in die zentralen Core-Einstellungen einhängt */
  settingsAnker: {
    user?: PluginSettingsAnker[];
    team?: PluginSettingsAnker[];
    sysadmin?: PluginSettingsAnker[];
  };
}

export interface PluginTab {
  id: string;
  label: string;
}

/**
 * Laufzeit-Kontext, den der SidelineOS-Core an die Hauptansicht eines Plugins übergibt.
 */
export interface PluginLaufzeitKontext {
  team: TeamKontext;
  aktiveTeamAnsicht: TeamRolle;
  gewaehlteSaison: string;
  benutzer: BenutzerKonto;
  locale: string;
  aktuellerTab: string;
  onTabWechseln: (tabId: string) => void;
  onTeamSettingsOeffnen: () => void;
  onZurueckZurStartseite: () => void;
  onPublicShareOeffnen?: (token: string) => void;
}

/**
 * Kontext für vom Plugin bereitgestellte Einstellungs-Panels (Persönlich / Team / Sysadmin).
 */
export interface PluginSettingsKontext {
  team: TeamKontext;
  benutzer: BenutzerKonto;
  aktiveTeamAnsicht: TeamRolle | null;
  s3Konfig: S3Konfiguration;
  locale: string;
}

/**
 * Isolierter Datenbank-Zugriff für ein externes Plugin (`plugin_<slug>`-Schema).
 * Der Core injiziert diese Schnittstelle, damit Plugins keine Core-Tabellen oder fremde Plugins sehen.
 */
export interface PluginDbScope {
  readonly schemaName: string;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
}

/**
 * Isolierter S3-Zugriff für ein externes Plugin innerhalb seines Team-Präfixes
 * (`teams/<teamId>/<s3Prefix>`). Der Core prüft Rechte und signiert Presigned URLs.
 */
export interface S3MultipartPartRef {
  partNumber: number;
  etag: string;
}

export interface PluginS3Scope {
  readonly prefix: string;
  getSignedUploadUrl(params: {
    objectPath: string;
    contentType?: string;
    fileSizeBytes?: number;
    expiresInSeconds?: number;
  }): Promise<{ url: string; key: string; expiresIn: number }>;
  getSignedDownloadUrl(params: {
    objectPath: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; key: string; expiresIn: number }>;
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
    parts: S3MultipartPartRef[];
  }): Promise<{ key: string; etag?: string; location?: string }>;
  abortMultipartUpload(params: { objectPath: string; uploadId: string }): Promise<void>;
  deleteObject(objectPath: string): Promise<void>;
}

/**
 * Isolierter S3-Cleanup-Queue-Zugriff für ein externes Plugin (`s3:cleanup-queue`).
 * Das Plugin meldet lediglich verwaiste Objektpfade aus seinem eigenen Team-Präfix.
 */
export interface PluginCleanupQueueScope {
  enqueueOrphanedObjects(objectPaths: string[], reason?: string): Promise<{ queued: number }>;
}

/**
 * Ziel-Adressierung für Team-übergreifende Abfragen (Phase 4 Federation & Phase 5 Camp-Modus).
 */
export type ExchangeTarget =
  | { mode: 'LOCAL'; teamId: string }
  | { mode: 'REMOTE'; instanceId: string; teamId: string };

export interface PluginScopeItem {
  id: string;
  title: string;
  season?: string;
  updatedAt: string;
  assetKeys?: string[];
}

export interface PluginExportScopeResult {
  schemaVersion: string;
  pluginId: PluginId;
  items: PluginScopeItem[];
  payload: unknown;
  assetKeys: string[];
}

export type NotificationPrioritaet = 'info' | 'warning' | 'urgent';

export interface PluginNotificationChannel {
  id: string;
  label: string;
  description?: string;
}

export interface PluginNotificationChannelInfo extends PluginNotificationChannel {
  providerPluginId: string;
  aktiv: boolean;
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

export interface NotificationEmpfaengerInfo {
  uuid: string;
  vollerName: string;
  benutzername: string;
  preferredLocale: string;
}

export interface NotificationDispatchEvent {
  eventType: string;
  title: string;
  message: string;
  linkPath?: string;
  priority: NotificationPrioritaet;
  sourcePluginId: string;
  teamId?: string;
  teamName?: string;
  recipients: NotificationEmpfaengerInfo[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PluginNotificationChannelKontext {
  readonly pluginId: PluginId;
  readonly manifest: PluginManifest;
  readonly channelId: string;
  readonly db: PluginDbScope;
  readonly team?: TeamKontext;
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

export interface PluginNotificationScope {
  send(payload: NotificationPayload): Promise<NotificationDispatchErgebnis>;
  listChannels(): Promise<PluginNotificationChannelInfo[]>;
}

/**
 * Laufzeit-Kontext für Plugin-Backend-Routen nach erfolgreicher Core-Auth-, Team- und Scope-Prüfung.
 */
export interface PluginBackendKontext {
  readonly pluginId: PluginId;
  readonly manifest: PluginManifest;
  readonly db: PluginDbScope;
  readonly s3?: PluginS3Scope;
  readonly cleanupQueue?: PluginCleanupQueueScope;
  readonly notifications?: PluginNotificationScope;
  readonly user: BenutzerKonto;
  readonly locale: string;
  readonly team: TeamKontext;
  readonly teamRolle: TeamRolle;
  hasPermission(permission: PluginPermission): boolean;
}

/**
 * Verbindlicher Backend-Vertrag eines Plugins (optional für reine Frontend-Prototypen).
 */
export interface SidelineBackendPlugin {
  readonly manifest: PluginManifest;
  readonly migrations?: Array<{ name: string; sql: string }>;
  readonly notificationChannels?: PluginNotificationChannel[];
  deliverNotification?: (
    event: NotificationDispatchEvent,
    ctx: PluginNotificationChannelKontext
  ) => Promise<{ delivered: number; error?: string }>;
  handleRequest?: (
    req: {
      method: string;
      path: string;
      params: Record<string, string>;
      query: Record<string, unknown>;
      body: unknown;
    },
    ctx: PluginBackendKontext
  ) => Promise<{ status: number; body: unknown }>;
  handlePublicRequest?: (
    req: {
      method: string;
      path: string;
      query: Record<string, unknown>;
      body: unknown;
    },
    db: PluginDbScope
  ) => Promise<{ status: number; body: unknown }>;
  listExportableItems?: (
    ctx: PluginBackendKontext,
    options?: { season?: string }
  ) => Promise<PluginScopeItem[]>;
  exportScope?: (
    ctx: PluginBackendKontext,
    options?: { itemIds?: string[]; season?: string }
  ) => Promise<PluginExportScopeResult>;
  importScope?: (
    ctx: PluginBackendKontext,
    bundle: PluginExportScopeResult,
    options?: { mode: 'replace' | 'merge' }
  ) => Promise<{ imported: number; skipped: number }>;
}

/**
 * Verbindlicher Plugin-Vertrag (`@sidelineos/plugin-sdk`).
 * Jedes externe GitHub-Modul implementiert genau dieses Interface.
 */
export interface SidelinePlugin {
  manifest: PluginManifest;
  /** Optionaler State-Provider des Plugins (kapselt Modul-Zustand vollständig vom Core) */
  Provider?: ComponentType<{ children: ReactNode }>;
  defaultTab: string;
  getTabs: (ctx: { teamRolle: TeamRolle; locale?: string }) => PluginTab[];
  /** Optionale Primäraktion rechts in der TopBar (als eigenständige React-Komponente) */
  PrimaerAktion?: ComponentType<{ ctx: PluginLaufzeitKontext; className: string }>;
  renderMainView: (ctx: PluginLaufzeitKontext) => ReactNode;
  /** Optionaler öffentlicher Empfänger-View für /share/<token> ohne Anmeldung */
  renderPublicShareView?: (ctx: {
    token: string;
    locale?: string;
    onSchliessen: () => void;
  }) => ReactNode;
  settingsPanels?: {
    user?: ComponentType<{ ctx: PluginSettingsKontext }>;
    team?: ComponentType<{ ctx: PluginSettingsKontext }>;
    sysadmin?: ComponentType<{ ctx: PluginSettingsKontext }>;
  };
}

/**
 * Eintrag im SidelineOS Plugin Store (Katalog oder manuell eingebundenes GitHub-Repo).
 */
export interface PluginStoreEintrag {
  manifest: PluginManifest;
  quelle: 'OFFICIAL_GITHUB' | 'CUSTOM_GITHUB';
  verifiziert: boolean;
  releaseTag: string;
  paketFormat: 'sideline-plugin-v1';
}

export const PERMISSION_BESCHREIBUNGEN: Record<PluginPermission, string> = {
  'team:read': 'Liest Team-Stammdaten, Saisons und aktive Rolle',
  'team:roster-read': 'Liest Kaderliste, Units und Spieler-Profile des Teams',
  's3:team-rw': 'Speichert/streamt Dateien im eigenen S3-Team-Präfix',
  's3:cleanup-queue': 'Registriert verwaiste S3-Objekte in der Sysadmin-Schonfrist',
  'db:plugin-tables': 'Verwaltet eigene isolierte PostgreSQL-Tabellen',
  'share:public-links': 'Erzeugt zeitlich befristete öffentliche /share/-Links',
  'notifications:send': 'Löst Benachrichtigungen über den Core-Notification-Endpunkt aus',
  'notifications:channel': 'Registriert einen eigenen Zustellweg (z. B. Push/Webhook) für Core-Benachrichtigungen',
};

export const PERMISSION_BESCHREIBUNGEN_I18N: Record<
  UnterstuetzteSprache,
  Record<PluginPermission, string>
> = {
  de: PERMISSION_BESCHREIBUNGEN,
  en: {
    'team:read': 'Reads team metadata, seasons, and active role',
    'team:roster-read': 'Reads roster members, units, and player profiles',
    's3:team-rw': 'Stores/streams files within the plugin S3 team prefix',
    's3:cleanup-queue': 'Registers orphaned S3 objects in the sysadmin retention queue',
    'db:plugin-tables': 'Manages isolated PostgreSQL plugin tables',
    'share:public-links': 'Creates time-limited public /share/ links',
    'notifications:send': 'Triggers notifications via the core notification endpoint',
    'notifications:channel': 'Provides an external delivery channel (e.g. push/webhook) for core notifications',
  },
};

export function holePermissionBeschreibung(
  permission: PluginPermission,
  locale?: string
): string {
  const code: UnterstuetzteSprache = locale === 'en' ? 'en' : 'de';
  return PERMISSION_BESCHREIBUNGEN_I18N[code][permission];
}

/**
 * Ermittelt die zugehörige Saison eines saisongebundenen Eintrags (Fallback: Jahr aus eventDate).
 */
export function ermittleEintragSaison(eintrag: {
  saison?: string;
  eventDate: string;
}): string {
  const explizit = eintrag.saison?.trim();
  if (explizit) return explizit;
  return eintrag.eventDate.slice(0, 4);
}

/**
 * Filtert saisongebundene Plugin-Daten nach gewählter Saison ("ALL" gibt alles zurück).
 */
export function filtereNachSaison<T extends { saison?: string; eventDate: string }>(
  eintraege: readonly T[],
  saison: string
): T[] {
  if (!saison || saison === 'ALL') return [...eintraege];
  return eintraege.filter((eintrag) => ermittleEintragSaison(eintrag) === saison);
}

