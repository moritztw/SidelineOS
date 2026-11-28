import type { NextFunction, Request, Response } from 'express';
import type {
  BenutzerKonto,
  ClubRolle,
  EffektiveTeamBerechtigung,
  TeamRolle,
} from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { hashSessionToken } from '../security.ts';

export const SESSION_COOKIE_NAME = 'sidelineos_session';

export interface CoreAuthKontext {
  user: BenutzerKonto;
  tokenHash: string;
  viaCookie: boolean;
}

declare global {
  namespace Express {
    interface Request {
      coreAuth?: CoreAuthKontext;
      coreTeamAccess?: EffektiveTeamBerechtigung;
    }
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const ergebnis: Record<string, string> = {};
  for (const teil of cookieHeader.split(';')) {
    const idx = teil.indexOf('=');
    if (idx <= 0) continue;
    const key = teil.slice(0, idx).trim();
    const val = teil.slice(idx + 1).trim();
    if (!key) continue;
    try {
      ergebnis[key] = decodeURIComponent(val);
    } catch {
      ergebnis[key] = val;
    }
  }
  return ergebnis;
}

export function extrahiereSessionToken(req: Request): { token: string; viaCookie: boolean } | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, viaCookie: false };
  }

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME]?.trim();
  if (cookieToken) return { token: cookieToken, viaCookie: true };
  return null;
}

function istHttpsAnfrage(config: CoreServerConfig, req: Request): boolean {
  const protoHeader = String(req.headers['x-forwarded-proto'] ?? '').toLowerCase();
  return req.secure || protoHeader.includes('https') || config.appUrl.startsWith('https://');
}

export function setzeSessionCookie(
  res: Response,
  req: Request,
  config: CoreServerConfig,
  token: string
): void {
  const maxAge = Math.max(60, Math.round(config.sessionTtlStunden * 3600));
  const teile = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAge}`,
  ];
  if (istHttpsAnfrage(config, req)) {
    teile.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    teile.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', teile.join('; '));
}

export function loescheSessionCookie(
  res: Response,
  req: Request,
  config: CoreServerConfig
): void {
  const teile = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (istHttpsAnfrage(config, req)) {
    teile.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    teile.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', teile.join('; '));
}

function pruefeCookieCsrf(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  const origin = req.headers.origin;
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').toLowerCase();
  if (typeof origin === 'string' && origin.trim() !== '') {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (host && originHost !== host) return false;
    } catch {
      return false;
    }
  }

  const fetchSite = String(req.headers['sec-fetch-site'] ?? '').toLowerCase();
  if (fetchSite === 'cross-site' && !req.headers['x-requested-with']) {
    return false;
  }
  return true;
}

export function requireAuth(repo: CoreRepository, config: CoreServerConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const gefunden = extrahiereSessionToken(req);
      if (!gefunden) {
        res.status(401).json({ fehler: 'Anmeldung erforderlich.' });
        return;
      }
      if (gefunden.viaCookie && !pruefeCookieCsrf(req)) {
        res.status(403).json({ fehler: 'Origin-Prüfung fehlgeschlagen.' });
        return;
      }

      const tokenHash = hashSessionToken(gefunden.token, config.sessionSecret);
      const session = await repo.findeAktiveSession(tokenHash);
      if (!session) {
        res.status(401).json({ fehler: 'Sitzung ungültig oder abgelaufen.' });
        return;
      }

      const benutzer = await repo.findeBenutzerNachUuid(session.userUuid);
      if (!benutzer) {
        res.status(401).json({ fehler: 'Benutzerkonto existiert nicht mehr.' });
        return;
      }

      req.coreAuth = {
        user: benutzer.konto,
        tokenHash,
        viaCookie: gefunden.viaCookie,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireSysadmin() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.coreAuth?.user.istSysadmin) {
      res.status(403).json({ fehler: 'Sysadmin-Berechtigung erforderlich.' });
      return;
    }
    next();
  };
}

export function requireClubRolle(repo: CoreRepository, erlaubteRollen: readonly ClubRolle[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.coreAuth?.user;
      if (!user) {
        res.status(401).json({ fehler: 'Anmeldung erforderlich.' });
        return;
      }
      const clubId = String(req.params.clubId ?? '').trim();
      if (!clubId) {
        res.status(400).json({ fehler: 'Club-ID fehlt.' });
        return;
      }
      const cm = await repo.findeClubMitgliedschaft(user.uuid, clubId);
      if (!cm || cm.status !== 'ACTIVE' || !erlaubteRollen.includes(cm.rolle)) {
        res.status(403).json({ fehler: 'Keine ausreichende Berechtigung für diesen Verein.' });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Erzwingt Team-Berechtigung inklusive unveränderlicher CLUB_ADMIN -> TEAM_ADMIN Kaskade (#23).
 */
export function requireTeamRolle(repo: CoreRepository, erlaubteRollen: readonly TeamRolle[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.coreAuth?.user;
      if (!user) {
        res.status(401).json({ fehler: 'Anmeldung erforderlich.' });
        return;
      }
      const teamId = String(req.params.teamId ?? '').trim();
      if (!teamId) {
        res.status(400).json({ fehler: 'Team-ID fehlt.' });
        return;
      }
      const zugriff = await repo.ermittleEffektiveTeamBerechtigung(user.uuid, teamId);
      if (
        !zugriff ||
        !zugriff.effektiveTeamRolle ||
        !erlaubteRollen.includes(zugriff.effektiveTeamRolle)
      ) {
        res.status(403).json({ fehler: 'Keine ausreichende Berechtigung für dieses Team.' });
        return;
      }
      req.coreTeamAccess = zugriff;
      next();
    } catch (err) {
      next(err);
    }
  };
}
