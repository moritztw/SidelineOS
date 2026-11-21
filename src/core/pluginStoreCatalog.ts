import type { PluginManifest, PluginStoreEintrag } from '../sdk/plugin.ts';

export const VIDEO_STORE_MANIFEST: PluginManifest = {
  id: 'video-analysis',
  name: 'Videoanalyse',
  kurzbeschreibung:
    'Multi-Angle Film Room, exakte Frame-Telestration, Hudl-kompatibles Breakdown-Tagging, Team-Sharing und JSON-Import.',
  version: '0.2.0',
  sdkVersion: '1.0',
  autor: 'SidelineOS Core Team',
  repositoryUrl: 'https://github.com/sidelineos/sidelineos-plugin-video',
  icon: 'film',
  status: 'AKTIV',
  standardAktiviert: true,
  permissions: [
    'team:read',
    's3:team-rw',
    's3:cleanup-queue',
    'db:plugin-tables',
    'share:public-links',
  ],
  dbPrefix: 'mod_video_',
  s3Prefix: 'plugins/video-analysis/',
  settingsAnker: {
    user: [
      { id: 'modul-video-hotkeys', label: 'Film-Room-Hotkeys' },
      { id: 'modul-video-player', label: 'Player-Voreinstellungen' },
    ],
    team: [{ id: 'modul-video-tagging', label: 'Tagging-Schema & Wörterbuch' }],
    sysadmin: [{ id: 'modul-video-cleanup', label: 'S3-Cleanup & Schonfrist' }],
  },
};

export const PLAYBOOK_MANIFEST: PluginManifest = {
  id: 'playbook',
  name: 'Playbook & Install',
  kurzbeschreibung:
    'Digitales Playbook mit Formations-Bibliothek, Installations-Wochenplänen und Spielzug-Quiz für Spieler.',
  version: '0.1.0-preview',
  sdkVersion: '1.0',
  autor: 'SidelineOS Core Team',
  repositoryUrl: 'https://github.com/sidelineos/sidelineos-plugin-playbook',
  icon: 'book-open',
  status: 'VORSCHAU',
  standardAktiviert: true,
  permissions: ['team:read', 's3:team-rw', 'db:plugin-tables'],
  dbPrefix: 'mod_playbook_',
  s3Prefix: 'plugins/playbook/',
  settingsAnker: {},
};

export const ROSTER_ATTENDANCE_MANIFEST: PluginManifest = {
  id: 'roster-attendance',
  name: 'Roster & Anwesenheit',
  kurzbeschreibung:
    'Trainings-Check-in, Depth Chart nach Units, Verletzungsstatus und Kader-Export für Spieltage.',
  version: '0.1.0-preview',
  sdkVersion: '1.0',
  autor: 'SidelineOS Core Team',
  repositoryUrl: 'https://github.com/sidelineos/sidelineos-plugin-roster',
  icon: 'clipboard-check',
  status: 'VORSCHAU',
  standardAktiviert: false,
  permissions: ['team:read', 'team:roster-read', 'db:plugin-tables'],
  dbPrefix: 'mod_roster_',
  settingsAnker: {},
};

/**
 * Kuratierter Katalog offizieller SidelineOS-Plugins (jeweils eigenes GitHub-Repository).
 * Bewusst ohne Laufzeit-Import aus `src/plugins/`, damit Core und Plugins entkoppelt bleiben.
 */
export const OFFIZIELLER_PLUGIN_KATALOG: PluginStoreEintrag[] = [
  {
    manifest: VIDEO_STORE_MANIFEST,
    quelle: 'OFFICIAL_GITHUB',
    verifiziert: true,
    releaseTag: 'v0.2.0',
    paketFormat: 'sideline-plugin-v1',
  },
  {
    manifest: PLAYBOOK_MANIFEST,
    quelle: 'OFFICIAL_GITHUB',
    verifiziert: true,
    releaseTag: 'v0.1.0-preview',
    paketFormat: 'sideline-plugin-v1',
  },
  {
    manifest: ROSTER_ATTENDANCE_MANIFEST,
    quelle: 'OFFICIAL_GITHUB',
    verifiziert: true,
    releaseTag: 'v0.1.0-preview',
    paketFormat: 'sideline-plugin-v1',
  },
];

export const STANDARD_INSTALLIERTE_PLUGIN_IDS: string[] = [
  'video-analysis',
  'playbook',
  'roster-attendance',
];

export const STANDARD_AKTIVIERTE_PLUGIN_IDS: string[] = OFFIZIELLER_PLUGIN_KATALOG.filter(
  (e) => e.manifest.standardAktiviert
).map((e) => e.manifest.id);
