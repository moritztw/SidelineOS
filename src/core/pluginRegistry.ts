import type { PluginId } from '../shared/types.ts';
import type { PluginManifest, SidelinePlugin } from '../sdk/plugin.ts';

/**
 * Ein Plugin ist für ein Team nur verfügbar, wenn es sowohl instanzweit (installiert & aktiv)
 * als auch für das jeweilige Team freigeschaltet wurde.
 */
export function istPluginFuerTeamAktiv(
  pluginId: PluginId,
  installierteIds: readonly PluginId[],
  globalAktivierteIds: readonly PluginId[],
  teamAktivierteIds: readonly PluginId[]
): boolean {
  return (
    installierteIds.includes(pluginId) &&
    globalAktivierteIds.includes(pluginId) &&
    teamAktivierteIds.includes(pluginId)
  );
}

/**
 * Validiert und normalisiert eine GitHub-Repository-URL für den Plugin Store.
 */
export function parseGitHubPluginQuelle(eingabe: string): {
  ok: boolean;
  repoUrl?: string;
  slug?: string;
  fehler?: string;
} {
  const bereinigt = eingabe.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const match = bereinigt.match(/^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (!match) {
    return {
      ok: false,
      fehler: 'Bitte eine gültige GitHub-URL angeben (z. B. https://github.com/org/SidelineOS-scouting).',
    };
  }
  const slug = match[2]
    .toLowerCase()
    .replace(/^sidelineos-/, '')
    .replace(/[^a-z0-9-]+/g, '-');

  return {
    ok: true,
    repoUrl: bereinigt,
    slug: slug || `custom-${Date.now().toString(36)}`,
  };
}

/**
 * Erstellt ein typsicheres Manifest für ein über GitHub-URL im Store getestetes Dritt-Plugin.
 */
export function erstelleCustomPluginManifest(repoUrl: string, slug: string): PluginManifest {
  const titel = slug
    .split('-')
    .filter(Boolean)
    .map((wort) => wort.charAt(0).toUpperCase() + wort.slice(1))
    .join(' ');

  return {
    id: slug,
    name: titel || 'Externes Plugin',
    kurzbeschreibung: `Externes GitHub-Plugin (${repoUrl}). Im Backend über signiertes Release-Paket geladen.`,
    version: '0.1.0-git',
    sdkVersion: '1.0',
    autor: repoUrl.split('/')[3] ?? 'Community',
    repositoryUrl: repoUrl,
    icon: 'puzzle',
    status: 'VORSCHAU',
    standardAktiviert: true,
    permissions: ['team:read', 'db:plugin-tables'],
    dbPrefix: `mod_${slug.replace(/-/g, '_')}_`,
    s3Prefix: `plugins/${slug}/`,
    settingsAnker: {},
  };
}

export function findePlugin(
  plugins: readonly SidelinePlugin[],
  pluginId: PluginId | null
): SidelinePlugin | undefined {
  if (!pluginId) return undefined;
  return plugins.find((p) => p.manifest.id === pluginId);
}
