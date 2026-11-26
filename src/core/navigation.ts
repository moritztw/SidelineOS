import type { AppRouteModus, CoreBereich, PluginId } from '../shared/types.ts';

export interface AppAnsichtZiel {
  bereich: CoreBereich;
  pluginId: PluginId | null;
  pluginTab: string;
}

export interface GeparsterBrowserPfad {
  routeModus: AppRouteModus;
  ansicht: AppAnsichtZiel;
  istBekannterAppPfad: boolean;
}

function decodeSegmentSicher(segment: string): string {
  try {
    return decodeURIComponent(segment).trim();
  } catch {
    return segment.trim();
  }
}

/**
 * Parst eine Browser-URL vollständig in `routeModus` (public vs. app) und `AppAnsichtZiel`.
 * Sprechende Core-Pfade:
 * - `/`                          -> Hub
 * - `/settings`                  -> Einstellungs-Hub
 * - `/settings/account`          -> Persönliche Einstellungen
 * - `/settings/team`             -> Team-Einstellungen
 * - `/sysadmin`                  -> Sysadmin-Administration
 * - `/modules/<pluginId>`        -> Plugin-Hauptansicht (Standard-Tab)
 * - `/modules/<pluginId>/<tab>`  -> Plugin-Hauptansicht mit aktivem Tab
 */
export function parseBrowserPfad(pathname: string): GeparsterBrowserPfad {
  const ohneQuery = pathname.split(/[?#]/)[0] ?? '/';
  const bereinigt = ohneQuery.trim().replace(/\/+$/, '') || '/';

  if (bereinigt === '/login') {
    return {
      routeModus: { art: 'login' },
      ansicht: { bereich: 'hub', pluginId: null, pluginTab: '' },
      istBekannterAppPfad: true,
    };
  }

  const inviteMatch = bereinigt.match(/^\/invite\/([^/]+)$/);
  if (inviteMatch && inviteMatch[1]) {
    return {
      routeModus: { art: 'invite', token: decodeSegmentSicher(inviteMatch[1]) },
      ansicht: { bereich: 'hub', pluginId: null, pluginTab: '' },
      istBekannterAppPfad: true,
    };
  }

  const shareMatch = bereinigt.match(/^\/share\/([^/]+)$/);
  if (shareMatch && shareMatch[1]) {
    return {
      routeModus: { art: 'share', token: decodeSegmentSicher(shareMatch[1]) },
      ansicht: { bereich: 'hub', pluginId: null, pluginTab: '' },
      istBekannterAppPfad: true,
    };
  }

  if (bereinigt === '/') {
    return {
      routeModus: { art: 'app' },
      ansicht: { bereich: 'hub', pluginId: null, pluginTab: '' },
      istBekannterAppPfad: true,
    };
  }

  if (bereinigt === '/settings') {
    return {
      routeModus: { art: 'app' },
      ansicht: { bereich: 'settings-hub', pluginId: null, pluginTab: '' },
      istBekannterAppPfad: true,
    };
  }

  if (bereinigt === '/settings/account') {
    return {
      routeModus: { art: 'app' },
      ansicht: { bereich: 'settings', pluginId: null, pluginTab: '' },
      istBekannterAppPfad: true,
    };
  }

  if (bereinigt === '/settings/team') {
    return {
      routeModus: { art: 'app' },
      ansicht: { bereich: 'team-settings', pluginId: null, pluginTab: '' },
      istBekannterAppPfad: true,
    };
  }

  if (bereinigt === '/sysadmin') {
    return {
      routeModus: { art: 'app' },
      ansicht: { bereich: 'sysadmin', pluginId: null, pluginTab: '' },
      istBekannterAppPfad: true,
    };
  }

  const modulMatch = bereinigt.match(/^\/modules\/([^/]+)(?:\/([^/]+))?$/);
  if (modulMatch && modulMatch[1]) {
    const pluginId = decodeSegmentSicher(modulMatch[1]);
    const pluginTab = modulMatch[2] ? decodeSegmentSicher(modulMatch[2]) : '';
    if (pluginId && /^[a-z0-9-]+$/i.test(pluginId)) {
      return {
        routeModus: { art: 'app' },
        ansicht: {
          bereich: 'modul',
          pluginId: pluginId.toLowerCase(),
          pluginTab,
        },
        istBekannterAppPfad: true,
      };
    }
  }

  return {
    routeModus: { art: 'app' },
    ansicht: { bereich: 'hub', pluginId: null, pluginTab: '' },
    istBekannterAppPfad: false,
  };
}

/**
 * Serialisiert eine interne Core-Ansicht in einen sprechenden Browser-Pfad.
 */
export function baueAppAnsichtPfad(ansicht: AppAnsichtZiel): string {
  switch (ansicht.bereich) {
    case 'hub':
      return '/';
    case 'settings-hub':
      return '/settings';
    case 'settings':
      return '/settings/account';
    case 'team-settings':
      return '/settings/team';
    case 'sysadmin':
      return '/sysadmin';
    case 'modul': {
      const id = ansicht.pluginId?.trim();
      if (!id) return '/';
      const tab = ansicht.pluginTab.trim();
      return tab
        ? `/modules/${encodeURIComponent(id)}/${encodeURIComponent(tab)}`
        : `/modules/${encodeURIComponent(id)}`;
    }
  }
}

/**
 * Serialisiert öffentliche oder App-Routen in den passenden Browser-Pfad.
 */
export function baueRoutePfad(routeModus: AppRouteModus, ansicht?: AppAnsichtZiel): string {
  if (routeModus.art === 'login') return '/login';
  if (routeModus.art === 'invite') return `/invite/${encodeURIComponent(routeModus.token)}`;
  if (routeModus.art === 'share') return `/share/${encodeURIComponent(routeModus.token)}`;
  return ansicht ? baueAppAnsichtPfad(ansicht) : '/';
}
