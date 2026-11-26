import type { RuntimePluginClientDTO } from '../core/apiClient.ts';
import type { PluginId } from '../shared/types.ts';
import { bereinigePluginThemePresets } from '../shared/theme.ts';
import type { PluginStoreEintrag, SidelinePlugin } from '../sdk/plugin.ts';

const geladenePluginCache = new Map<string, SidelinePlugin>();

function istReactKomponente(kandidat: unknown): boolean {
  return (
    typeof kandidat === 'function' ||
    (typeof kandidat === 'object' && kandidat !== null && '$$typeof' in kandidat)
  );
}

/**
 * Prüft, ob ein geladenes Client-Bundle den verbindlichen `SidelinePlugin`-Vertrag erfüllt.
 * Unterstützt sowohl klassische UI-Plugins (`renderMainView`) als auch Headless-/Theme- oder
 * reine Settings-/Share-Plugins (`Provider`, `settingsPanels`, `renderPublicShareView`).
 */
export function istGueltigesFrontendPlugin(kandidat: unknown): kandidat is SidelinePlugin {
  if (!kandidat || typeof kandidat !== 'object') return false;
  const obj = kandidat as Partial<SidelinePlugin>;
  if (typeof obj.manifest?.id !== 'string' || !obj.manifest.id.trim()) {
    return false;
  }

  if (obj.Provider !== undefined && !istReactKomponente(obj.Provider)) return false;
  if (obj.getTabs !== undefined && typeof obj.getTabs !== 'function') return false;
  if (obj.renderMainView !== undefined && typeof obj.renderMainView !== 'function') return false;
  if (obj.PrimaerAktion !== undefined && !istReactKomponente(obj.PrimaerAktion)) return false;
  if (obj.renderPublicShareView !== undefined && typeof obj.renderPublicShareView !== 'function') {
    return false;
  }
  if (obj.defaultTab !== undefined && typeof obj.defaultTab !== 'string') return false;
  if (obj.themes !== undefined && !Array.isArray(obj.themes)) return false;

  const panels = obj.settingsPanels;
  if (panels !== undefined && (!panels || typeof panels !== 'object')) return false;
  if (panels?.user !== undefined && !istReactKomponente(panels.user)) return false;
  if (panels?.team !== undefined && !istReactKomponente(panels.team)) return false;
  if (panels?.sysadmin !== undefined && !istReactKomponente(panels.sysadmin)) return false;

  const hatHauptansicht = typeof obj.renderMainView === 'function';
  const hatProvider = istReactKomponente(obj.Provider);
  const hatPublicShare = typeof obj.renderPublicShareView === 'function';
  const hatSettingsPanel = Boolean(
    panels &&
      (istReactKomponente(panels.user) ||
        istReactKomponente(panels.team) ||
        istReactKomponente(panels.sysadmin))
  );
  const hatThemes =
    bereinigePluginThemePresets(obj.themes ?? obj.manifest.themes).length > 0;

  return hatHauptansicht || hatProvider || hatPublicShare || hatSettingsPanel || hatThemes;
}

function baueBundleVersionQuery(eintrag: RuntimePluginClientDTO): string {
  const params = new URLSearchParams({ v: eintrag.version });
  if (eintrag.cacheBuster) {
    params.set('t', eintrag.cacheBuster);
  }
  return `?${params.toString()}`;
}

function synchronisierePluginStylesheets(eintraege: readonly RuntimePluginClientDTO[]): void {
  if (typeof document === 'undefined') return;

  const gewuenschte = new Map<string, string>();
  for (const eintrag of eintraege) {
    if (eintrag.cssUrl) {
      gewuenschte.set(eintrag.pluginId, `${eintrag.cssUrl}${baueBundleVersionQuery(eintrag)}`);
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

function fuehreServerManifestZusammen(
  kandidat: SidelinePlugin,
  serverManifest: RuntimePluginClientDTO['manifest']
): SidelinePlugin {
  return {
    ...kandidat,
    manifest: {
      ...kandidat.manifest,
      ...serverManifest,
    },
  };
}

/**
 * Lädt alle vom Server gemeldeten Frontend-ESM-Bundles (`dist/client.js` + optionales CSS)
 * dynamisch in den Browser, bereinigt veraltete Cache-Einträge und übernimmt das aktuelle Server-Manifest.
 */
export async function ladeRuntimePluginBundles(
  eintraege: readonly RuntimePluginClientDTO[]
): Promise<SidelinePlugin[]> {
  synchronisierePluginStylesheets(eintraege);

  const aktiveCacheKeys = new Set(
    eintraege.map((e) => `${e.pluginId}@${e.version}@${e.cacheBuster ?? ''}`)
  );
  for (const key of Array.from(geladenePluginCache.keys())) {
    if (!aktiveCacheKeys.has(key)) {
      geladenePluginCache.delete(key);
    }
  }

  const ergebnis: SidelinePlugin[] = [];
  for (const eintrag of eintraege) {
    const cacheKey = `${eintrag.pluginId}@${eintrag.version}@${eintrag.cacheBuster ?? ''}`;
    const gecached = geladenePluginCache.get(cacheKey);
    if (gecached) {
      const aktuell = fuehreServerManifestZusammen(gecached, eintrag.manifest);
      geladenePluginCache.set(cacheKey, aktuell);
      ergebnis.push(aktuell);
      continue;
    }

    try {
      const importUrl = `${eintrag.clientUrl}${baueBundleVersionQuery(eintrag)}`;
      const mod = (await import(/* @vite-ignore */ importUrl)) as Record<string, unknown>;
      const kandidat = mod.default ?? mod.plugin ?? mod.frontendPlugin;
      if (istGueltigesFrontendPlugin(kandidat)) {
        const zusammengefuehrt = fuehreServerManifestZusammen(kandidat, eintrag.manifest);
        geladenePluginCache.set(cacheKey, zusammengefuehrt);
        ergebnis.push(zusammengefuehrt);
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
