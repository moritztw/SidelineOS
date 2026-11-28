import { useState } from 'react';
import { Bell, ChevronDown, LogOut, Menu, Settings } from 'lucide-react';
import type { SessionClubDTO, SessionTeamDTO } from '../apiClient.ts';
import type { BenutzerKonto, CoreBereich, NotificationEintrag } from '../../shared/types.ts';
import { BrandWortmarke } from '../i18n/I18nContext.tsx';

interface CoreTopBarProps {
  bereich: CoreBereich;
  aktivesModulName: string | null;
  user: BenutzerKonto;
  clubs: SessionClubDTO[];
  teams: SessionTeamDTO[];
  aktiverClub: SessionClubDTO | null;
  aktivesTeam: SessionTeamDTO | null;
  archivSichtbar: boolean;
  hatSidebar: boolean;
  ungeleseneNotifications: number;
  notifications: NotificationEintrag[];
  onSidebarMobilOeffnen: () => void;
  onArchivSichtbarWechseln: (sichtbar: boolean) => void;
  onKontextWechseln: (clubId: string, teamId: string | null) => void;
  onBereichWechseln: (bereich: CoreBereich) => void;
  onNotificationsLaden: () => Promise<void>;
  onNotificationKlick: (n: NotificationEintrag) => void;
  onAlleGelesen: () => void;
  onLogout: () => void;
}

/**
 * Ebene 0 — Feste TopBar (56px, sticky, 3 Zonen):
 * Bleibt in Core-Ansichten, Einstellungen und Plugins unverändert (kein TopBar-Hijacking mehr!).
 */
export function CoreTopBar({
  bereich,
  aktivesModulName,
  user,
  clubs,
  teams,
  aktiverClub,
  aktivesTeam,
  archivSichtbar,
  hatSidebar,
  ungeleseneNotifications,
  notifications,
  onSidebarMobilOeffnen,
  onArchivSichtbarWechseln,
  onKontextWechseln,
  onBereichWechseln,
  onNotificationsLaden,
  onNotificationKlick,
  onAlleGelesen,
  onLogout,
}: CoreTopBarProps) {
  const [kontextOffen, setKontextOffen] = useState(false);
  const [glockeOffen, setGlockeOffen] = useState(false);
  const [kontoOffen, setKontoOffen] = useState(false);

  const darfClubAdmin =
    aktiverClub?.clubRolle === 'CLUB_ADMIN' ||
    aktivesTeam?.effektiveTeamRolle === 'TEAM_ADMIN';

  const darfArchivSehen =
    aktiverClub?.clubRolle === 'CLUB_ADMIN' ||
    teams.some((t) => t.status === 'ARCHIVED' && (t.effektiveTeamRolle === 'TEAM_ADMIN' || t.effektiveTeamRolle === 'STAFF'));

  const sichtbareTeamsFuerClub = (clubId: string) =>
    teams.filter(
      (t) => t.clubId === clubId && (archivSichtbar || t.status === 'ACTIVE')
    );

  const oeffneGlocke = () => {
    const naechster = !glockeOffen;
    setGlockeOffen(naechster);
    setKontextOffen(false);
    setKontoOffen(false);
    if (naechster) {
      void onNotificationsLaden();
    }
  };

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-sl-border bg-sl-topbar/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Wortmarke + Kontext-Breadcrumb */}
        <div className="flex min-w-0 items-center gap-2.5 shrink-0">
          {hatSidebar && (
            <button
              type="button"
              onClick={onSidebarMobilOeffnen}
              aria-label="Seitenmenü öffnen"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-sl-border text-sl-muted hover:text-sl-heading lg:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onBereichWechseln('hub')}
            className="font-display text-lg font-bold tracking-tight text-sl-heading whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sl-accent"
          >
            <BrandWortmarke />
          </button>

          {aktivesModulName && bereich === 'modul' && (
            <span className="hidden items-center gap-2 text-xs text-sl-muted sm:inline-flex whitespace-nowrap">
              <span aria-hidden="true" className="text-sl-border-strong">/</span>
              <span className="font-medium text-sl-primary">{aktivesModulName}</span>
            </span>
          )}
        </div>

        {/* Zone 2: Globale einzeilige Text-Navigation (bleibt auch in Plugins stabil!) */}
        <nav aria-label="Hauptnavigation" className="hidden md:flex items-center gap-6">
          <button
            type="button"
            onClick={() => onBereichWechseln('hub')}
            className={`relative h-14 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
              bereich === 'hub' ? 'text-sl-heading' : 'text-sl-muted hover:text-sl-primary'
            }`}
          >
            Start
            {bereich === 'hub' && (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-sl-accent" />
            )}
          </button>

          {darfClubAdmin && (
            <button
              type="button"
              onClick={() => onBereichWechseln('club-admin')}
              className={`relative h-14 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                bereich === 'club-admin' ? 'text-sl-heading' : 'text-sl-muted hover:text-sl-primary'
              }`}
            >
              Verein
              {bereich === 'club-admin' && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-sl-accent" />
              )}
            </button>
          )}

          {user.istSysadmin && (
            <button
              type="button"
              onClick={() => onBereichWechseln('system-admin')}
              className={`relative h-14 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                bereich === 'system-admin' ? 'text-sl-heading' : 'text-sl-muted hover:text-sl-primary'
              }`}
            >
              System
              {bereich === 'system-admin' && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-sl-accent" />
              )}
            </button>
          )}
        </nav>

        {/* Zone 3: Kontextwechsler + Glocke + Konto */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Club-/Team-Wechsler (#23, #25) */}
          {clubs.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setKontextOffen((v) => !v);
                  setGlockeOffen(false);
                  setKontoOffen(false);
                }}
                className="inline-flex h-9 max-w-[240px] items-center gap-2 rounded-md border border-sl-border bg-sl-surface px-3 text-xs font-medium text-sl-primary hover:border-sl-border-strong whitespace-nowrap"
              >
                <span className="truncate">
                  {aktiverClub?.name}
                  {aktivesTeam ? ` · ${aktivesTeam.name}` : ''}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sl-muted" aria-hidden="true" />
              </button>

              {kontextOffen && (
                <div className="absolute right-0 mt-2 w-72 rounded-lg border border-sl-border bg-sl-surface p-3 shadow-lg z-40">
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {clubs.map((club) => {
                      const clubTeams = sichtbareTeamsFuerClub(club.id);
                      return (
                        <div key={club.id} className="space-y-1">
                          <div className="px-2 text-[11px] font-semibold text-sl-subtle">
                            {club.name}
                          </div>
                          {clubTeams.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                onKontextWechseln(club.id, null);
                                setKontextOffen(false);
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-sl-muted hover:bg-sl-canvas hover:text-sl-heading"
                            >
                              <span>Vereinskontext öffnen</span>
                            </button>
                          ) : (
                            clubTeams.map((team) => {
                              const aktiv = aktivesTeam?.id === team.id;
                              return (
                                <button
                                  key={team.id}
                                  type="button"
                                  onClick={() => {
                                    onKontextWechseln(club.id, team.id);
                                    setKontextOffen(false);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                    aktiv
                                      ? 'bg-sl-canvas font-semibold text-sl-heading'
                                      : 'text-sl-muted hover:bg-sl-canvas/60 hover:text-sl-primary'
                                  }`}
                                >
                                  <span className="truncate">{team.name}</span>
                                  {team.status === 'ARCHIVED' && (
                                    <span className="font-mono text-[10px] text-sl-subtle">
                                      Archiv
                                    </span>
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {darfArchivSehen && (
                    <div className="mt-3 border-t border-sl-border pt-2.5">
                      <label className="flex cursor-pointer items-center justify-between px-2 text-xs text-sl-muted">
                        <span>Archivierte Teams zeigen</span>
                        <input
                          type="checkbox"
                          checked={archivSichtbar}
                          onChange={(e) => onArchivSichtbarWechseln(e.target.checked)}
                          className="accent-sl-accent"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* In-App-Posteingang */}
          <div className="relative">
            <button
              type="button"
              onClick={oeffneGlocke}
              aria-label="Benachrichtigungen"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-sl-border bg-sl-surface text-sl-muted hover:text-sl-heading"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {ungeleseneNotifications > 0 && (
                <span className="absolute -right-1 -top-1 rounded-sm bg-sl-accent px-1 font-mono text-[10px] font-semibold text-sl-accent-contrast tabular-nums">
                  {ungeleseneNotifications > 9 ? '9+' : ungeleseneNotifications}
                </span>
              )}
            </button>

            {glockeOffen && (
              <div className="absolute right-0 mt-2 w-80 rounded-lg border border-sl-border bg-sl-surface p-3 shadow-lg z-40">
                <div className="flex items-center justify-between border-b border-sl-border pb-2">
                  <span className="text-xs font-semibold text-sl-heading">Posteingang</span>
                  {ungeleseneNotifications > 0 && (
                    <button
                      type="button"
                      onClick={onAlleGelesen}
                      className="text-[11px] font-medium text-sl-accent hover:text-sl-accent-hover"
                    >
                      Alle gelesen
                    </button>
                  )}
                </div>
                <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="py-6 text-center text-xs text-sl-muted">
                      Keine Benachrichtigungen vorhanden.
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          onNotificationKlick(n);
                          setGlockeOffen(false);
                        }}
                        className={`block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-sl-canvas ${
                          n.readAt ? 'text-sl-muted' : 'bg-sl-canvas/70 text-sl-primary'
                        }`}
                      >
                        <div className="text-xs font-medium text-sl-heading">{n.title}</div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-sl-muted">
                          {n.message}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Benutzer-Menü */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setKontoOffen((v) => !v);
                setKontextOffen(false);
                setGlockeOffen(false);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-sl-border bg-sl-surface px-3 text-xs font-medium text-sl-primary hover:border-sl-border-strong whitespace-nowrap"
            >
              <span className="max-w-[120px] truncate">{user.vollerName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-sl-muted" aria-hidden="true" />
            </button>

            {kontoOffen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-sl-border bg-sl-surface p-2 shadow-lg z-40">
                <div className="border-b border-sl-border px-2.5 py-2">
                  <div className="truncate text-xs font-semibold text-sl-heading">
                    {user.vollerName}
                  </div>
                  <div className="truncate text-[11px] text-sl-muted">@{user.benutzername}</div>
                </div>
                <div className="mt-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onBereichWechseln('account');
                      setKontoOffen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-sl-primary hover:bg-sl-canvas"
                  >
                    <Settings className="h-3.5 w-3.5 text-sl-muted" aria-hidden="true" />
                    <span>Persönliches Konto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setKontoOffen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-sl-danger-text hover:bg-sl-canvas"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Abmelden</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
