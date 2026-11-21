import type { PluginId } from '../shared/types.ts';
import type { PluginStoreEintrag, SidelinePlugin } from '../sdk/plugin.ts';
import { videoAnalysisPlugin } from './video-analysis/index.tsx';
import { erstelleVorschauPluginAusManifest } from './previewPlugins.tsx';

/**
 * Löst installierte Store-Einträge auf konkrete Laufzeit-Plugins auf.
 * Im Produktions-Backend (Paket 4) werden externe Plugins dynamisch aus ihren
 * signierten GitHub-Release-Bundles (`sideline-plugin-v1`) geladen.
 */
export function ladeInstalliertePlugins(
  katalog: readonly PluginStoreEintrag[],
  installierteIds: readonly PluginId[]
): SidelinePlugin[] {
  const eingebautePlugins = new Map<PluginId, SidelinePlugin>([
    [videoAnalysisPlugin.manifest.id, videoAnalysisPlugin],
  ]);

  const ergebnis: SidelinePlugin[] = [];
  for (const id of installierteIds) {
    const eingebaut = eingebautePlugins.get(id);
    if (eingebaut) {
      ergebnis.push(eingebaut);
      continue;
    }
    const eintrag = katalog.find((k) => k.manifest.id === id);
    if (eintrag) {
      ergebnis.push(erstelleVorschauPluginAusManifest(eintrag.manifest));
    }
  }
  return ergebnis;
}
