import type { ComponentType, ReactNode } from 'react';
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
  | 'share:public-links';

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
  version: string;
  sdkVersion: '1.0';
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
export interface PluginS3Scope {
  readonly prefix: string;
  getSignedUploadUrl(params: {
    objectPath: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; key: string; expiresIn: number }>;
  getSignedDownloadUrl(params: {
    objectPath: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; key: string; expiresIn: number }>;
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

/**
 * Laufzeit-Kontext für Plugin-Backend-Routen nach erfolgreicher Core-Auth-, Team- und Scope-Prüfung.
 */
export interface PluginBackendKontext {
  readonly pluginId: PluginId;
  readonly manifest: PluginManifest;
  readonly db: PluginDbScope;
  readonly s3?: PluginS3Scope;
  readonly cleanupQueue?: PluginCleanupQueueScope;
  readonly user: BenutzerKonto;
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
  getTabs: (ctx: { teamRolle: TeamRolle }) => PluginTab[];
  /** Optionale Primäraktion rechts in der TopBar (als eigenständige React-Komponente) */
  PrimaerAktion?: ComponentType<{ ctx: PluginLaufzeitKontext; className: string }>;
  renderMainView: (ctx: PluginLaufzeitKontext) => ReactNode;
  /** Optionaler öffentlicher Empfänger-View für /share/<token> ohne Anmeldung */
  renderPublicShareView?: (ctx: { token: string; onSchliessen: () => void }) => ReactNode;
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
};

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

