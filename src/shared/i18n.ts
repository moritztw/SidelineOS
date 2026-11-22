export type UnterstuetzteSprache = 'de' | 'en';

export const STANDARD_SPRACHE: UnterstuetzteSprache = 'de';

export const UNTERSTUETZTE_SPRACHEN: ReadonlyArray<{
  code: UnterstuetzteSprache;
  label: string;
  eigenname: string;
}> = [
  { code: 'de', label: 'Deutsch', eigenname: 'Deutsch' },
  { code: 'en', label: 'English', eigenname: 'English' },
];

export type SprachPaket = Record<string, string>;

export type SprachWoerterbuecher = {
  de: SprachPaket;
} & Partial<Record<UnterstuetzteSprache, SprachPaket>>;

export function istUnterstuetzteSprache(wert: unknown): wert is UnterstuetzteSprache {
  return wert === 'de' || wert === 'en';
}

export function normalisiereSprache(
  wert: unknown,
  fallback: UnterstuetzteSprache = STANDARD_SPRACHE
): UnterstuetzteSprache {
  if (typeof wert !== 'string') return fallback;
  const kurz = wert.trim().toLowerCase().slice(0, 2);
  if (kurz === 'de' || kurz === 'en') {
    return kurz;
  }
  return fallback;
}

export function ermittleBrowserSprache(
  fallback: UnterstuetzteSprache = STANDARD_SPRACHE
): UnterstuetzteSprache {
  const nav = (globalThis as { navigator?: { language?: string } }).navigator;
  if (!nav?.language) return fallback;
  return normalisiereSprache(nav.language, fallback);
}

export function interpoliereText(
  vorlage: string,
  variablen?: Record<string, string | number | undefined>
): string {
  if (!variablen) return vorlage;
  return vorlage.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key: string) => {
    const wert = variablen[key];
    return wert === undefined ? match : String(wert);
  });
}

export function uebersetzeSchluessel(
  woerterbuecher: SprachWoerterbuecher,
  sprache: string | undefined,
  schluessel: string,
  variablen?: Record<string, string | number | undefined>
): string {
  const norm = normalisiereSprache(sprache, STANDARD_SPRACHE);
  const paket = woerterbuecher[norm];
  const vorlage = paket?.[schluessel] ?? woerterbuecher.de[schluessel] ?? schluessel;
  return interpoliereText(vorlage, variablen);
}

export function createPluginTranslator(
  woerterbuecher: SprachWoerterbuecher,
  locale?: string
): (schluessel: string, variablen?: Record<string, string | number | undefined>) => string {
  return (schluessel, variablen) =>
    uebersetzeSchluessel(woerterbuecher, locale, schluessel, variablen);
}
