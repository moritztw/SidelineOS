import { Router, type Request, type Response } from 'express';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { PluginBackendHost } from '../plugins/backendHost.ts';

function normalisiereSubPfad(rawParam: unknown): string {
  const teil = typeof rawParam === 'string' ? rawParam.replace(/^\/+/, '') : '';
  return teil ? `/${teil}` : '/';
}

/**
 * Zentrales Plugin-Gateway des SidelineOS-Core:
 * Erzwingt Auth, globale + teambezogene Plugin-Aktivierung, aktive Team-Mitgliedschaft
 * und isolierten PostgreSQL-Schema-Scope (`plugin_<slug>`).
 */
export function erstellePluginGatewayRouter(
  repo: CoreRepository,
  config: CoreServerConfig,
  pluginHost: PluginBackendHost
): { protectedRouter: Router; publicRouter: Router } {
  const protectedRouter = Router();
  const publicRouter = Router();
  const auth = requireAuth(repo, config);

  const handleProtected = async (req: Request, res: Response) => {
    const pluginId = String(req.params.pluginId ?? '').trim();
    const teamId = String(req.params.teamId ?? '').trim();
    const subPfad = normalisiereSubPfad(req.params[0]);

    const plugin = pluginHost.holePlugin(pluginId);
    const pluginStatus = await repo.findePluginStatus(pluginId);
    if (!pluginStatus || !plugin) {
      res.status(404).json({ fehler: `Plugin "${pluginId}" ist nicht registriert.` });
      return;
    }
    if (!pluginStatus.enabledGlobally) {
      res.status(403).json({ fehler: `Plugin "${pluginId}" ist global deaktiviert.` });
      return;
    }

    const team = await repo.findeTeamNachId(teamId);
    if (!team) {
      res.status(404).json({ fehler: 'Team nicht gefunden.' });
      return;
    }

    const mitgliedschaften = await repo.listeMitgliedschaften(teamId);
    const aktiv = mitgliedschaften.find(
      (m) => m.userUuid === req.coreAuth!.user.uuid && m.status === 'AKTIV'
    );
    if (!aktiv) {
      res.status(403).json({ fehler: 'Keine aktive Mitgliedschaft in diesem Team.' });
      return;
    }

    const modulAktiv = await repo.istTeamModulAktiv(teamId, pluginId);
    if (!modulAktiv) {
      res.status(403).json({
        fehler: `Modul "${pluginId}" ist für dieses Team nicht freigeschaltet.`,
      });
      return;
    }

    if (!plugin.handleRequest) {
      res.status(501).json({ fehler: 'Plugin stellt keinen geschützten Backend-Handler bereit.' });
      return;
    }

    const ctx = pluginHost.erstelleKontext({
      plugin,
      user: req.coreAuth!.user,
      team,
      teamRolle: aktiv.rolle,
    });

    const ergebnis = await plugin.handleRequest(
      {
        method: req.method,
        path: subPfad,
        params: { pluginId, teamId },
        query: req.query as Record<string, unknown>,
        body: req.body,
      },
      ctx
    );

    res.status(ergebnis.status).json(ergebnis.body);
  };

  protectedRouter.all('/:pluginId/teams/:teamId', auth, (req, res, next) => {
    handleProtected(req, res).catch(next);
  });
  protectedRouter.all('/:pluginId/teams/:teamId/*', auth, (req, res, next) => {
    handleProtected(req, res).catch(next);
  });

  const handlePublic = async (req: Request, res: Response) => {
    const pluginId = String(req.params.pluginId ?? '').trim();
    const subPfad = normalisiereSubPfad(req.params[0]);

    const plugin = pluginHost.holePlugin(pluginId);
    const pluginStatus = await repo.findePluginStatus(pluginId);
    if (!pluginStatus || !plugin) {
      res.status(404).json({ fehler: `Plugin "${pluginId}" ist nicht registriert.` });
      return;
    }
    if (!pluginStatus.enabledGlobally) {
      res.status(403).json({ fehler: `Plugin "${pluginId}" ist global deaktiviert.` });
      return;
    }
    if (!plugin.manifest.permissions.includes('share:public-links')) {
      res.status(403).json({
        fehler: `Plugin "${pluginId}" besitzt keine Berechtigung für öffentliche Share-Links.`,
      });
      return;
    }
    if (!plugin.handlePublicRequest) {
      res.status(501).json({ fehler: 'Plugin stellt keinen öffentlichen Share-Handler bereit.' });
      return;
    }

    const dbScope = pluginHost.erstelleDbScope(pluginId);
    const ergebnis = await plugin.handlePublicRequest(
      {
        method: req.method,
        path: subPfad,
        query: req.query as Record<string, unknown>,
        body: req.body,
      },
      dbScope
    );

    res.status(ergebnis.status).json(ergebnis.body);
  };

  publicRouter.all('/:pluginId', (req, res, next) => {
    handlePublic(req, res).catch(next);
  });
  publicRouter.all('/:pluginId/*', (req, res, next) => {
    handlePublic(req, res).catch(next);
  });

  return { protectedRouter, publicRouter };
}
