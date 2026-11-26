import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  holeAktuelleBrandKonfig,
  setzeRuntimeBrandName,
  teileWortmarke,
  type BrandKonfiguration,
} from '../../shared/brand.ts';
import {
  STANDARD_SPRACHE,
  UNTERSTUETZTE_SPRACHEN,
  normalisiereSprache,
  uebersetzeSchluessel,
  type SprachWoerterbuecher,
  type UnterstuetzteSprache,
} from '../../shared/i18n.ts';
import deLocale from './locales/de.json';
import enLocale from './locales/en.json';

const CORE_WOERTERBUECHER: SprachWoerterbuecher = {
  de: deLocale,
  en: enLocale,
};

const STORAGE_KEY_LOCALE = 'sidelineos.locale';

// Initialisiert optionalen Vite-Brand-Override vor erstem Render
setzeRuntimeBrandName(import.meta.env.VITE_APP_BRAND_NAME);

export interface I18nKontextWert {
  locale: UnterstuetzteSprache;
  setLocale: (sprache: UnterstuetzteSprache) => void;
  brand: BrandKonfiguration;
  setBrandName: (name?: string) => void;
  t: (schluessel: string, variablen?: Record<string, string | number | undefined>) => string;
}

const I18nContext = createContext<I18nKontextWert | null>(null);

function leseInitialeSprache(): UnterstuetzteSprache {
  if (typeof window !== 'undefined') {
    try {
      const gespeichert = window.localStorage.getItem(STORAGE_KEY_LOCALE);
      if (gespeichert) {
        return normalisiereSprache(gespeichert, STANDARD_SPRACHE);
      }
    } catch {
      // Speicherzugriff kann in Sandbox-Umgebungen blockiert sein
    }
  }
  return normalisiereSprache(import.meta.env.VITE_DEFAULT_LOCALE, STANDARD_SPRACHE);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UnterstuetzteSprache>(leseInitialeSprache);
  const [brandNameOverride, setBrandNameOverride] = useState<string | undefined>(
    import.meta.env.VITE_APP_BRAND_NAME?.trim() || undefined
  );

  const brand = useMemo(() => holeAktuelleBrandKonfig(brandNameOverride), [brandNameOverride]);

  const setLocale = useCallback((sprache: UnterstuetzteSprache) => {
    const norm = normalisiereSprache(sprache, STANDARD_SPRACHE);
    setLocaleState(norm);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY_LOCALE, norm);
      } catch {
        // Ignorieren
      }
    }
  }, []);

  const setBrandName = useCallback((name?: string) => {
    const bereinigt = typeof name === 'string' && name.trim() ? name.trim() : undefined;
    setzeRuntimeBrandName(bereinigt);
    setBrandNameOverride(bereinigt);
  }, []);

  const t = useCallback(
    (schluessel: string, variablen?: Record<string, string | number | undefined>) =>
      uebersetzeSchluessel(CORE_WOERTERBUECHER, locale, schluessel, {
        brand: brand.produktName,
        coreName: brand.coreName,
        ...variablen,
      }),
    [locale, brand.produktName, brand.coreName]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.title = t('app.title');
  }, [locale, t]);

  const wert = useMemo<I18nKontextWert>(
    () => ({
      locale,
      setLocale,
      brand,
      setBrandName,
      t,
    }),
    [locale, setLocale, brand, setBrandName, t]
  );

  return <I18nContext.Provider value={wert}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nKontextWert {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    const brand = holeAktuelleBrandKonfig();
    return {
      locale: STANDARD_SPRACHE,
      setLocale: () => {},
      brand,
      setBrandName: () => {},
      t: (schluessel, variablen) =>
        uebersetzeSchluessel(CORE_WOERTERBUECHER, STANDARD_SPRACHE, schluessel, {
          brand: brand.produktName,
          coreName: brand.coreName,
          ...variablen,
        }),
    };
  }
  return ctx;
}

export function BrandWortmarke({
  className = '',
}: {
  className?: string;
}) {
  const { brand } = useI18n();
  const { basis, akzent } = teileWortmarke(brand.produktName);

  return (
    <span className={className}>
      {basis}
      {akzent && <span className="text-sl-accent">{akzent}</span>}
    </span>
  );
}

export function SprachUmschalter({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t('nav.languageAria')}
      className={`inline-flex items-center gap-0.5 rounded-md border border-sl-border bg-sl-surface p-0.5 ${className}`}
    >
      {UNTERSTUETZTE_SPRACHEN.map((lang) => {
        const aktiv = locale === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => setLocale(lang.code)}
            className={`rounded px-2 py-1 text-[11px] font-mono uppercase transition-colors ${
              aktiv ? 'bg-sl-border text-sl-heading' : 'text-sl-muted hover:text-sl-primary'
            }`}
          >
            {lang.code}
          </button>
        );
      })}
    </div>
  );
}
