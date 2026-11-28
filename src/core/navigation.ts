import type { AppRouteModus, CoreBereich, PluginId } from '../shared/types.ts';

export interface AppAnsichtZiel {
  bereich: CoreBereich;
  pluginId: PluginId | null;
  subRoute: string;
}

export interface GeparsterBrowserPfad {
  routeModus: AppRouteModus;
  ansicht: AppAnsichtZiel;
  istBekannterAppPfad: boolean;
}

function decodeSicher(segment: string): string {
  try {
    return decodeURIComponent(segment).trim();
  } catch {
    return segment.trim();
  }
}

/**
 * Verbindlicher 4-Ebenen-URL-Router von SidelineOS-core v0.2.0 (#23):
 * - `/`                          -> Ebene 1: Start-Hub
 * - `/modules/<id>`              -> Ebene 2/3: Plugin-Arbeitsbereich (Standard-View)
 * - `/modules/<id>/<view>`       -> Ebene 2/3: Plugin-Sidebar-Route
 * - `/settings/account[/<panel>]`-> Persönliches Konto (Core + ui:account-panel)
 * - `/admin/club[/<panel>]`      -> Vereins- & Teamverwaltung (Core-Host + ui:club-panel)
 * - `/admin/system[/<panel>]`    -> System-Administration (Notfall-Admin + ui:system-panel)
 * - `/login`, `/invite/<token>`, `/share/<token>`
 */
export function parseBrowserPfad(pathname: string): GeparsterBrowserPfad {
  const ohneQuery = pathname.split(/[?#]/)[0] ?? '/';
  const bereinigt = ohneQuery.trim().replace(/\/+$/, '') || '/';

  if (bereinigt === '/login') {
    return {
      routeModus: { art: 'login' },
      ansicht: { bereich: 'hub', pluginId: null, subRoute: '' },
      istBekannterAppPfad: true,
    };
  }

  const inviteMatch = bereinigt.match(/^\/invite\/([^/]+)$/);
  if (inviteMatch?.[1]) {
    return {
      routeModus: { art: 'invite', token: decodeSicher(inviteMatch[1]) },
      ansicht: { bereich: 'hub', pluginId: null, subRoute: '' },
      istBekannterAppPfad: true,
    };
  }

  const shareMatch = bereinigt.match(/^\/share\/([^/]+)$/);
  if (shareMatch?.[1]) {
    return {
      routeModus: { art: 'share', token: decodeSicher(shareMatch[1]) },
      ansicht: { bereich: 'hub', pluginId: null, subRoute: '' },
      istBekannterAppPfad: true,
    };
  }

  if (bereinigt === '/') {
    return {
      routeModus: { art: 'app' },
      ansicht: { bereich: 'hub', pluginId: null, subRoute: '' },
      istBekannterAppPfad: true,
    };
  }

  const accountMatch = bereinigt.match(/^\/settings\/account(?:\/([^/]+))?$/);
  if (accountMatch) {
    return {
      routeModus: { art: 'app' },
      ansicht: {
        bereich: 'account',
        pluginId: null,
        subRoute: accountMatch[1] ? decodeSicher(accountMatch[1]) : 'profile',
      },
      istBekannterAppPfad: true,
    };
  }

  const clubAdminMatch = bereinigt.match(/^\/admin\/club(?:\/([^/]+))?$/);
  if (clubAdminMatch) {
    return {
      routeModus: { art: 'app' },
      ansicht: {
        bereich: 'club-admin',
        pluginId: null,
        subRoute: clubAdminMatch[1] ? decodeSicher(clubAdminMatch[1]) : 'overview',
      },
      istBekannterAppPfad: true,
    };
  }

  const systemAdminMatch = bereinigt.match(/^\/admin\/system(?:\/([^/]+))?$/);
  if (systemAdminMatch) {
    return {
      routeModus: { art: 'app' },
      ansicht: {
        bereich: 'system-admin',
        pluginId: null,
        subRoute: systemAdminMatch[1] ? decodeSicher(systemAdminMatch[1]) : 'recovery',
      },
      istBekannterAppPfad: true,
    };
  }

  const modulMatch = bereinigt.match(/^\/modules\/([^/]+)(?:\/([^/]+))?$/);
  if (modulMatch?.[1]) {
    const pluginId = decodeSicher(modulMatch[1]).toLowerCase();
    const subRoute = modulMatch[2] ? decodeSicher(modulMatch[2]) : '';
    if (/^[a-z0-9-]+$/.test(pluginId)) {
      return {
        routeModus: { art: 'app' },
        ansicht: { bereich: 'modul', pluginId, subRoute },
        istBekannterAppPfad: true,
      };
    }
  }

  return {
    routeModus: { art: 'app' },
    ansicht: { bereich: 'hub', pluginId: null, subRoute: '' },
    istBekannterAppPfad: false,
  };
}

export function baueAppAnsichtPfad(ansicht: AppAnsichtZiel): string {
  switch (ansicht.bereich) {
    case 'hub':
      return '/';
    case 'account':
      return ansicht.subRoute && ansicht.subRoute !== 'profile'
        ? `/settings/account/${encodeURIComponent(ansicht.subRoute)}`
        : '/settings/account';
    case 'club-admin':
      return ansicht.subRoute && ansicht.subRoute !== 'overview'
        ? `/admin/club/${encodeURIComponent(ansicht.subRoute)}`
        : '/admin/club';
    case 'system-admin':
      return ansicht.subRoute && ansicht.subRoute !== 'recovery'
        ? `/admin/system/${encodeURIComponent(ansicht.subRoute)}`
        : '/admin/system';
    case 'modul': {
      const id = ansicht.pluginId?.trim();
      if (!id) return '/';
      return ansicht.subRoute
        ? `/modules/${encodeURIComponent(id)}/${encodeURIComponent(ansicht.subRoute)}`
        : `/modules/${encodeURIComponent(id)}`;
    }
  }
}

export function baueRoutePfad(routeModus: AppRouteModus, ansicht?: AppAnsichtZiel): string {
  if (routeModus.art === 'login') return '/login';
  if (routeModus.art === 'invite') return `/invite/${encodeURIComponent(routeModus.token)}`;
  if (routeModus.art === 'share') return `/share/${encodeURIComponent(routeModus.token)}`;
  return ansicht ? baueAppAnsichtPfad(ansicht) : '/';
}
