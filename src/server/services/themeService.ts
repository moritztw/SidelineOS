import {
  STANDARD_THEME_REF,
  bereinigePluginThemePresets,
  parseThemeRef,
  type PluginThemePreset,
} from '../../shared/theme.ts';
import type { CoreRepository } from '../db/coreRepository.ts';

export interface PublicThemePluginInfo {
  pluginId: string;
  pluginName: string;
  themes: PluginThemePreset[];
}

/**
 * Liefert alle bereinigten Theme-Presets global aktivierter Plugins,
 * die ihre Presets im Manifest (`manifest.themes`) deklarieren.
 */
export async function listeOeffentlichePluginThemes(
  repo: CoreRepository
): Promise<PublicThemePluginInfo[]> {
  const installierte = await repo.listeInstalliertePlugins();
  const ergebnis: PublicThemePluginInfo[] = [];

  for (const eintrag of installierte) {
    if (!eintrag.enabledGlobally) continue;
    const bereinigt = bereinigePluginThemePresets(eintrag.manifest.themes);
    if (bereinigt.length === 0) continue;
    ergebnis.push({
      pluginId: eintrag.manifest.id,
      pluginName: eintrag.manifest.name,
      themes: bereinigt,
    });
  }

  return ergebnis;
}

/**
 * Validiert eine vom Benutzer oder Sysadmin gewählte Theme-Referenz gegen installierte
 * und global aktivierte Plugins.
 */
export async function validiereThemeAuswahlFuerInstanz(
  repo: CoreRepository,
  rawThemeRef: unknown,
  optionen: { erlaubeLeer?: boolean } = {}
): Promise<
  | { ok: true; themeRef: string | undefined }
  | { ok: false; status: number; fehler: string }
> {
  if (rawThemeRef === null || rawThemeRef === '') {
    return { ok: true, themeRef: optionen.erlaubeLeer ? undefined : STANDARD_THEME_REF };
  }

  if (typeof rawThemeRef !== 'string') {
    return { ok: false, status: 400, fehler: 'Ungültige Theme-Referenz.' };
  }

  const trimmed = rawThemeRef.trim();
  if (!trimmed) {
    return { ok: true, themeRef: optionen.erlaubeLeer ? undefined : STANDARD_THEME_REF };
  }

  const parsed = parseThemeRef(trimmed);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      fehler: 'Ungültiges Theme-Format (erwartet "core:default" oder "<pluginId>:<themeId>").',
    };
  }

  if (parsed.typ === 'core') {
    return { ok: true, themeRef: STANDARD_THEME_REF };
  }

  const pluginStatus = await repo.findePluginStatus(parsed.pluginId);
  if (!pluginStatus) {
    return {
      ok: false,
      status: 404,
      fehler: `Theme-Plugin "${parsed.pluginId}" ist nicht installiert.`,
    };
  }
  if (!pluginStatus.enabledGlobally) {
    return {
      ok: false,
      status: 409,
      fehler: `Theme-Plugin "${parsed.pluginId}" ist global deaktiviert.`,
    };
  }

  const manifestThemes = bereinigePluginThemePresets(pluginStatus.manifest.themes);
  if (manifestThemes.length > 0 && !manifestThemes.some((t) => t.id === parsed.themeId)) {
    return {
      ok: false,
      status: 404,
      fehler: `Theme-Preset "${parsed.themeId}" wurde in Plugin "${parsed.pluginId}" nicht gefunden.`,
    };
  }

  return { ok: true, themeRef: `${parsed.pluginId}:${parsed.themeId}` };
}
