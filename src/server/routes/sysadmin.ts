import crypto from 'node:crypto';
import { Router } from 'express';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { requireAuth, requireSysadmin } from '../middleware/auth.ts';
import { hashPasswort } from '../security.ts';

const MIN_PASSWORT_LAENGE = 10;

export function erstelleSysadminRouter(repo: CoreRepository, config: CoreServerConfig): Router {
  const router = Router();
  router.use(requireAuth(repo, config), requireSysadmin());

  router.get('/overview', async (_req, res, next) => {
    try {
      const [teams, users, memberships, plugins] = await Promise.all([
        repo.listeTeams(),
        repo.listeBenutzer(),
        repo.listeMitgliedschaften(),
        repo.listeInstalliertePlugins(),
      ]);
      res.status(200).json({ teams, users, memberships, plugins });
    } catch (err) {
      next(err);
    }
  });

  router.post('/teams', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const kurzname = typeof body.kurzname === 'string' ? body.kurzname.trim() : '';
      const aktiveSaison =
        typeof body.aktiveSaison === 'string' && body.aktiveSaison.trim()
          ? body.aktiveSaison.trim()
          : String(new Date().getFullYear());

      if (!name || !kurzname) {
        res.status(400).json({ fehler: 'Teamname und Kurzname sind erforderlich.' });
        return;
      }

      const allePlugins = await repo.listeInstalliertePlugins();
      const globalAktiveIds = new Set(
        allePlugins.filter((p) => p.enabledGlobally).map((p) => p.manifest.id)
      );
      const angefordert: string[] = Array.isArray(body.aktivierteModule)
        ? (body.aktivierteModule as unknown[]).filter(
            (id): id is string => typeof id === 'string'
          )
        : Array.from(globalAktiveIds);
      const aktivierteModule = angefordert.filter((id) => globalAktiveIds.has(id));

      const id =
        typeof body.id === 'string' && /^[a-z0-9-]+$/.test(body.id.trim())
          ? body.id.trim()
          : `team-${crypto.randomUUID().slice(0, 8)}`;

      const team = await repo.erstelleTeam({
        id,
        name,
        kurzname,
        aktiveSaison,
        saisons: [aktiveSaison],
        primaerFarbe:
          typeof body.primaerFarbe === 'string' && body.primaerFarbe.trim()
            ? body.primaerFarbe.trim()
            : '#F59E0B',
        aktivierteModule,
        customProfilFelder: Array.isArray(body.customProfilFelder) ? body.customProfilFelder : [],
      });

      if (typeof body.ersterTeamAdminUuid === 'string' && body.ersterTeamAdminUuid.trim()) {
        const adminKonto = await repo.findeBenutzerNachUuid(body.ersterTeamAdminUuid.trim());
        if (adminKonto) {
          await repo.speichereMitgliedschaft({
            id: `mem-${crypto.randomUUID()}`,
            userUuid: adminKonto.konto.uuid,
            teamId: team.id,
            rolle: 'TEAM_ADMIN',
            units: ['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS'],
            status: 'AKTIV',
            beigetretenAm: new Date().toISOString().slice(0, 10),
          });
        }
      }

      res.status(201).json({ team });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/teams/:teamId', async (req, res, next) => {
    try {
      const teamId = String(req.params.teamId);
      const alle = await repo.listeTeams();
      if (!alle.some((t) => t.id === teamId)) {
        res.status(404).json({ fehler: 'Team nicht gefunden.' });
        return;
      }
      if (alle.length <= 1) {
        res.status(409).json({ fehler: 'Das letzte verbleibende Team kann nicht gelöscht werden.' });
        return;
      }
      await repo.loescheTeam(teamId);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const vollerName = typeof body.vollerName === 'string' ? body.vollerName.trim() : '';
      const benutzername =
        typeof body.benutzername === 'string' ? body.benutzername.trim().toLowerCase() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const passwort = typeof body.passwort === 'string' ? body.passwort : '';

      if (!vollerName || !benutzername || !email) {
        res.status(400).json({ fehler: 'Name, Benutzername und E-Mail sind erforderlich.' });
        return;
      }
      if (passwort.length < MIN_PASSWORT_LAENGE) {
        res.status(400).json({
          fehler: `Initialpasswort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`,
        });
        return;
      }

      const konflikt = await repo.existiertEmailOderBenutzername(email, benutzername);
      if (konflikt) {
        res.status(409).json({ fehler: 'E-Mail oder Benutzername existiert bereits.' });
        return;
      }

      const user = await repo.erstelleBenutzer(
        {
          uuid: `usr-${crypto.randomUUID()}`,
          benutzername,
          vollerName,
          email,
          telefon: typeof body.telefon === 'string' ? body.telefon.trim() : undefined,
          trikotNummer: typeof body.trikotNummer === 'string' ? body.trikotNummer.trim() : undefined,
          position: typeof body.position === 'string' ? body.position.trim() : undefined,
          istSysadmin: Boolean(body.istSysadmin),
          erstelltAm: new Date().toISOString().slice(0, 10),
          customProfilWerte: {},
        },
        hashPasswort(passwort)
      );

      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:userUuid/sysadmin', async (req, res, next) => {
    try {
      const userUuid = String(req.params.userUuid);
      const ziel = await repo.findeBenutzerNachUuid(userUuid);
      if (!ziel) {
        res.status(404).json({ fehler: 'Benutzer nicht gefunden.' });
        return;
      }

      const istSysadmin = Boolean(req.body?.istSysadmin);
      if (!istSysadmin && ziel.konto.istSysadmin) {
        const alle = await repo.listeBenutzer();
        const anzahlSysadmins = alle.filter((u) => u.istSysadmin).length;
        if (anzahlSysadmins <= 1) {
          res.status(409).json({ fehler: 'Mindestens ein Sysadmin muss bestehen bleiben.' });
          return;
        }
      }

      const aktualisiert = await repo.aktualisiereBenutzer({
        ...ziel.konto,
        istSysadmin,
      });
      res.status(200).json({ user: aktualisiert });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/users/:userUuid', async (req, res, next) => {
    try {
      const userUuid = String(req.params.userUuid);
      if (userUuid === req.coreAuth!.user.uuid) {
        res.status(409).json({ fehler: 'Das aktuell angemeldete Konto kann sich nicht selbst löschen.' });
        return;
      }
      const ziel = await repo.findeBenutzerNachUuid(userUuid);
      if (!ziel) {
        res.status(404).json({ fehler: 'Benutzer nicht gefunden.' });
        return;
      }
      const alle = await repo.listeBenutzer();
      if (alle.length <= 1) {
        res.status(409).json({ fehler: 'Das letzte Benutzerkonto kann nicht gelöscht werden.' });
        return;
      }
      if (ziel.konto.istSysadmin && alle.filter((u) => u.istSysadmin).length <= 1) {
        res.status(409).json({ fehler: 'Der letzte Sysadmin kann nicht gelöscht werden.' });
        return;
      }

      await repo.loescheBenutzer(userUuid);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/plugins/:pluginId/global', async (req, res, next) => {
    try {
      const pluginId = String(req.params.pluginId);
      const aktiv = Boolean(req.body?.enabledGlobally);
      const gefunden = await repo.setzePluginGlobalAktiv(pluginId, aktiv);
      if (!gefunden) {
        res.status(404).json({ fehler: 'Plugin nicht installiert.' });
        return;
      }
      res.status(200).json({ pluginId, enabledGlobally: aktiv });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/teams/:teamId/plugins/:pluginId', async (req, res, next) => {
    try {
      const teamId = String(req.params.teamId);
      const pluginId = String(req.params.pluginId);
      const aktiv = Boolean(req.body?.enabled);

      const [team, pluginStatus] = await Promise.all([
        repo.findeTeamNachId(teamId),
        repo.findePluginStatus(pluginId),
      ]);
      if (!team) {
        res.status(404).json({ fehler: 'Team nicht gefunden.' });
        return;
      }
      if (!pluginStatus) {
        res.status(404).json({ fehler: 'Plugin nicht installiert.' });
        return;
      }
      if (aktiv && !pluginStatus.enabledGlobally) {
        res.status(409).json({
          fehler: 'Plugin ist global deaktiviert und kann keinem Team freigeschaltet werden.',
        });
        return;
      }

      await repo.setzeTeamModulAktiv(teamId, pluginId, aktiv);
      res.status(200).json({ teamId, pluginId, enabled: aktiv });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
