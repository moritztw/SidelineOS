import type { PluginManifest, PluginStoreEintrag } from '../sdk/plugin.ts';

export const VIDEO_STORE_MANIFEST: PluginManifest = {
  id: 'video-analysis',
  name: 'Videoanalyse',
  kurzbeschreibung:
    'Externes Modul (SidelineOS-video): Multi-Angle Film Room, exakte Frame-Telestration, Breakdown-Tagging, Team-Sharing & JSON-Import.',
  version: '0.2.0',
  sdkVersion: '1.0',
  autor: 'SidelineOS / moritztw',
  repositoryUrl: 'https://github.com/moritztw/SidelineOS-video',
  icon: 'film',
  status: 'AKTIV',
  standardAktiviert: false,
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

/**
 * Kuratierter Katalog offizieller SidelineOS-Plugins (jeweils eigenes GitHub-Repository).
 * Core installiert standardmäßig keine Fachmodule vor – Plugins werden über den Store bezogen.
 */
export const OFFIZIELLER_PLUGIN_KATALOG: PluginStoreEintrag[] = [
  {
    manifest: VIDEO_STORE_MANIFEST,
    quelle: 'OFFICIAL_GITHUB',
    verifiziert: true,
    releaseTag: 'v0.2.0',
    paketFormat: 'sideline-plugin-v1',
  },
];

export const STANDARD_INSTALLIERTE_PLUGIN_IDS: string[] = [];

export const STANDARD_AKTIVIERTE_PLUGIN_IDS: string[] = [];
