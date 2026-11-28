import type { RuntimePluginClientDTO } from '../core/apiClient.ts';
import type { SidelinePlugin } from '../sdk/plugin.ts';
import { bereinigePluginThemePresets } from '../shared/theme.ts';

const geladenePluginCache = new Map<string, SidelinePlugin>();

function istReactKomponente(kandidat: unknown): boolean {
  return (
    typeof kandidat === 'function' ||
    (typeof kandidat === 'object' && kandidat !== null && '$$typeof' in kandidat)
  );
}

/**
 * Validiert ein dynamisch geladenes Client-Bundle gegen den SDK-v2.0-Vertrag.
 */
export function istGueltigesFrontendPlugin(kandidat: unknown): kandidat is SidelinePlugin {
  if (!kandidat || typeof kandidat !== 'object') return false;
  const obj = kandidat as Partial<SidelinePlugin>;
  if (typeof obj.manifest?.id !== 'string' || !obj.manifest.id.trim()) return false;

  const hatHauptansicht = istReactKomponente(obj.HauptAnsicht);
  const hatSettingsPanel = istReactKomponente(obj.SettingsPanel);
  const hatPublicShare = istReactKomponente(obj.OeffentlicheAnsicht);
  const hatThemes = bereinigePluginThemePresets(obj.manifest.themes).length > 0;

  return hatHauptansicht || hatSettingsPanel || hatPublicShare || hatThemes;
}

function baueQuery(eintrag: RuntimePluginClientDTO): string {
  const params = new URLSearchParams({ v: eintrag.version });
  if (eintrag.cacheBuster) params.set('t', eintrag.cacheBuster);
  return `?${params.toString()}`;
}

function synchronisierePluginStylesheets(eintraege: readonly RuntimePluginClientDTO[]): void {
  if (typeof document === 'undefined') return;
  const gewuenschte = new Map<string, string>();
  for (const eintrag of eintraege) {
    if (eintrag.cssUrl) {
      gewuenschte.set(eintrag.pluginId, `${eintrag.cssUrl}${baueQuery(eintrag)}`);
    }
  }

  document.head
    .querySelectorAll<HTMLLinkElement>('link[data-sideline-plugin-css]')
    .forEach((link) => {
      const id = link.dataset.sidelinePluginCss ?? '';
      const zielHref = gewuenschte.get(id);
      if (!zielHref) {
        link.remove();
      } else {
        if (link.getAttribute('href') !== zielHref) link.setAttribute('href', zielHref);
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

export async function ladeRuntimePluginBundles(
  eintraege: readonly RuntimePluginClientDTO[]
): Promise<SidelinePlugin[]> {
  synchronisierePluginStylesheets(eintraege);

  const aktiveKeys = new Set(
    eintraege.map((e) => `${e.pluginId}@${e.version}@${e.cacheBuster ?? ''}`)
  );
  for (const key of Array.from(geladenePluginCache.keys())) {
    if (!aktiveKeys.has(key)) geladenePluginCache.delete(key);
  }

  const ergebnis: SidelinePlugin[] = [];
  for (const eintrag of eintraege) {
    const cacheKey = `${eintrag.pluginId}@${eintrag.version}@${eintrag.cacheBuster ?? ''}`;
    const gecached = geladenePluginCache.get(cacheKey);
    if (gecached) {
      const aktuell: SidelinePlugin = {
        ...gecached,
        manifest: { ...gecached.manifest, ...eintrag.manifest },
      };
      geladenePluginCache.set(cacheKey, aktuell);
      ergebnis.push(aktuell);
      continue;
    }

    try {
      const mod = (await import(/* @vite-ignore */ `${eintrag.clientUrl}${baueQuery(eintrag)}`)) as Record<
        string,
        unknown
      >;
      const kandidat = mod.default ?? mod.plugin ?? mod.frontendPlugin;
      if (istGueltigesFrontendPlugin(kandidat)) {
        const zusammen: SidelinePlugin = {
          ...kandidat,
          manifest: { ...kandidat.manifest, ...eintrag.manifest },
        };
        geladenePluginCache.set(cacheKey, zusammen);
        ergebnis.push(zusammen);
      }
    } catch (err) {
      console.warn(`[SidelineOS-Core] Client-Bundle "${eintrag.pluginId}" fehlgeschlagen:`, err);
    }
  }

  return ergebnis;
}
