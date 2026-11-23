import type { RuntimePluginClientDTO } from '../core/apiClient.ts';
import type { PluginId } from '../shared/types.ts';
import type { PluginStoreEintrag, SidelinePlugin } from '../sdk/plugin.ts';

const geladenePluginCache = new Map<string, SidelinePlugin>();

function istGueltigesFrontendPlugin(kandidat: unknown): kandidat is SidelinePlugin {
  if (!kandidat || typeof kandidat !== 'object') return false;
  const obj = kandidat as Partial<SidelinePlugin>;
  return (
    Boolean(obj.manifest?.id) &&
    typeof obj.getTabs === 'function' &&
    typeof obj.renderMainView === 'function'
  );
}

function synchronisierePluginStylesheets(eintraege: readonly RuntimePluginClientDTO[]): void {
  if (typeof document === 'undefined') return;

  const gewuenschte = new Map<string, string>();
  for (const eintrag of eintraege) {
    if (eintrag.cssUrl) {
      gewuenschte.set(eintrag.pluginId, `${eintrag.cssUrl}?v=${encodeURIComponent(eintrag.version)}`);
    }
  }

  const bestehende = document.head.querySelectorAll<HTMLLinkElement>('link[data-sideline-plugin-css]');
  bestehende.forEach((link) => {
    const id = link.dataset.sidelinePluginCss ?? '';
    const zielHref = gewuenschte.get(id);
    if (!zielHref) {
      link.remove();
    } else if (link.getAttribute('href') !== zielHref) {
      link.setAttribute('href', zielHref);
      gewuenschte.delete(id);
    } else {
      gewuenschte.delete(id);
    }
  });

  for (const [pluginId, href] of gewuenschte.entries()) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.sidelinePluginCss = pluginId;
    document.head.appendChild(link);
  }
}

/**
 * Lädt alle vom Server gemeldeten Frontend-ESM-Bundles (`dist/client.js` + optionales CSS)
 * dynamisch in den Browser und cached geladene Versionen.
 */
export async function ladeRuntimePluginBundles(
  eintraege: readonly RuntimePluginClientDTO[]
): Promise<SidelinePlugin[]> {
  synchronisierePluginStylesheets(eintraege);

  const ergebnis: SidelinePlugin[] = [];
  for (const eintrag of eintraege) {
    const cacheKey = `${eintrag.pluginId}@${eintrag.version}`;
    const gecached = geladenePluginCache.get(cacheKey);
    if (gecached) {
      ergebnis.push(gecached);
      continue;
    }

    try {
      const importUrl = `${eintrag.clientUrl}?v=${encodeURIComponent(eintrag.version)}`;
      const mod = (await import(/* @vite-ignore */ importUrl)) as Record<string, unknown>;
      const kandidat = mod.default ?? mod.plugin ?? mod.frontendPlugin;
      if (istGueltigesFrontendPlugin(kandidat)) {
        geladenePluginCache.set(cacheKey, kandidat);
        ergebnis.push(kandidat);
      } else {
        console.warn(
          `[SidelineOS-Core] Plugin-Bundle "${eintrag.pluginId}" exportiert kein gültiges SidelinePlugin.`
        );
      }
    } catch (err) {
      console.warn(
        `[SidelineOS-Core] Client-Bundle für "${eintrag.pluginId}" konnte nicht geladen werden:`,
        err
      );
    }
  }

  return ergebnis;
}

/**
 * Filtert bereits geladene Runtime-Plugins anhand der aktiv installierten IDs.
 */
export function ladeInstalliertePlugins(
  _katalog: readonly PluginStoreEintrag[],
  installierteIds: readonly PluginId[],
  geladenePlugins: readonly SidelinePlugin[] = []
): SidelinePlugin[] {
  if (geladenePlugins.length === 0) return [];
  const aktiv = new Set(installierteIds);
  return geladenePlugins.filter((p) => aktiv.has(p.manifest.id));
}
