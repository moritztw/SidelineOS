import type { PluginId } from '../shared/types.ts';
import type { PluginStoreEintrag, SidelinePlugin } from '../sdk/plugin.ts';

/**
 * Löst installierte Store-Einträge auf konkrete Laufzeit-Plugins auf.
 * Fachmodule liegen außerhalb von SidelineOS-Core in eigenen GitHub-Repositories
 * (z. B. https://github.com/moritztw/SidelineOS-video) und werden über den
 * Plugin Store als signierte `sideline-plugin-v1`-Bundles nachgeladen.
 */
export function ladeInstalliertePlugins(
  _katalog: readonly PluginStoreEintrag[],
  _installierteIds: readonly PluginId[]
): SidelinePlugin[] {
  return [];
}
