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
