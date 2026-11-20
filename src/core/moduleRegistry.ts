import type { ModulId } from '../shared/types.ts';

export interface ModulSettingsAnker {
  id: string;
  label: string;
  modulName: string;
}

export interface SidelineModulManifest {
  id: ModulId;
  name: string;
  kurzbeschreibung: string;
  version: string;
  status: 'AKTIV' | 'VORSCHAU';
  standardAktiviert: boolean;
  /** Dynamische Kategorien, die das Modul in die zentralen Core-Einstellungen einhängt */
  settingsBeitraege: {
    user?: ModulSettingsAnker[];
    team?: ModulSettingsAnker[];
    sysadmin?: ModulSettingsAnker[];
  };
}

/**
 * Zentrale Modul-Registry von SidelineOS.
 * Jedes Modul klinkt sich deklarativ über sein Manifest in den Core-Hub und die Einstellungen ein.
 */
export const SIDELINE_MODULE_REGISTRY: SidelineModulManifest[] = [
  {
    id: 'video-analysis',
    name: 'Videoanalyse',
    kurzbeschreibung:
      'Multi-Angle Film Room, exakte Frame-Telestration, Hudl-kompatibles Breakdown-Tagging, Team-Sharing und JSON-Import.',
    version: '0.2.0',
    status: 'AKTIV',
    standardAktiviert: true,
    settingsBeitraege: {
      user: [
        { id: 'modul-video-hotkeys', label: 'Film-Room-Hotkeys', modulName: 'Videoanalyse' },
        { id: 'modul-video-player', label: 'Player-Voreinstellungen', modulName: 'Videoanalyse' },
      ],
      team: [
        {
          id: 'modul-video-tagging',
          label: 'Tagging-Schema & Wörterbuch',
          modulName: 'Videoanalyse',
        },
      ],
      sysadmin: [
        { id: 'modul-video-cleanup', label: 'S3-Cleanup & Schonfrist', modulName: 'Videoanalyse' },
      ],
    },
  },
  {
    id: 'playbook',
    name: 'Playbook & Install',
    kurzbeschreibung:
      'Digitales Playbook mit Formations-Bibliothek, Installations-Wochenplänen und Spielzug-Quiz für Spieler.',
    version: '0.1.0-preview',
    status: 'VORSCHAU',
    standardAktiviert: true,
    settingsBeitraege: {},
  },
  {
    id: 'roster-attendance',
    name: 'Roster & Anwesenheit',
    kurzbeschreibung:
      'Trainings-Check-in, Depth Chart nach Units, Verletzungsstatus und Kader-Export für Spieltage.',
    version: '0.1.0-preview',
    status: 'VORSCHAU',
    standardAktiviert: false,
    settingsBeitraege: {},
  },
];

export const ALLE_MODUL_IDS: ModulId[] = SIDELINE_MODULE_REGISTRY.map((m) => m.id);

export const STANDARD_AKTIVIERTE_MODULE: ModulId[] = SIDELINE_MODULE_REGISTRY.filter(
  (m) => m.standardAktiviert
).map((m) => m.id);

/**
 * Parst ENABLED_MODULES aus der Umgebungskonfiguration (kommagetrennt).
 * Unbekannte IDs werden ignoriert; bei leerer/fehlender Variable greifen die Standard-Module.
 */
export function parseAktivierteModuleAusEnv(envWert?: string): ModulId[] {
  if (!envWert || !envWert.trim()) {
    return [...STANDARD_AKTIVIERTE_MODULE];
  }
  const gueltig = new Set<string>(ALLE_MODUL_IDS);
  const geparst = envWert
    .split(',')
    .map((eintrag) => eintrag.trim())
    .filter((eintrag): eintrag is ModulId => gueltig.has(eintrag));

  return geparst.length > 0 ? Array.from(new Set(geparst)) : [...STANDARD_AKTIVIERTE_MODULE];
}

/**
 * Ein Modul ist für ein Team nur verfügbar, wenn es sowohl instanzweit (ENV / Sysadmin)
 * installiert/aktiviert ist als auch für das jeweilige Team freigeschaltet wurde.
 */
export function istModulFuerTeamAktiv(
  modulId: ModulId,
  globalAktivierteModule: readonly ModulId[],
  teamAktivierteModule: readonly ModulId[]
): boolean {
  return globalAktivierteModule.includes(modulId) && teamAktivierteModule.includes(modulId);
}

export function findeModulManifest(modulId: ModulId): SidelineModulManifest | undefined {
  return SIDELINE_MODULE_REGISTRY.find((m) => m.id === modulId);
}
