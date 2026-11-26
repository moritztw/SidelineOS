/**
 * Semantische Design-Tokens für SidelineOS-Core und externe Plugins.
 *
 * Alle Core-UI-Komponenten referenzieren ausschließlich diese `--sl-*`-Variablen
 * (über Tailwind v4 `@theme inline` als `sl-*`-Utilities gemappt).
 * Externe Theme-Plugins können diese Tokens gezielt auf `:root` überschreiben,
 * ohne dass der Core umgebaut werden muss.
 */

export interface SidelineCssTokenDefinition {
  cssVar: `--sl-${string}`;
  tailwindColor?: string;
  defaultValue: string;
  beschreibung: string;
}

export const SIDELINE_CSS_TOKENS = {
  colorScheme: {
    cssVar: '--sl-color-scheme',
    defaultValue: 'dark',
    beschreibung: 'Browser color-scheme ("dark" oder "light") für native Formulare & Scrollbars',
  },
  bgCanvas: {
    cssVar: '--sl-bg-canvas',
    tailwindColor: 'sl-canvas',
    defaultValue: '#0B0E11',
    beschreibung: 'Globaler Seitenhintergrund und vertiefte Eingabeflächen',
  },
  bgTopbar: {
    cssVar: '--sl-bg-topbar',
    tailwindColor: 'sl-topbar',
    defaultValue: '#0F1318',
    beschreibung: 'Hintergrund der Kontext-Leiste unterhalb der TopBar',
  },
  bgSurface: {
    cssVar: '--sl-bg-surface',
    tailwindColor: 'sl-surface',
    defaultValue: '#13171D',
    beschreibung: 'Karten-, Modal-, Sidebar- und Panel-Oberflächen',
  },
  bgElevated: {
    cssVar: '--sl-bg-elevated',
    tailwindColor: 'sl-elevated',
    defaultValue: '#1E2530',
    beschreibung: 'Sekundäre Buttons und hervorgehobene Bedienelemente',
  },
  border: {
    cssVar: '--sl-border',
    tailwindColor: 'sl-border',
    defaultValue: '#232933',
    beschreibung: 'Standard-Rahmenfarbe für Karten, Inputs, Trennlinien und aktive Pills',
  },
  borderStrong: {
    cssVar: '--sl-border-strong',
    tailwindColor: 'sl-border-strong',
    defaultValue: '#36404F',
    beschreibung: 'Stärkere Trennzeichen (z. B. Breadcrumb-Trenner)',
  },
  textHeading: {
    cssVar: '--sl-text-heading',
    tailwindColor: 'sl-heading',
    defaultValue: '#FFFFFF',
    beschreibung: 'Überschriften, aktive Tab-Labels und hervorgehobene Werte',
  },
  textPrimary: {
    cssVar: '--sl-text-primary',
    tailwindColor: 'sl-primary',
    defaultValue: '#E6EDF3',
    beschreibung: 'Primärer Fließtext und Formular-Labels',
  },
  textMuted: {
    cssVar: '--sl-text-muted',
    tailwindColor: 'sl-muted',
    defaultValue: '#8B949E',
    beschreibung: 'Sekundäre Beschreibungen, Meta-Infos und inaktive Tabs',
  },
  textSubtle: {
    cssVar: '--sl-text-subtle',
    tailwindColor: 'sl-subtle',
    defaultValue: '#6E7681',
    beschreibung: 'Platzhalter, leere Zustände und Gruppenüberschriften',
  },
  accent: {
    cssVar: '--sl-accent',
    tailwindColor: 'sl-accent',
    defaultValue: '#F59E0B',
    beschreibung: 'Primäre Akzentfarbe (Standard oder aktive Team-Primärfarbe)',
  },
  accentHover: {
    cssVar: '--sl-accent-hover',
    tailwindColor: 'sl-accent-hover',
    defaultValue: '#FBBF24',
    beschreibung: 'Hover-Zustand für primäre Akzent-Buttons',
  },
  accentContrast: {
    cssVar: '--sl-accent-contrast',
    tailwindColor: 'sl-accent-contrast',
    defaultValue: '#0B0E11',
    beschreibung: 'Kontrast-Textfarbe auf gefüllten Akzent-Buttons',
  },
  danger: {
    cssVar: '--sl-danger',
    tailwindColor: 'sl-danger',
    defaultValue: '#DC2626',
    beschreibung: 'Fehler- und Lösch-Basis-/Rahmenfarbe',
  },
  dangerText: {
    cssVar: '--sl-danger-text',
    tailwindColor: 'sl-danger-text',
    defaultValue: '#FCA5A5',
    beschreibung: 'Textfarbe für Fehlermeldungen und destruktive Hinweise',
  },
  success: {
    cssVar: '--sl-success',
    tailwindColor: 'sl-success',
    defaultValue: '#16A34A',
    beschreibung: 'Erfolgs- und Aktiv-Basis-/Rahmenfarbe',
  },
  successText: {
    cssVar: '--sl-success-text',
    tailwindColor: 'sl-success-text',
    defaultValue: '#86EFAC',
    beschreibung: 'Textfarbe für Erfolgs- und Aktiv-Hinweise',
  },
  warningText: {
    cssVar: '--sl-warning-text',
    tailwindColor: 'sl-warning-text',
    defaultValue: '#FDE68A',
    beschreibung: 'Textfarbe für Warn-, Update- und Vorschau-Banner',
  },
} as const satisfies Record<string, SidelineCssTokenDefinition>;

export type SidelineCssToken = (typeof SIDELINE_CSS_TOKENS)[keyof typeof SIDELINE_CSS_TOKENS]['cssVar'];

export const SIDELINE_STANDARD_THEME_TOKENS: Record<SidelineCssToken, string> = {
  '--sl-color-scheme': SIDELINE_CSS_TOKENS.colorScheme.defaultValue,
  '--sl-bg-canvas': SIDELINE_CSS_TOKENS.bgCanvas.defaultValue,
  '--sl-bg-topbar': SIDELINE_CSS_TOKENS.bgTopbar.defaultValue,
  '--sl-bg-surface': SIDELINE_CSS_TOKENS.bgSurface.defaultValue,
  '--sl-bg-elevated': SIDELINE_CSS_TOKENS.bgElevated.defaultValue,
  '--sl-border': SIDELINE_CSS_TOKENS.border.defaultValue,
  '--sl-border-strong': SIDELINE_CSS_TOKENS.borderStrong.defaultValue,
  '--sl-text-heading': SIDELINE_CSS_TOKENS.textHeading.defaultValue,
  '--sl-text-primary': SIDELINE_CSS_TOKENS.textPrimary.defaultValue,
  '--sl-text-muted': SIDELINE_CSS_TOKENS.textMuted.defaultValue,
  '--sl-text-subtle': SIDELINE_CSS_TOKENS.textSubtle.defaultValue,
  '--sl-accent': SIDELINE_CSS_TOKENS.accent.defaultValue,
  '--sl-accent-hover': SIDELINE_CSS_TOKENS.accentHover.defaultValue,
  '--sl-accent-contrast': SIDELINE_CSS_TOKENS.accentContrast.defaultValue,
  '--sl-danger': SIDELINE_CSS_TOKENS.danger.defaultValue,
  '--sl-danger-text': SIDELINE_CSS_TOKENS.dangerText.defaultValue,
  '--sl-success': SIDELINE_CSS_TOKENS.success.defaultValue,
  '--sl-success-text': SIDELINE_CSS_TOKENS.successText.defaultValue,
  '--sl-warning-text': SIDELINE_CSS_TOKENS.warningText.defaultValue,
};

export interface TeamAkzentTokens {
  '--sl-accent': string;
  '--sl-accent-hover': string;
  '--sl-accent-contrast': '#0B0E11' | '#FFFFFF';
}

/**
 * Validiert und normalisiert einen CSS-Hex-Farbwert (`#RGB` oder `#RRGGBB`) auf `#RRGGBB`.
 */
export function normalisiereHexFarbe(raw?: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const shortMatch = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(trimmed);
  if (shortMatch) {
    const [, r, g, b] = shortMatch;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

function parseRgb(hex: string): [number, number, number] {
  const norm = normalisiereHexFarbe(hex) ?? '#F59E0B';
  return [
    parseInt(norm.slice(1, 3), 16),
    parseInt(norm.slice(3, 5), 16),
    parseInt(norm.slice(5, 7), 16),
  ];
}

function linearisiereKanal(wert255: number): number {
  const srgb = wert255 / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/**
 * Berechnet die relative WCAG-2.1-Luminanz (0 = Schwarz, 1 = Weiß) einer Hex-Farbe.
 */
export function berechneRelativeLuminanz(hex: string): number {
  const [r, g, b] = parseRgb(hex);
  return 0.2126 * linearisiereKanal(r) + 0.7152 * linearisiereKanal(g) + 0.0722 * linearisiereKanal(b);
}

const DUNKEL_KONTRAST_LUMINANZ = berechneRelativeLuminanz('#0B0E11');

/**
 * Ermittelt für eine Akzentfarbe die kontrastreichere Textfarbe (`#0B0E11` oder `#FFFFFF`).
 */
export function ermittleKontrastTextFarbe(hex: string): '#0B0E11' | '#FFFFFF' {
  const luminanz = berechneRelativeLuminanz(hex);
  const kontrastHell = (1.0 + 0.05) / (luminanz + 0.05);
  const kontrastDunkel = (luminanz + 0.05) / (DUNKEL_KONTRAST_LUMINANZ + 0.05);
  return kontrastDunkel >= kontrastHell ? '#0B0E11' : '#FFFFFF';
}

function mischeHex(hex: string, zielHex: string, anteil: number): string {
  const [r1, g1, b1] = parseRgb(hex);
  const [r2, g2, b2] = parseRgb(zielHex);
  const r = Math.round(r1 + (r2 - r1) * anteil);
  const g = Math.round(g1 + (g2 - g1) * anteil);
  const b = Math.round(b1 + (b2 - b1) * anteil);
  const zuHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${zuHex(r)}${zuHex(g)}${zuHex(b)}`.toUpperCase();
}

/**
 * Leitet eine abgesetzte Hover-Farbe aus einer beliebigen Team-Primärfarbe ab.
 */
export function ermittleHoverAkzentFarbe(hex: string): string {
  const norm = normalisiereHexFarbe(hex);
  if (!norm) return SIDELINE_CSS_TOKENS.accentHover.defaultValue;
  if (norm === SIDELINE_CSS_TOKENS.accent.defaultValue) {
    return SIDELINE_CSS_TOKENS.accentHover.defaultValue;
  }
  const luminanz = berechneRelativeLuminanz(norm);
  return luminanz >= 0.5 ? mischeHex(norm, '#0B0E11', 0.14) : mischeHex(norm, '#FFFFFF', 0.16);
}

/**
 * Erzeugt die abgeleiteten Akzent-CSS-Tokens für `aktivesTeam.primaerFarbe`.
 * Gibt `null` zurück, falls keine gültige Hex-Farbe hinterlegt ist.
 */
export function ermittleTeamAkzentTokens(primaerFarbe?: string): TeamAkzentTokens | null {
  const norm = normalisiereHexFarbe(primaerFarbe);
  if (!norm) return null;
  return {
    '--sl-accent': norm,
    '--sl-accent-hover': ermittleHoverAkzentFarbe(norm),
    '--sl-accent-contrast': ermittleKontrastTextFarbe(norm),
  };
}

export const STANDARD_THEME_REF = 'core:default';
export const SYSTEM_THEME_SETTING_KEY = 'default_theme';

export interface PluginThemePreset {
  /** Eindeutige Theme-ID innerhalb des Plugins (z. B. "daylight", "high-contrast") */
  id: string;
  /** Anzeigename im Core-Theme-Auswahlmenü */
  name: string;
  /** Optionale kurze Beschreibung */
  beschreibung?: string;
  /** Basis-Farbschema für Browser-UI ("dark" oder "light") */
  colorScheme: 'dark' | 'light';
  /** Semantische `--sl-*` CSS Custom Properties */
  tokens: Partial<Record<SidelineCssToken, string>>;
  /** Optional: überschreibt auch die Team-Primärfarbe (`--sl-accent`), wenn true */
  overrideTeamAccent?: boolean;
}

export interface VerfuegbaresThemeEintrag {
  themeRef: string;
  pluginId: string | null;
  pluginName: string | null;
  preset: PluginThemePreset;
}

export const CORE_STANDARD_THEME_PRESET: PluginThemePreset = {
  id: 'default',
  name: 'SidelineOS Standard (Dark)',
  colorScheme: 'dark',
  tokens: { ...SIDELINE_STANDARD_THEME_TOKENS },
};

const ERLAUBTE_THEME_TOKENS = new Set<string>(Object.keys(SIDELINE_STANDARD_THEME_TOKENS));
const VERBOTENE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const THEME_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export function validiereThemeSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const norm = raw.trim().toLowerCase();
  if (!THEME_SLUG_REGEX.test(norm)) return null;
  return norm;
}

export function bauePluginThemeRef(pluginId: string, themeId: string): string {
  const p = validiereThemeSlug(pluginId);
  const t = validiereThemeSlug(themeId);
  if (!p || !t) {
    throw new Error(`Ungültige Theme-Referenz: "${pluginId}:${themeId}"`);
  }
  return `${p}:${t}`;
}

export type GeparsteThemeRef =
  | { typ: 'core' }
  | { typ: 'plugin'; pluginId: string; themeId: string };

export function parseThemeRef(raw: unknown): GeparsteThemeRef | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === STANDARD_THEME_REF) {
    return { typ: 'core' };
  }
  const teile = trimmed.split(':');
  if (teile.length !== 2) return null;
  const pluginId = validiereThemeSlug(teile[0]);
  const themeId = validiereThemeSlug(teile[1]);
  if (!pluginId || !themeId || pluginId === 'core') return null;
  return { typ: 'plugin', pluginId, themeId };
}

/**
 * Validiert einen CSS-Token-Wert gegen die strikte `--sl-*` Allowlist,
 * sodass niemals beliebige CSS-Strings oder Injection-Payloads angewendet werden können.
 */
export function validiereThemeTokenWert(token: string, rawWert: unknown): string | null {
  if (!ERLAUBTE_THEME_TOKENS.has(token) || typeof rawWert !== 'string') return null;
  const trimmed = rawWert.trim();
  if (token === '--sl-color-scheme') {
    const lower = trimmed.toLowerCase();
    return lower === 'dark' || lower === 'light' ? lower : null;
  }
  const hex6 = normalisiereHexFarbe(trimmed);
  if (hex6) return hex6;
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return null;
}

/**
 * Bereinigt ein Array roher `PluginThemePreset`-Objekte (aus Manifest oder Bundle).
 * Ungültige Presets oder ungültige CSS-Tokens werden verworfen.
 */
export function bereinigePluginThemePresets(raw: unknown): PluginThemePreset[] {
  if (!Array.isArray(raw)) return [];
  const gesehen = new Set<string>();
  const ergebnis: PluginThemePreset[] = [];

  for (const eintrag of raw) {
    if (!eintrag || typeof eintrag !== 'object') continue;
    const rec = eintrag as Record<string, unknown>;
    const id = validiereThemeSlug(rec.id);
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!id || !name || gesehen.has(id)) continue;

    const colorScheme: 'dark' | 'light' = rec.colorScheme === 'light' ? 'light' : 'dark';
    const beschreibung =
      typeof rec.beschreibung === 'string' && rec.beschreibung.trim()
        ? rec.beschreibung.trim()
        : undefined;

    const tokens: Partial<Record<SidelineCssToken, string>> = {};
    if (rec.tokens && typeof rec.tokens === 'object' && !Array.isArray(rec.tokens)) {
      for (const [key, val] of Object.entries(rec.tokens as Record<string, unknown>)) {
        if (VERBOTENE_OBJECT_KEYS.has(key)) continue;
        const bereinigt = validiereThemeTokenWert(key, val);
        if (bereinigt) {
          tokens[key as SidelineCssToken] = bereinigt;
        }
      }
    }
    if (!tokens['--sl-color-scheme']) {
      tokens['--sl-color-scheme'] = colorScheme;
    }

    gesehen.add(id);
    ergebnis.push({
      id,
      name,
      ...(beschreibung ? { beschreibung } : {}),
      colorScheme,
      tokens,
      ...(rec.overrideTeamAccent === true ? { overrideTeamAccent: true } : {}),
    });

    if (ergebnis.length >= 20) break;
  }

  return ergebnis;
}

export function sammleVerfuegbareThemes(
  quellen: ReadonlyArray<{
    pluginId: string;
    pluginName: string;
    themes?: readonly PluginThemePreset[];
  }>
): VerfuegbaresThemeEintrag[] {
  const ergebnis: VerfuegbaresThemeEintrag[] = [];
  const geseheneRefs = new Set<string>();

  for (const quelle of quellen) {
    const pluginId = validiereThemeSlug(quelle.pluginId);
    if (!pluginId || pluginId === 'core') continue;
    const bereinigt = bereinigePluginThemePresets(quelle.themes);
    for (const preset of bereinigt) {
      const themeRef = `${pluginId}:${preset.id}`;
      if (geseheneRefs.has(themeRef)) continue;
      geseheneRefs.add(themeRef);
      ergebnis.push({
        themeRef,
        pluginId,
        pluginName: quelle.pluginName,
        preset,
      });
    }
  }

  return ergebnis;
}

export interface AufgeloestesThemeErgebnis {
  themeRef: string;
  quelle: 'user' | 'instance' | 'core';
  pluginId: string | null;
  pluginName: string | null;
  preset: PluginThemePreset;
}

/**
 * Löst das effektiv anzuwendende Theme entlang der Hierarchie auf:
 * Benutzer-Präferenz (`preferredTheme`) -> Instanz-Standard (`instanceDefaultTheme`) -> Core-Standard (`core:default`).
 * Referenzen auf deaktivierte oder deinstallierte Plugins fallen automatisch sicher zurück.
 */
export function loeseAktivesThemeAuf(optionen: {
  userPreferredTheme?: string | null;
  instanceDefaultTheme?: string | null;
  verfuegbareThemes: readonly VerfuegbaresThemeEintrag[];
}): AufgeloestesThemeErgebnis {
  const findePluginTheme = (ref: string) =>
    optionen.verfuegbareThemes.find((t) => t.themeRef === ref) ?? null;

  const userParsed = parseThemeRef(optionen.userPreferredTheme);
  if (userParsed) {
    if (userParsed.typ === 'core') {
      return {
        themeRef: STANDARD_THEME_REF,
        quelle: 'user',
        pluginId: null,
        pluginName: null,
        preset: CORE_STANDARD_THEME_PRESET,
      };
    }
    const treffer = findePluginTheme(`${userParsed.pluginId}:${userParsed.themeId}`);
    if (treffer) {
      return {
        themeRef: treffer.themeRef,
        quelle: 'user',
        pluginId: treffer.pluginId,
        pluginName: treffer.pluginName,
        preset: treffer.preset,
      };
    }
  }

  const instanzParsed = parseThemeRef(optionen.instanceDefaultTheme);
  if (instanzParsed) {
    if (instanzParsed.typ === 'core') {
      return {
        themeRef: STANDARD_THEME_REF,
        quelle: 'instance',
        pluginId: null,
        pluginName: null,
        preset: CORE_STANDARD_THEME_PRESET,
      };
    }
    const treffer = findePluginTheme(`${instanzParsed.pluginId}:${instanzParsed.themeId}`);
    if (treffer) {
      return {
        themeRef: treffer.themeRef,
        quelle: 'instance',
        pluginId: treffer.pluginId,
        pluginName: treffer.pluginName,
        preset: treffer.preset,
      };
    }
  }

  return {
    themeRef: STANDARD_THEME_REF,
    quelle: 'core',
    pluginId: null,
    pluginName: null,
    preset: CORE_STANDARD_THEME_PRESET,
  };
}
