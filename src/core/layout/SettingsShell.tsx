import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext.tsx';

export interface SettingsKategorie {
  id: string;
  label: string;
  gruppe: string;
  badge?: number;
}

interface SettingsShellProps {
  titel: string;
  untertitel: string;
  kategorien: SettingsKategorie[];
  kopfAktion?: ReactNode;
  zurueckLabel?: string;
  onZurueck?: () => void;
  children: ReactNode;
}

/**
 * Einheitliches 2-Spalten-Layout für alle zentralen SidelineOS-Einstellungsseiten
 * mit offenem sticky Seitenmenü zum direkten Scroll-Sprung in jede Kategorie.
 */
export function SettingsShell({
  titel,
  untertitel,
  kategorien,
  kopfAktion,
  zurueckLabel,
  onZurueck,
  children,
}: SettingsShellProps) {
  const { t } = useI18n();
  const [aktiveId, setAktiveId] = useState<string>(kategorien[0]?.id ?? '');

  useEffect(() => {
    if (kategorien.length === 0) return;
    if (!kategorien.some((k) => k.id === aktiveId)) {
      setAktiveId(kategorien[0].id);
    }
  }, [kategorien, aktiveId]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const elemente = kategorien
      .map((k) => document.getElementById(k.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elemente.length === 0) return;

    const observer = new IntersectionObserver(
      (eintraege) => {
        const sichtbar = eintraege
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (sichtbar[0]?.target.id) {
          setAktiveId(sichtbar[0].target.id);
        }
      },
      {
        rootMargin: '-100px 0px -65% 0px',
        threshold: 0.05,
      }
    );

    elemente.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [kategorien]);

  const springeZu = (id: string) => {
    setAktiveId(id);
    const ziel = document.getElementById(id);
    if (ziel) {
      ziel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Gruppenreihenfolge stabil erhalten
  const gruppen = Array.from(new Set(kategorien.map((k) => k.gruppe)));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-sl-border bg-sl-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {onZurueck && (
              <button
                type="button"
                onClick={onZurueck}
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-sl-muted transition-colors hover:text-sl-accent"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {zurueckLabel ?? t('settingsShell.allSettings')}
              </button>
            )}
            <h1 className="text-lg font-semibold text-sl-heading">{titel}</h1>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-sl-muted">{untertitel}</p>
          </div>
          {kopfAktion && <div className="shrink-0">{kopfAktion}</div>}
        </div>
      </section>

      {/* Mobile Kategorie-Schnellnavigation */}
      <nav
        aria-label={t('settingsShell.mobileNavAria')}
        className="flex items-center gap-2 overflow-x-auto pb-1 lg:hidden"
      >
        {kategorien.map((kat) => {
          const aktiv = kat.id === aktiveId;
          return (
            <button
              key={kat.id}
              type="button"
              onClick={() => springeZu(kat.id)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                aktiv
                  ? 'border-sl-accent bg-sl-accent/10 text-sl-accent'
                  : 'border-sl-border bg-sl-surface text-sl-muted hover:text-sl-heading'
              }`}
            >
              {kat.label}
              {kat.badge !== undefined && kat.badge > 0 && (
                <span className="ml-1.5 font-mono text-[10px] text-sl-accent">({kat.badge})</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        {/* Offenes, dauerhaft sichtbares sticky Seitenmenü */}
        <aside
          aria-label={t('settingsShell.sideNavAria')}
          className="hidden lg:sticky lg:top-20 lg:block rounded-lg border border-sl-border bg-sl-surface p-3"
        >
          <div className="space-y-4">
            {gruppen.map((gruppe) => (
              <div key={gruppe} className="space-y-1">
                <div className="px-2.5 py-1 text-[11px] font-semibold text-sl-subtle">
                  {gruppe}
                </div>
                <ul className="space-y-0.5">
                  {kategorien
                    .filter((k) => k.gruppe === gruppe)
                    .map((kat) => {
                      const aktiv = kat.id === aktiveId;
                      return (
                        <li key={kat.id}>
                          <button
                            type="button"
                            onClick={() => springeZu(kat.id)}
                            className={`flex w-full items-center justify-between gap-2 rounded-md border-l-2 px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                              aktiv
                                ? 'border-sl-accent bg-sl-canvas text-sl-heading'
                                : 'border-transparent text-sl-muted hover:bg-sl-canvas/60 hover:text-sl-primary'
                            }`}
                          >
                            <span className="truncate">{kat.label}</span>
                            {kat.badge !== undefined && kat.badge > 0 && (
                              <span className="font-mono text-[10px] font-semibold text-sl-accent tabular-nums">
                                {kat.badge}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Rechte Inhalts-Spalte */}
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
