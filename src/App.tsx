import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  PluginSettingsPanelDef,
  SettingsPanelZiel,
  SidelinePlugin,
} from './sdk/plugin.ts';
import {
  SIDELINE_STANDARD_THEME_TOKENS,
  ermittleTeamAkzentTokens,
  loeseAktivesThemeAuf,
  sammleVerfuegbareThemes,
  type SidelineCssToken,
} from './shared/theme.ts';
import type {
  AppRouteModus,
  CoreBereich,
  NotificationEintrag,
  PluginId,
} from './shared/types.ts';
import {
  CoreApiError,
  bauePluginApiFetch,
  coreApi,
  setzeBearerToken,
  type AuthMeDTO,
  type BootstrapStatusDTO,
} from './core/apiClient.ts';
import { InviteAcceptView } from './core/auth/InviteAcceptView.tsx';
import { LoginView } from './core/auth/LoginView.tsx';
import { SidelineHubView } from './core/hub/SidelineHubView.tsx';
import { useI18n } from './core/i18n/I18nContext.tsx';
import {
  ContextSidebar,
  type SidebarNavGruppe,
} from './core/layout/ContextSidebar.tsx';
import { CoreTopBar } from './core/layout/CoreTopBar.tsx';
import { SystemBanner } from './core/layout/SystemBanner.tsx';
import {
  baueAppAnsichtPfad,
  baueRoutePfad,
  parseBrowserPfad,
  type AppAnsichtZiel,
} from './core/navigation.ts';
import { AccountPanel } from './core/settings/AccountPanel.tsx';
import { ClubAdminHost } from './core/settings/ClubAdminHost.tsx';
import { SystemRecoveryPanel } from './core/settings/SystemRecoveryPanel.tsx';
import { ladeRuntimePluginBundles } from './plugins/pluginLoader.ts';

interface RegistriertesSettingsPanel {
  plugin: SidelinePlugin;
  def: PluginSettingsPanelDef;
}

export default function App() {
  const { locale, setLocale } = useI18n();
  const initialRoute = useMemo(
    () =>
      parseBrowserPfad(
        typeof window !== 'undefined' ? window.location.pathname : '/'
      ),
    []
  );

  const [routeModus, setRouteModus] = useState<AppRouteModus>(initialRoute.routeModus);
  const [ansicht, setAnsicht] = useState<AppAnsichtZiel>(initialRoute.ansicht);

  const [bootstrap, setBootstrap] = useState<BootstrapStatusDTO | null>(null);
  const [session, setSession] = useState<AuthMeDTO | null>(null);
  const [initialisiert, setInitialisiert] = useState(false);

  const [aktiveClubId, setAktiveClubId] = useState<string | null>(null);
  const [aktiveTeamId, setAktiveTeamId] = useState<string | null>(null);
  const [archivSichtbar, setArchivSichtbar] = useState(false);
  const [sidebarMobilOffen, setSidebarMobilOffen] = useState(false);

  const [geladenePlugins, setGeladenePlugins] = useState<SidelinePlugin[]>([]);
  const [publicPlugins, setPublicPlugins] = useState<SidelinePlugin[]>([]);
  const [notifications, setNotifications] = useState<NotificationEintrag[]>([]);
  const [ungeleseneNotifications, setUngeleseneNotifications] = useState(0);

  const navigiere = useCallback(
    (zielModus: AppRouteModus, zielAnsicht?: AppAnsichtZiel, replace = false) => {
      const naechsteAnsicht = zielAnsicht ?? ansicht;
      setRouteModus(zielModus);
      if (zielAnsicht) setAnsicht(zielAnsicht);

      if (typeof window !== 'undefined') {
        const pfad = baueRoutePfad(zielModus, naechsteAnsicht);
        if (window.location.pathname !== pfad) {
          if (replace) window.history.replaceState(null, '', pfad);
          else window.history.pushState(null, '', pfad);
        }
      }
    },
    [ansicht]
  );

  // Browser-Zurück/Vorwärts synchronisieren
  useEffect(() => {
    const onPopState = () => {
      const geparst = parseBrowserPfad(window.location.pathname);
      setRouteModus(geparst.routeModus);
      setAnsicht(geparst.ansicht);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const ladeRuntimePlugins = useCallback(async () => {
    try {
      const manifest = await coreApi.holeRuntimeManifest();
      const geladen = await ladeRuntimePluginBundles(manifest.bundles);
      setGeladenePlugins(geladen);
    } catch {
      setGeladenePlugins([]);
    }
  }, []);

  const ladeSessionUndPlugins = useCallback(async () => {
    try {
      const me = await coreApi.me();
      setSession(me);
      setUngeleseneNotifications(me.ungeleseneNotifications);
      setLocale(me.user.preferredLocale);

      setAktiveClubId((prev) =>
        prev && me.clubs.some((c) => c.id === prev) ? prev : me.clubs[0]?.id ?? null
      );
      setAktiveTeamId((prev) => {
        if (prev && me.teams.some((t) => t.id === prev)) return prev;
        const erstesAktives = me.teams.find((t) => t.status === 'ACTIVE');
        return erstesAktives?.id ?? me.teams[0]?.id ?? null;
      });

      await ladeRuntimePlugins();
      return true;
    } catch {
      setSession(null);
      return false;
    }
  }, [ladeRuntimePlugins, setLocale]);

  // Initialer Boot
  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const status = await coreApi.holeBootstrapStatus();
        if (aktiv) setBootstrap(status);
      } catch {
        // Ignorieren — Fallback auf Login
      }

      if (initialRoute.routeModus.art === 'share') {
        try {
          const pub = await coreApi.holePublicManifest();
          const geladen = await ladeRuntimePluginBundles(pub.bundles);
          if (aktiv) setPublicPlugins(geladen);
        } catch {
          // Ignorieren
        }
        if (aktiv) setInitialisiert(true);
        return;
      }

      if (initialRoute.routeModus.art === 'invite') {
        if (aktiv) setInitialisiert(true);
        return;
      }

      await ladeSessionUndPlugins();
      if (aktiv) setInitialisiert(true);
    })();
    return () => {
      aktiv = false;
    };
  }, [initialRoute.routeModus.art, ladeSessionUndPlugins]);

  const aktiverClub = useMemo(
    () => session?.clubs.find((c) => c.id === aktiveClubId) ?? session?.clubs[0] ?? null,
    [session, aktiveClubId]
  );

  const aktivesTeam = useMemo(() => {
    if (!session) return null;
    const treffer = session.teams.find((t) => t.id === aktiveTeamId);
    if (treffer && (!aktiverClub || treffer.clubId === aktiverClub.id)) return treffer;
    if (!aktiverClub) return null;
    return (
      session.teams.find((t) => t.clubId === aktiverClub.id && t.status === 'ACTIVE') ??
      session.teams.find((t) => t.clubId === aktiverClub.id) ??
      null
    );
  }, [session, aktiveTeamId, aktiverClub]);

  // Verfuegbare Themes aus Bootstrap/Session + geladenen Plugins zusammenfuehren
  const verfuegbareThemes = useMemo(() => {
    const quellen = (session?.pluginThemes ?? bootstrap?.pluginThemes ?? []).map((p) => ({
      pluginId: p.pluginId,
      pluginName: p.pluginName,
      themes: p.themes,
    }));
    return sammleVerfuegbareThemes(quellen);
  }, [session?.pluginThemes, bootstrap?.pluginThemes]);

  // Aktives Theme + Team-Akzentfarbe auf :root anwenden
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const aufgeloest = loeseAktivesThemeAuf({
      userPreferredTheme: session?.user.preferredTheme,
      instanceDefaultTheme: session?.instanzTheme ?? bootstrap?.instanzTheme,
      verfuegbareThemes,
    });

    const tokens: Record<SidelineCssToken, string> = {
      ...SIDELINE_STANDARD_THEME_TOKENS,
      ...aufgeloest.preset.tokens,
    };
    if (!aufgeloest.preset.overrideTeamAccent && aktivesTeam?.akzentFarbe) {
      const akzent = ermittleTeamAkzentTokens(aktivesTeam.akzentFarbe);
      if (akzent) Object.assign(tokens, akzent);
    }

    const root = document.documentElement;
    for (const [key, wert] of Object.entries(tokens)) {
      root.style.setProperty(key, wert);
    }
  }, [
    session?.user.preferredTheme,
    session?.instanzTheme,
    bootstrap?.instanzTheme,
    verfuegbareThemes,
    aktivesTeam?.akzentFarbe,
  ]);

  // Freigeschaltete Fach-Plugins im aktuellen Club/Team-Kontext
  const aktiveScopePlugins = useMemo(() => {
    if (!session) return [];
    const clubSet = new Set(aktiverClub ? session.scopeModules.clubs[aktiverClub.id] ?? [] : []);
    const teamSet = new Set(aktivesTeam ? session.scopeModules.teams[aktivesTeam.id] ?? [] : []);
    const keineScopeRestriktion = clubSet.size === 0 && teamSet.size === 0;

    return geladenePlugins.filter((plugin) => {
      const { scopes } = plugin.manifest.navigation;
      if (scopes.includes('global')) return true;
      if (keineScopeRestriktion) return true;
      return (
        (scopes.includes('club') && clubSet.has(plugin.manifest.id)) ||
        (scopes.includes('team') && teamSet.has(plugin.manifest.id))
      );
    });
  }, [session, aktiverClub, aktivesTeam, geladenePlugins]);

  // Settings-Panels aus allen geladenen Plugins nach Ziel (account / club / system)
  const panelsFuerZiel = useCallback(
    (ziel: SettingsPanelZiel): RegistriertesSettingsPanel[] => {
      const liste: RegistriertesSettingsPanel[] = [];
      for (const plugin of geladenePlugins) {
        if (!plugin.SettingsPanel) continue;
        for (const def of plugin.manifest.navigation.settingsPanels ?? []) {
          if (def.target !== ziel) continue;
          if (
            ziel === 'club' &&
            def.requiredClubRoles?.length &&
            (!aktiverClub || !def.requiredClubRoles.includes(aktiverClub.clubRolle))
          ) {
            continue;
          }
          if (
            ziel === 'club' &&
            def.requiredTeamRoles?.length &&
            (!aktivesTeam || !def.requiredTeamRoles.includes(aktivesTeam.effektiveTeamRolle))
          ) {
            continue;
          }
          liste.push({ plugin, def });
        }
      }
      return liste;
    },
    [geladenePlugins, aktiverClub, aktivesTeam]
  );

  const aktivesModulPlugin = useMemo(
    () =>
      ansicht.bereich === 'modul' && ansicht.pluginId
        ? aktiveScopePlugins.find((p) => p.manifest.id === ansicht.pluginId) ?? null
        : null,
    [ansicht, aktiveScopePlugins]
  );

  // Einheitliche Ebene-2 Kontext-Sidebar dynamisch nach aktuellem Bereich aufbauen
  const sidebarKonfig = useMemo<{
    titel: string;
    untertitel?: string;
    gruppen: SidebarNavGruppe[];
    aktivesSegment: string;
  } | null>(() => {
    if (!session) return null;

    if (ansicht.bereich === 'account') {
      const pluginPanels = panelsFuerZiel('account');
      const gruppen: SidebarNavGruppe[] = [
        {
          id: 'core-account',
          label: 'Konto',
          items: [
            { id: 'profile', label: 'Profil & Darstellung', routeSegment: 'profile' },
            { id: 'security', label: 'Passwort & Sicherheit', routeSegment: 'security' },
          ],
        },
      ];
      if (pluginPanels.length > 0) {
        gruppen.push({
          id: 'plugin-account',
          label: 'Module',
          items: pluginPanels.map((p) => ({
            id: p.def.id,
            label: p.def.label,
            routeSegment: p.def.routeSegment,
          })),
        });
      }
      return {
        titel: 'Persönliches Konto',
        untertitel: `@${session.user.benutzername}`,
        gruppen,
        aktivesSegment: ansicht.subRoute || 'profile',
      };
    }

    if (ansicht.bereich === 'club-admin') {
      const pluginPanels = panelsFuerZiel('club');
      const gruppenMap = new Map<string, SidebarNavGruppe>();
      gruppenMap.set('Verein', {
        id: 'club-core',
        label: 'Verein',
        items: [{ id: 'overview', label: 'Übersicht & Speicher', routeSegment: 'overview' }],
      });
      for (const p of pluginPanels) {
        const gruppe = gruppenMap.get(p.def.group) ?? {
          id: `club-${p.def.group}`,
          label: p.def.group,
          items: [],
        };
        gruppe.items.push({
          id: p.def.id,
          label: p.def.label,
          routeSegment: p.def.routeSegment,
        });
        gruppenMap.set(p.def.group, gruppe);
      }
      return {
        titel: 'Vereins-Administration',
        untertitel: aktiverClub?.name,
        gruppen: Array.from(gruppenMap.values()),
        aktivesSegment: ansicht.subRoute || 'overview',
      };
    }

    if (ansicht.bereich === 'system-admin') {
      const pluginPanels = panelsFuerZiel('system');
      const gruppenMap = new Map<string, SidebarNavGruppe>();
      gruppenMap.set('System', {
        id: 'system-core',
        label: 'System',
        items: [{ id: 'recovery', label: 'Status & Archive', routeSegment: 'recovery' }],
      });
      for (const p of pluginPanels) {
        const gruppe = gruppenMap.get(p.def.group) ?? {
          id: `sys-${p.def.group}`,
          label: p.def.group,
          items: [],
        };
        gruppe.items.push({
          id: p.def.id,
          label: p.def.label,
          routeSegment: p.def.routeSegment,
        });
        gruppenMap.set(p.def.group, gruppe);
      }
      return {
        titel: 'System-Administration',
        untertitel: 'Core v0.2.0',
        gruppen: Array.from(gruppenMap.values()),
        aktivesSegment: ansicht.subRoute || 'recovery',
      };
    }

    if (ansicht.bereich === 'modul' && aktivesModulPlugin) {
      const gruppen = (aktivesModulPlugin.manifest.navigation.sidebarGroups ?? [])
        .slice(0, 3)
        .map((g) => ({
          id: g.id,
          label: g.label,
          items: g.items
            .filter((item) => {
              if (
                item.requiredClubRoles?.length &&
                (!aktiverClub || !item.requiredClubRoles.includes(aktiverClub.clubRolle))
              ) {
                return false;
              }
              if (
                item.requiredTeamRoles?.length &&
                (!aktivesTeam || !item.requiredTeamRoles.includes(aktivesTeam.effektiveTeamRolle))
              ) {
                return false;
              }
              return true;
            })
            .map((item) => ({
              id: item.id,
              label: item.label,
              routeSegment: item.routeSegment,
            })),
        }))
        .filter((g) => g.items.length > 0);

      if (gruppen.length === 0) return null;
      const ersteRoute = gruppen[0]?.items[0]?.routeSegment ?? '';
      return {
        titel: aktivesModulPlugin.manifest.name,
        untertitel: aktivesTeam?.name ?? aktiverClub?.name,
        gruppen,
        aktivesSegment: ansicht.subRoute || ersteRoute,
      };
    }

    return null;
  }, [session, ansicht, panelsFuerZiel, aktiverClub, aktivesTeam, aktivesModulPlugin]);

  const handleBereichWechseln = (bereich: CoreBereich) => {
    const standardSubRoute =
      bereich === 'account'
        ? 'profile'
        : bereich === 'club-admin'
          ? 'overview'
          : bereich === 'system-admin'
            ? 'recovery'
            : '';
    navigiere({ art: 'app' }, { bereich, pluginId: null, subRoute: standardSubRoute });
  };

  const handleModulOeffnen = (pluginId: PluginId) => {
    const plugin = aktiveScopePlugins.find((p) => p.manifest.id === pluginId);
    const ersteRoute = plugin?.manifest.navigation.sidebarGroups?.[0]?.items[0]?.routeSegment ?? '';
    navigiere({ art: 'app' }, { bereich: 'modul', pluginId, subRoute: ersteRoute });
  };

  const handleSidebarSegmentWaehlen = (routeSegment: string) => {
    navigiere({ art: 'app' }, { ...ansicht, subRoute: routeSegment });
  };

  const handleLogin = async (kennung: string, passwort: string) => {
    try {
      const res = await coreApi.login(kennung, passwort);
      setzeBearerToken(res.token);
      await ladeSessionUndPlugins();
      const ziel =
        routeModus.art === 'login' ? { bereich: 'hub' as const, pluginId: null, subRoute: '' } : ansicht;
      navigiere({ art: 'app' }, ziel, true);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        fehler: err instanceof CoreApiError ? err.message : 'Anmeldung fehlgeschlagen.',
      };
    }
  };

  const handleErstAdmin = async (daten: {
    benutzername: string;
    vollerName: string;
    email: string;
    passwort: string;
  }) => {
    try {
      const res = await coreApi.erstelleErstAdmin(daten);
      setzeBearerToken(res.token);
      setBootstrap((b) => (b ? { ...b, ersteinrichtungOffen: false } : b));
      await ladeSessionUndPlugins();
      navigiere({ art: 'app' }, { bereich: 'system-admin', pluginId: null, subRoute: 'recovery' }, true);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        fehler: err instanceof CoreApiError ? err.message : 'Ersteinrichtung fehlgeschlagen.',
      };
    }
  };

  const handleLogout = async () => {
    try {
      await coreApi.logout();
    } catch {
      // Session lokal trotzdem beenden
    }
    setzeBearerToken(null);
    setSession(null);
    setGeladenePlugins([]);
    navigiere({ art: 'login' }, { bereich: 'hub', pluginId: null, subRoute: '' }, true);
  };

  const ladeNotifications = async () => {
    try {
      const res = await coreApi.listeNotifications(25);
      setNotifications(res.notifications);
      setUngeleseneNotifications(res.ungelesen);
    } catch {
      // Ignorieren
    }
  };

  const handleNotificationKlick = async (n: NotificationEintrag) => {
    if (!n.readAt) {
      try {
        const res = await coreApi.markiereNotificationGelesen(n.id);
        setUngeleseneNotifications(res.ungelesen);
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item))
        );
      } catch {
        // Ignorieren
      }
    }
    if (n.linkPath) {
      const geparst = parseBrowserPfad(n.linkPath);
      navigiere(geparst.routeModus, geparst.ansicht);
    }
  };

  const handleAlleGelesen = async () => {
    try {
      await coreApi.markiereAlleNotificationsGelesen();
      setUngeleseneNotifications(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
      );
    } catch {
      // Ignorieren
    }
  };

  if (!initialisiert) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sl-canvas text-xs text-sl-muted">
        SidelineOS wird geladen…
      </div>
    );
  }

  // Öffentlicher Share-Link (/share/:token)
  if (routeModus.art === 'share') {
    const sharePlugin = publicPlugins.find((p) => Boolean(p.OeffentlicheAnsicht));
    const PublicComp = sharePlugin?.OeffentlicheAnsicht;
    return PublicComp ? (
      <PublicComp token={routeModus.token} locale={locale} />
    ) : (
      <div className="flex min-h-screen items-center justify-center bg-sl-canvas px-4 text-xs text-sl-muted">
        Für diesen Freigabelink ist kein öffentliches Modul aktiv.
      </div>
    );
  }

  // Öffentliche Einladung (/invite/:token)
  if (routeModus.art === 'invite') {
    return (
      <InviteAcceptView
        token={routeModus.token}
        onErfolgreichBeigetreten={async (token) => {
          setzeBearerToken(token);
          await ladeSessionUndPlugins();
          navigiere({ art: 'app' }, { bereich: 'hub', pluginId: null, subRoute: '' }, true);
        }}
        onZurAnmeldung={() => navigiere({ art: 'login' }, undefined, true)}
      />
    );
  }

  // Nicht authentifiziert -> Login / Ersteinrichtung
  if (!session) {
    return (
      <LoginView
        ersteinrichtungOffen={Boolean(bootstrap?.ersteinrichtungOffen)}
        onAnmelden={handleLogin}
        onErstAdminErstellen={handleErstAdmin}
      />
    );
  }

  const darfClubAdmin =
    aktiverClub?.clubRolle === 'CLUB_ADMIN' ||
    aktivesTeam?.effektiveTeamRolle === 'TEAM_ADMIN';

  const renderSettingsPluginPanel = (ziel: SettingsPanelZiel) => {
    const treffer = panelsFuerZiel(ziel).find((p) => p.def.routeSegment === ansicht.subRoute);
    if (!treffer || !treffer.plugin.SettingsPanel) return null;
    const PanelComp = treffer.plugin.SettingsPanel;
    const baseUrl =
      ziel === 'system'
        ? `/api/v2/plugins/${encodeURIComponent(treffer.plugin.manifest.id)}/system`
        : ziel === 'club' && aktiverClub
          ? `/api/v2/plugins/${encodeURIComponent(treffer.plugin.manifest.id)}/clubs/${encodeURIComponent(aktiverClub.id)}`
          : `/api/v2/plugins/${encodeURIComponent(treffer.plugin.manifest.id)}/system`;
    return (
      <PanelComp
        panelId={treffer.def.id}
        target={ziel}
        club={aktiverClub}
        team={aktivesTeam}
        user={session.user}
        locale={locale}
        apiFetch={bauePluginApiFetch(baseUrl)}
        onContextRefresh={async () => {
          await ladeSessionUndPlugins();
        }}
      />
    );
  };

  const renderHauptInhalt = () => {
    if (ansicht.bereich === 'hub') {
      return (
        <SidelineHubView
          aktivePlugins={aktiveScopePlugins}
          aktiverClub={aktiverClub}
          aktivesTeam={aktivesTeam}
          istSysadmin={session.user.istSysadmin}
          onModulOeffnen={handleModulOeffnen}
          onSystemOeffnen={() => handleBereichWechseln('system-admin')}
        />
      );
    }

    if (ansicht.bereich === 'account') {
      const pluginPanel = renderSettingsPluginPanel('account');
      if (pluginPanel) return pluginPanel;
      return (
        <AccountPanel
          subRoute={ansicht.subRoute || 'profile'}
          user={session.user}
          verfuegbareThemes={verfuegbareThemes}
          onProfilAktualisiert={(user) => setSession((prev) => (prev ? { ...prev, user } : prev))}
        />
      );
    }

    if (ansicht.bereich === 'club-admin') {
      if (!darfClubAdmin) {
        return (
          <div className="rounded-lg border border-sl-border bg-sl-surface p-6 text-xs text-sl-danger-text">
            Keine Berechtigung für die Vereins-Administration.
          </div>
        );
      }
      const pluginPanel = renderSettingsPluginPanel('club');
      if (pluginPanel) return pluginPanel;
      const clubTeams = aktiverClub
        ? session.teams.filter((t) => t.clubId === aktiverClub.id)
        : [];
      return (
        <ClubAdminHost
          club={aktiverClub}
          clubTeams={clubTeams}
          hatClubAdminPlugins={panelsFuerZiel('club').length > 0}
        />
      );
    }

    if (ansicht.bereich === 'system-admin') {
      if (!session.user.istSysadmin) {
        return (
          <div className="rounded-lg border border-sl-border bg-sl-surface p-6 text-xs text-sl-danger-text">
            System-Administration ist ausschließlich für Sysadmins freigegeben.
          </div>
        );
      }
      const pluginPanel = renderSettingsPluginPanel('system');
      if (pluginPanel) return pluginPanel;
      return (
        <SystemRecoveryPanel
          verfuegbareThemes={verfuegbareThemes}
          onSystemGeaendert={async () => {
            await ladeSessionUndPlugins();
          }}
        />
      );
    }

    if (ansicht.bereich === 'modul' && aktivesModulPlugin?.HauptAnsicht) {
      const PluginComp = aktivesModulPlugin.HauptAnsicht;
      const nutztTeamScope =
        aktivesModulPlugin.manifest.navigation.scopes.includes('team') && Boolean(aktivesTeam);
      const apiBaseUrl = nutztTeamScope && aktivesTeam
        ? `/api/v2/plugins/${encodeURIComponent(aktivesModulPlugin.manifest.id)}/teams/${encodeURIComponent(aktivesTeam.id)}`
        : aktiverClub
          ? `/api/v2/plugins/${encodeURIComponent(aktivesModulPlugin.manifest.id)}/clubs/${encodeURIComponent(aktiverClub.id)}`
          : `/api/v2/plugins/${encodeURIComponent(aktivesModulPlugin.manifest.id)}/system`;

      const ersteRoute =
        aktivesModulPlugin.manifest.navigation.sidebarGroups?.[0]?.items[0]?.routeSegment ?? '';

      return (
        <PluginComp
          ctx={{
            pluginId: aktivesModulPlugin.manifest.id,
            club: aktiverClub,
            team: aktivesTeam,
            isReadOnly: aktivesTeam?.status === 'ARCHIVED',
            clubRolle: aktiverClub?.clubRolle ?? null,
            effektiveTeamRolle: aktivesTeam?.effektiveTeamRolle ?? null,
            user: session.user,
            userGroups: aktivesTeam?.groups ?? [],
            activeView: ansicht.subRoute || ersteRoute,
            navigateToView: (routeSegment) =>
              navigiere({ art: 'app' }, { ...ansicht, subRoute: routeSegment }),
            locale,
            apiBaseUrl,
            apiFetch: bauePluginApiFetch(apiBaseUrl),
          }}
        />
      );
    }

    return (
      <div className="rounded-lg border border-sl-border bg-sl-surface p-6 text-xs text-sl-muted">
        Das angeforderte Modul ist in diesem Kontext nicht verfügbar.{' '}
        <button
          type="button"
          onClick={() => handleBereichWechseln('hub')}
          className="font-medium text-sl-accent hover:text-sl-accent-hover"
        >
          Zurück zum Start-Hub
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-sl-canvas text-sl-primary">
      <CoreTopBar
        bereich={ansicht.bereich}
        aktivesModulName={aktivesModulPlugin?.manifest.name ?? null}
        user={session.user}
        clubs={session.clubs}
        teams={session.teams}
        aktiverClub={aktiverClub}
        aktivesTeam={aktivesTeam}
        archivSichtbar={archivSichtbar}
        hatSidebar={Boolean(sidebarKonfig)}
        ungeleseneNotifications={ungeleseneNotifications}
        notifications={notifications}
        onSidebarMobilOeffnen={() => setSidebarMobilOffen(true)}
        onArchivSichtbarWechseln={setArchivSichtbar}
        onKontextWechseln={(clubId, teamId) => {
          setAktiveClubId(clubId);
          setAktiveTeamId(teamId);
        }}
        onBereichWechseln={handleBereichWechseln}
        onNotificationsLaden={ladeNotifications}
        onNotificationKlick={handleNotificationKlick}
        onAlleGelesen={handleAlleGelesen}
        onLogout={handleLogout}
      />

      <SystemBanner
        club={aktiverClub}
        team={aktivesTeam}
        onClubSpeicherOeffnen={
          darfClubAdmin
            ? () => {
                const ziel: AppAnsichtZiel = {
                  bereich: 'club-admin',
                  pluginId: null,
                  subRoute: 'overview',
                };
                navigiere({ art: 'app' }, ziel);
              }
            : undefined
        }
      />

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        {sidebarKonfig ? (
          <div className="flex items-start gap-6">
            <ContextSidebar
              bereichTitel={sidebarKonfig.titel}
              bereichUntertitel={sidebarKonfig.untertitel}
              gruppen={sidebarKonfig.gruppen}
              aktivesSegment={sidebarKonfig.aktivesSegment}
              mobilOffen={sidebarMobilOffen}
              onMobilSchliessen={() => setSidebarMobilOffen(false)}
              onSegmentWaehlen={handleSidebarSegmentWaehlen}
              onZurueckZumHub={() => handleBereichWechseln('hub')}
            />
            <div className="min-w-0 flex-1">{renderHauptInhalt()}</div>
          </div>
        ) : (
          renderHauptInhalt()
        )}
      </main>
    </div>
  );
}

export { baueAppAnsichtPfad };
