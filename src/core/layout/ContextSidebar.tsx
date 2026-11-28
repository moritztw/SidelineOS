import { ArrowLeft, X } from 'lucide-react';

export interface SidebarNavEintrag {
  id: string;
  label: string;
  routeSegment: string;
  badge?: number;
}

export interface SidebarNavGruppe {
  id: string;
  label: string;
  items: SidebarNavEintrag[];
}

interface ContextSidebarProps {
  bereichTitel: string;
  bereichUntertitel?: string;
  gruppen: SidebarNavGruppe[];
  aktivesSegment: string;
  mobilOffen: boolean;
  onMobilSchliessen: () => void;
  onSegmentWaehlen: (routeSegment: string) => void;
  onZurueckZumHub: () => void;
}

/**
 * Ebene 2 — Einheitliche linke Kontext-Sidebar (248px, sticky):
 * Identisches Bedienmuster für Plugins, Konto, Vereins-Admin und System-Admin.
 * Jeder Eintrag navigiert auf eine echte Browser-URL (kein Scroll-Spy mehr!).
 */
export function ContextSidebar({
  bereichTitel,
  bereichUntertitel,
  gruppen,
  aktivesSegment,
  mobilOffen,
  onMobilSchliessen,
  onSegmentWaehlen,
  onZurueckZumHub,
}: ContextSidebarProps) {
  const inhalt = (
    <div className="flex h-full flex-col justify-between gap-6">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-2 border-b border-sl-border pb-3">
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-semibold text-sl-heading">
              {bereichTitel}
            </div>
            {bereichUntertitel && (
              <div className="mt-0.5 truncate text-xs text-sl-muted">{bereichUntertitel}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onMobilSchliessen}
            aria-label="Seitenmenü schließen"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sl-muted hover:text-sl-heading lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Bereichsnavigation" className="space-y-5">
          {gruppen.map((gruppe) => (
            <div key={gruppe.id} className="space-y-1">
              <div className="px-2.5 text-[11px] font-semibold text-sl-subtle">
                {gruppe.label}
              </div>
              <ul className="space-y-0.5">
                {gruppe.items.map((item) => {
                  const aktiv = item.routeSegment === aktivesSegment;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSegmentWaehlen(item.routeSegment);
                          onMobilSchliessen();
                        }}
                        aria-current={aktiv ? 'page' : undefined}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors whitespace-nowrap ${
                          aktiv
                            ? 'bg-sl-elevated text-sl-heading'
                            : 'text-sl-muted hover:bg-sl-canvas/60 hover:text-sl-primary'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="font-mono text-[11px] text-sl-accent tabular-nums">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-sl-border pt-3">
        <button
          type="button"
          onClick={() => {
            onZurueckZumHub();
            onMobilSchliessen();
          }}
          className="inline-flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-sl-muted transition-colors hover:bg-sl-canvas hover:text-sl-heading"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Zum Start-Hub</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Feste 248px Sidebar */}
      <aside className="hidden lg:sticky lg:top-20 lg:block lg:w-[248px] lg:shrink-0 rounded-lg border border-sl-border bg-sl-surface p-4">
        {inhalt}
      </aside>

      {/* Mobile: Einblendbarer Drawer */}
      {mobilOffen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={onMobilSchliessen}
            aria-hidden="true"
          />
          <aside className="relative z-50 flex h-full w-72 max-w-[85vw] flex-col border-r border-sl-border bg-sl-surface p-4">
            {inhalt}
          </aside>
        </div>
      )}
    </>
  );
}
