import { Router } from 'express';
import { normalisiereSprache } from '../../shared/i18n.ts';
import { STANDARD_THEME_REF } from '../../shared/theme.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import {
  loescheSessionCookie,
  requireAuth,
  setzeSessionCookie,
} from '../middleware/auth.ts';
import {
  generiereSessionToken,
  hashPasswort,
  hashSessionToken,
  pruefePasswort,
} from '../security.ts';
import {
  listeOeffentlichePluginThemes,
  validiereThemeAuswahlFuerInstanz,
} from '../services/themeService.ts';

async function ladeInstanzTheme(repo: CoreRepository): Promise<string> {
  const setting = await repo.holeSystemSetting<{ defaultTheme?: string }>('appearance');
  return setting?.defaultTheme?.trim() || STANDARD_THEME_REF;
}

export function erstelleAuthRouter(repo: CoreRepository, config: CoreServerConfig): Router {
  const router = Router();
  const auth = requireAuth(repo, config);

  // Zeigt dem Login-Screen an, ob eine leere Instanz erstmalig per Sysadmin-Formular eingerichtet werden muss
  router.get('/bootstrap-status', async (_req, res, next) => {
    try {
      const anzahlBenutzer = await repo.zaehleBenutzer();
      const [instanzTheme, pluginThemes] = await Promise.all([
        ladeInstanzTheme(repo),
        listeOeffentlichePluginThemes(repo),
      ]);
      res.json({
        ersteinrichtungOffen: anzahlBenutzer === 0 && !config.initialSysadmin,
        coreVersion: config.coreVersion,
        sdkVersion: config.supportedSdkVersion,
        defaultLocale: config.defaultLocale,
        instanzTheme,
        pluginThemes,
      });
    } catch (err) {
      next(err);
    }
  });

  // Einmalige Erst-Sysadmin-Anlage (gesperrt, sobald >= 1 Benutzer existiert oder ENV gesetzt ist)
  router.post('/bootstrap-admin', async (req, res, next) => {
    try {
      if (config.initialSysadmin || (await repo.zaehleBenutzer()) > 0) {
        res.status(409).json({ fehler: 'Die Instanz wurde bereits eingerichtet.' });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const benutzername = String(body.benutzername ?? '').trim().toLowerCase();
      const vollerName = String(body.vollerName ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      const passwort = String(body.passwort ?? '');

      if (!/^[a-z0-9._-]{3,40}$/.test(benutzername)) {
        res.status(400).json({ fehler: 'Benutzername muss 3–40 Zeichen (a-z, 0-9, . _ -) enthalten.' });
        return;
      }
      if (!vollerName || !email.includes('@') || passwort.length < 8) {
        res.status(400).json({ fehler: 'Name, gültige E-Mail und Passwort (mind. 8 Zeichen) erforderlich.' });
        return;
      }

      const admin = await repo.erstelleBenutzer(
        {
          benutzername,
          vollerName,
          email,
          istSysadmin: true,
          preferredLocale: config.defaultLocale,
        },
        hashPasswort(passwort)
      );

      const token = generiereSessionToken();
      const expiresAt = new Date(Date.now() + config.sessionTtlStunden * 3600 * 1000).toISOString();
      await repo.erstelleSession(hashSessionToken(token, config.sessionSecret), admin.uuid, expiresAt);
      setzeSessionCookie(res, req, config, token);

      res.status(201).json({ user: admin, token });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const kennung = String(body.kennung ?? body.username ?? '').trim();
      const passwort = String(body.passwort ?? body.password ?? '');

      if (!kennung || !passwort) {
        res.status(400).json({ fehler: 'Benutzername/E-Mail und Passwort erforderlich.' });
        return;
      }

      const treffer = await repo.findeBenutzerNachLogin(kennung);
      if (!treffer || !pruefePasswort(passwort, treffer.passwordHash)) {
        res.status(401).json({ fehler: 'Anmeldedaten ungültig.' });
        return;
      }

      const token = generiereSessionToken();
      const expiresAt = new Date(Date.now() + config.sessionTtlStunden * 3600 * 1000).toISOString();
      await repo.erstelleSession(
        hashSessionToken(token, config.sessionSecret),
        treffer.konto.uuid,
        expiresAt
      );
      setzeSessionCookie(res, req, config, token);

      res.json({ user: treffer.konto, token });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', auth, async (req, res, next) => {
    try {
      await repo.loescheSession(req.coreAuth!.tokenHash);
      loescheSessionCookie(res, req, config);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', auth, async (req, res, next) => {
    try {
      const user = req.coreAuth!.user;
      const [kontext, instanzTheme, pluginThemes, ungeleseneNotifications] = await Promise.all([
        repo.ladeBenutzerKontext(user.uuid),
        ladeInstanzTheme(repo),
        listeOeffentlichePluginThemes(repo),
        repo.zaehleUngeleseneNotifications(user.uuid),
      ]);

      const clubModuleMap: Record<string, string[]> = {};
      for (const c of kontext.clubs) {
        clubModuleMap[c.id] = await repo.listeAktiveScopeModule('club', c.id);
      }
      const teamModuleMap: Record<string, string[]> = {};
      for (const t of kontext.teams) {
        teamModuleMap[t.id] = await repo.listeAktiveScopeModule('team', t.id);
      }

      res.json({
        user,
        clubs: kontext.clubs,
        teams: kontext.teams,
        scopeModules: {
          clubs: clubModuleMap,
          teams: teamModuleMap,
        },
        instanzTheme,
        pluginThemes,
        ungeleseneNotifications,
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/me', auth, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      let themePatch: string | null | undefined = undefined;
      if (body.preferredTheme !== undefined) {
        const check = await validiereThemeAuswahlFuerInstanz(repo, body.preferredTheme, {
          erlaubeLeer: true,
        });
        if (!check.ok) {
          res.status(check.status).json({ fehler: check.fehler });
          return;
        }
        themePatch = check.themeRef ?? null;
      }

      const aktualisiert = await repo.aktualisiereBenutzer(req.coreAuth!.user.uuid, {
        vollerName: typeof body.vollerName === 'string' ? body.vollerName : undefined,
        email: typeof body.email === 'string' ? body.email : undefined,
        preferredLocale:
          typeof body.preferredLocale === 'string'
            ? normalisiereSprache(body.preferredLocale, req.coreAuth!.user.preferredLocale)
            : undefined,
        preferredTheme: themePatch,
        metadata:
          body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : undefined,
      });

      res.json({ user: aktualisiert });
    } catch (err) {
      next(err);
    }
  });

  router.post('/change-password', auth, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const altesPasswort = String(body.altesPasswort ?? '');
      const neuesPasswort = String(body.neuesPasswort ?? '');

      if (neuesPasswort.length < 8) {
        res.status(400).json({ fehler: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' });
        return;
      }

      const mitHash = await repo.findeBenutzerNachUuid(req.coreAuth!.user.uuid);
      if (!mitHash || !pruefePasswort(altesPasswort, mitHash.passwordHash)) {
        res.status(400).json({ fehler: 'Aktuelles Passwort ist nicht korrekt.' });
        return;
      }

      await repo.aktualisiereBenutzer(mitHash.konto.uuid, {
        passwordHash: hashPasswort(neuesPasswort),
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Öffentliche Einladungs-Prüfung (#26)
  router.get('/invite/:token', async (req, res, next) => {
    try {
      const token = String(req.params.token ?? '').trim();
      const einladung = await repo.findeAktiveEinladungNachToken(token);
      if (!einladung) {
        res.status(404).json({ fehler: 'Einladungslink ist ungültig oder abgelaufen.' });
        return;
      }

      const club = await repo.findeClubNachId(einladung.clubId);
      if (!club) {
        res.status(404).json({ fehler: 'Zugehöriger Verein existiert nicht mehr.' });
        return;
      }
      const team = einladung.teamId ? await repo.findeTeamNachId(einladung.teamId) : null;

      res.json({
        einladung: {
          id: einladung.id,
          clubId: club.id,
          clubName: club.name,
          teamId: team?.id ?? null,
          teamName: team?.name ?? null,
          clubRolle: einladung.clubRolle,
          teamRolle: einladung.teamRolle,
          groups: einladung.groups,
          zielEmail: einladung.zielEmail,
          bestaetigungErforderlich: einladung.bestaetigungErforderlich,
          gueltigBis: einladung.gueltigBis,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Atomare Einlösung: neuer Benutzer ODER bestehendes Konto -> Club + Team in einer Transaktion (#26)
  router.post('/invite/:token/accept', async (req, res, next) => {
    try {
      const token = String(req.params.token ?? '').trim();
      const einladung = await repo.findeAktiveEinladungNachToken(token);
      if (!einladung) {
        res.status(404).json({ fehler: 'Einladungslink ist ungültig oder abgelaufen.' });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const benutzername = String(body.benutzername ?? '').trim().toLowerCase();
      const vollerName = String(body.vollerName ?? '').trim();
      const email = String(body.email ?? einladung.zielEmail ?? '').trim().toLowerCase();
      const passwort = String(body.passwort ?? '');

      if (!/^[a-z0-9._-]{3,40}$/.test(benutzername)) {
        res.status(400).json({ fehler: 'Benutzername muss 3–40 Zeichen enthalten.' });
        return;
      }
      if (!vollerName || !email.includes('@') || passwort.length < 8) {
        res.status(400).json({ fehler: 'Name, gültige E-Mail und Passwort (mind. 8 Zeichen) erforderlich.' });
        return;
      }
      if (einladung.zielEmail && einladung.zielEmail !== email) {
        res.status(403).json({ fehler: 'Diese Einladung ist an eine andere E-Mail-Adresse gebunden.' });
        return;
      }

      const existiert = await repo.findeBenutzerNachLogin(benutzername) || await repo.findeBenutzerNachLogin(email);
      if (existiert) {
        res.status(409).json({ fehler: 'Benutzername oder E-Mail ist bereits vergeben.' });
        return;
      }

      const benutzer = await repo.erstelleBenutzer(
        {
          benutzername,
          vollerName,
          email,
          preferredLocale: config.defaultLocale,
        },
        hashPasswort(passwort)
      );

      const zuweisung = await repo.loeseEinladungFuerUserEin({
        userUuid: benutzer.uuid,
        einladung,
      });

      const sessionToken = generiereSessionToken();
      const expiresAt = new Date(Date.now() + config.sessionTtlStunden * 3600 * 1000).toISOString();
      await repo.erstelleSession(
        hashSessionToken(sessionToken, config.sessionSecret),
        benutzer.uuid,
        expiresAt
      );
      setzeSessionCookie(res, req, config, sessionToken);

      res.status(201).json({
        user: benutzer,
        token: sessionToken,
        clubMitgliedschaft: zuweisung.clubMitgliedschaft,
        teamMitgliedschaft: zuweisung.teamMitgliedschaft,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
