import { Router, type Request, type Response } from 'express';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { PluginBackendHost } from '../plugins/backendHost.ts';
import type { S3BrokerService } from '../services/s3Broker.ts';
import type { S3CleanupService } from '../services/s3CleanupService.ts';

function normalisiereSubPfad(rawParam: unknown): string {
  const teil = typeof rawParam === 'string' ? rawParam.replace(/^\/+/, '') : '';
  return teil ? `/${teil}` : '/';
}

/**
 * Zentrales Plugin-Gateway des SidelineOS-Core:
 * Erzwingt Auth, globale + teambezogene Plugin-Aktivierung, aktive Team-Mitgliedschaft,
 * Core-S3-Broker-Presigning sowie isolierten PostgreSQL-Schema-Scope (`plugin_<slug>`).
 */
export function erstellePluginGatewayRouter(
  repo: CoreRepository,
  config: CoreServerConfig,
  pluginHost: PluginBackendHost,
  s3Broker?: S3BrokerService,
  s3Cleanup?: S3CleanupService
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
    if (!pluginStatus) {
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

    // Core-S3-Broker für alle installierten Plugins mit Manifest-Berechtigung `s3:team-rw`
    if (subPfad.startsWith('/_s3/')) {
      if (!s3Broker) {
        res.status(503).json({ fehler: 'S3-Broker ist auf dieser Instanz nicht initialisiert.' });
        return;
      }
      const manifest = plugin?.manifest ?? pluginStatus.manifest;
      if (!manifest.permissions.includes('s3:team-rw')) {
        res.status(403).json({
          fehler: `Plugin "${pluginId}" besitzt keine S3-Berechtigung ("s3:team-rw").`,
        });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const objectPath = typeof body.objectPath === 'string' ? body.objectPath : '';
      const expiresInSeconds =
        typeof body.expiresInSeconds === 'number' ? body.expiresInSeconds : undefined;

      if (req.method === 'POST' && subPfad === '/_s3/presign-upload') {
        if (aktiv.rolle !== 'TEAM_ADMIN' && aktiv.rolle !== 'COACH') {
          res.status(403).json({ fehler: 'Nur Coaches oder Team Admins dürfen S3-Uploads anfordern.' });
          return;
        }
        try {
          const contentType =
            typeof body.contentType === 'string' ? body.contentType.trim() : undefined;
          const signiert = await s3Broker.erzeugePresignedUploadUrl({
            teamId,
            pluginId,
            manifest,
            objectPath,
            contentType,
            expiresInSeconds,
          });
          res.status(200).json(signiert);
        } catch (err) {
          res.status(400).json({
            fehler: err instanceof Error ? err.message : 'Presigned Upload-URL fehlgeschlagen.',
          });
        }
        return;
      }

      if (req.method === 'POST' && subPfad === '/_s3/presign-download') {
        try {
          const signiert = await s3Broker.erzeugePresignedDownloadUrl({
            teamId,
            pluginId,
            manifest,
            objectPath,
            expiresInSeconds,
          });
          res.status(200).json(signiert);
        } catch (err) {
          res.status(400).json({
            fehler: err instanceof Error ? err.message : 'Presigned Download-URL fehlgeschlagen.',
          });
        }
        return;
      }

      if (req.method === 'DELETE' && subPfad === '/_s3/object') {
        if (aktiv.rolle !== 'TEAM_ADMIN' && aktiv.rolle !== 'COACH') {
          res.status(403).json({ fehler: 'Nur Coaches oder Team Admins dürfen S3-Objekte löschen.' });
          return;
        }
        try {
          await s3Broker.loescheObjekt({
            teamId,
            pluginId,
            manifest,
            objectPath,
          });
          res.status(200).json({ ok: true });
        } catch (err) {
          res.status(400).json({
            fehler: err instanceof Error ? err.message : 'S3-Objekt konnte nicht gelöscht werden.',
          });
        }
        return;
      }

      if (req.method === 'POST' && subPfad === '/_s3/cleanup-queue') {
        if (!s3Cleanup) {
          res.status(503).json({ fehler: 'S3-Cleanup-Queue ist nicht initialisiert.' });
          return;
        }
        if (!manifest.permissions.includes('s3:cleanup-queue')) {
          res.status(403).json({
            fehler: `Plugin "${pluginId}" besitzt keine Berechtigung ("s3:cleanup-queue").`,
          });
          return;
        }
        if (aktiv.rolle !== 'TEAM_ADMIN' && aktiv.rolle !== 'COACH') {
          res.status(403).json({
            fehler: 'Nur Coaches oder Team Admins dürfen S3-Cleanup-Einträge melden.',
          });
          return;
        }
        const objectPaths = Array.isArray(body.objectPaths)
          ? (body.objectPaths as unknown[]).filter((p): p is string => typeof p === 'string')
          : [];
        const reason = typeof body.reason === 'string' ? body.reason : undefined;
        const sizeBytesPerObject =
          typeof body.sizeBytesPerObject === 'number' ? body.sizeBytesPerObject : undefined;
        try {
          const ergebnis = await s3Cleanup.reiheVerwaisteObjekteEin({
            teamId,
            pluginId,
            manifest,
            objectPaths,
            reason,
            sizeBytesPerObject,
          });
          res.status(200).json(ergebnis);
        } catch (err) {
          res.status(400).json({
            fehler: err instanceof Error ? err.message : 'Cleanup-Eintrag fehlgeschlagen.',
          });
        }
        return;
      }

      res.status(404).json({ fehler: 'Unbekannter Core-S3-Broker-Endpunkt.' });
      return;
    }

    if (!plugin || !plugin.handleRequest) {
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
