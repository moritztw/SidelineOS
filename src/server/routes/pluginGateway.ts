import { Router, type Request, type Response } from 'express';
import type {
  PluginPublicKontext,
  StorageMultipartPartRef,
} from '../../sdk/plugin.ts';
import type { ClubKontext, TeamKontext } from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { StoragePolicyError, type StorageBroker } from '../gateway/storageBroker.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { PluginBackendHost } from '../plugins/backendHost.ts';
import type { NotificationService } from '../services/notificationService.ts';

function normalisiereSubPfad(rawParam: unknown): string {
  const teil = typeof rawParam === 'string' ? rawParam.replace(/^\/+/, '') : '';
  return teil ? `/${teil}` : '/';
}

function istSchreibMethode(method: string): boolean {
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

function sendeStorageFehler(res: Response, err: unknown, fallback: string): void {
  if (err instanceof StoragePolicyError) {
    res.status(err.status).json({ fehler: err.message, code: err.code });
    return;
  }
  res.status(400).json({ fehler: err instanceof Error ? err.message : fallback });
}

/**
 * Zentrales Plugin-Gateway (SDK v2.0):
 * - Erzwingt Auth, globale + Scope-Freischaltung, CLUB_ADMIN-Kaskade (#23),
 *   Archiv-Lesemodus (#25), Vereins-Speicherpool-Hard-Limit (#24) und Multi-Node-Routing (#22).
 */
export function erstellePluginGatewayRouter(params: {
  repo: CoreRepository;
  config: CoreServerConfig;
  pluginHost: PluginBackendHost;
  storageBroker: StorageBroker;
  notificationService: NotificationService;
}): { protectedRouter: Router; publicRouter: Router } {
  const { repo, config, pluginHost, storageBroker, notificationService } = params;
  const protectedRouter = Router();
  const publicRouter = Router();
  const auth = requireAuth(repo, config);

  async function handleStorageSubRoute(params: {
    req: Request;
    res: Response;
    subPfad: string;
    club: ClubKontext;
    team: TeamKontext | null;
    pluginId: string;
    darfSchreiben: boolean;
  }): Promise<boolean> {
    const { req, res, subPfad, club, team, pluginId, darfSchreiben } = params;
    if (!subPfad.startsWith('/_storage/')) return false;

    const status = await repo.findePlugin(pluginId);
    const plugin = pluginHost.holePlugin(pluginId);
    const manifest = plugin?.manifest ?? status?.manifest;
    if (!manifest) return false;

    const hatRecht = team
      ? manifest.permissions.includes('storage:team-rw')
      : manifest.permissions.includes('storage:club-rw');
    if (!hatRecht) {
      res.status(403).json({ fehler: `Plugin "${pluginId}" besitzt keine Storage-Berechtigung.` });
      return true;
    }

    const scope = storageBroker.erstellePluginScope({ club, team, manifest });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const objectPath = typeof body.objectPath === 'string' ? body.objectPath : '';
    const expiresInSeconds =
      typeof body.expiresInSeconds === 'number' ? body.expiresInSeconds : undefined;

    try {
      if (req.method === 'POST' && subPfad === '/_storage/presign-download') {
        const result = await scope.getSignedDownloadUrl({ objectPath, expiresInSeconds });
        res.json(result);
        return true;
      }

      if (!darfSchreiben) {
        res.status(403).json({ fehler: 'Keine Schreibberechtigung für Storage-Operationen.' });
        return true;
      }

      if (req.method === 'POST' && subPfad === '/_storage/presign-upload') {
        const result = await scope.getSignedUploadUrl({
          objectPath,
          contentType: typeof body.contentType === 'string' ? body.contentType : undefined,
          fileSizeBytes: typeof body.fileSizeBytes === 'number' ? body.fileSizeBytes : undefined,
          expiresInSeconds,
        });
        res.json(result);
        return true;
      }

      if (req.method === 'POST' && subPfad === '/_storage/multipart/init') {
        const result = await scope.initiateMultipartUpload({
          objectPath,
          contentType: typeof body.contentType === 'string' ? body.contentType : undefined,
          fileSizeBytes: typeof body.fileSizeBytes === 'number' ? body.fileSizeBytes : undefined,
        });
        res.json(result);
        return true;
      }

      if (req.method === 'POST' && subPfad === '/_storage/multipart/sign-part') {
        const result = await scope.getSignedMultipartPartUrl({
          objectPath,
          uploadId: typeof body.uploadId === 'string' ? body.uploadId : '',
          partNumber: typeof body.partNumber === 'number' ? body.partNumber : 0,
          expiresInSeconds,
        });
        res.json(result);
        return true;
      }

      if (req.method === 'POST' && subPfad === '/_storage/multipart/complete') {
        const result = await scope.completeMultipartUpload({
          objectPath,
          uploadId: typeof body.uploadId === 'string' ? body.uploadId : '',
          parts: Array.isArray(body.parts) ? (body.parts as StorageMultipartPartRef[]) : [],
        });
        res.json(result);
        return true;
      }

      if (req.method === 'POST' && subPfad === '/_storage/multipart/abort') {
        await scope.abortMultipartUpload({
          objectPath,
          uploadId: typeof body.uploadId === 'string' ? body.uploadId : '',
        });
        res.json({ ok: true });
        return true;
      }

      if (req.method === 'DELETE' && subPfad === '/_storage/object') {
        const estimatedBytes =
          typeof body.estimatedBytes === 'number' ? body.estimatedBytes : undefined;
        await scope.deleteObject(objectPath, estimatedBytes);
        res.json({ ok: true });
        return true;
      }

      res.status(404).json({ fehler: 'Unbekannter Core-Storage-Endpunkt.' });
      return true;
    } catch (err) {
      sendeStorageFehler(res, err, 'Storage-Anfrage fehlgeschlagen.');
      return true;
    }
  }

  async function handleNotificationSubRoute(params: {
    req: Request;
    res: Response;
    subPfad: string;
    pluginId: string;
    clubId?: string;
    teamId?: string;
  }): Promise<boolean> {
    const { req, res, subPfad, pluginId, clubId, teamId } = params;
    if (!subPfad.startsWith('/_notifications/')) return false;

    const status = await repo.findePlugin(pluginId);
    if (!status) return false;

    if (req.method === 'GET' && subPfad === '/_notifications/channels') {
      const channels = await notificationService.listeKanaele({ clubId, teamId });
      res.json({ channels });
      return true;
    }

    if (req.method === 'POST' && subPfad === '/_notifications/send') {
      if (!status.manifest.permissions.includes('notifications:send')) {
        res.status(403).json({
          fehler: `Plugin "${pluginId}" besitzt keine Berechtigung ("notifications:send").`,
        });
        return true;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        const ergebnis = await notificationService.dispatch({
          sourcePluginId: pluginId,
          clubId,
          teamId,
          payload: {
            eventType: typeof body.eventType === 'string' ? body.eventType : 'plugin.event',
            title: typeof body.title === 'string' ? body.title : '',
            message: typeof body.message === 'string' ? body.message : '',
            linkPath: typeof body.linkPath === 'string' ? body.linkPath : undefined,
            priority:
              body.priority === 'warning' || body.priority === 'urgent' ? body.priority : 'info',
            recipientUserUuids: Array.isArray(body.recipientUserUuids)
              ? (body.recipientUserUuids as unknown[]).filter(
                  (u): u is string => typeof u === 'string'
                )
              : undefined,
            channels: Array.isArray(body.channels)
              ? (body.channels as unknown[]).filter((c): c is string => typeof c === 'string')
              : undefined,
            metadata:
              body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
                ? (body.metadata as Record<string, unknown>)
                : undefined,
          },
        });
        res.json(ergebnis);
      } catch (err) {
        res.status(400).json({
          fehler: err instanceof Error ? err.message : 'Notification fehlgeschlagen.',
        });
      }
      return true;
    }

    res.status(404).json({ fehler: 'Unbekannter Notification-Endpunkt.' });
    return true;
  }

  // ---- 1. Team-Scope: /api/v2/plugins/:pluginId/teams/:teamId/* ----
  const handleTeamScope = async (req: Request, res: Response) => {
    const pluginId = String(req.params.pluginId ?? '').trim();
    const teamId = String(req.params.teamId ?? '').trim();
    const subPfad = normalisiereSubPfad(req.params[0]);

    const status = await repo.findePlugin(pluginId);
    if (!status) {
      res.status(404).json({ fehler: `Plugin "${pluginId}" ist nicht registriert.` });
      return;
    }
    if (!status.enabledGlobally) {
      res.status(403).json({ fehler: `Plugin "${pluginId}" ist global deaktiviert.` });
      return;
    }

    const team = await repo.findeTeamNachId(teamId);
    if (!team) {
      res.status(404).json({ fehler: 'Team nicht gefunden.' });
      return;
    }
    const club = await repo.findeClubNachId(team.clubId);
    if (!club) {
      res.status(404).json({ fehler: 'Verein nicht gefunden.' });
      return;
    }

    const berechtigung = await repo.ermittleEffektiveTeamBerechtigung(req.coreAuth!.user.uuid, teamId);
    if (!berechtigung?.effektiveTeamRolle) {
      res.status(403).json({ fehler: 'Keine aktive Mitgliedschaft in diesem Team.' });
      return;
    }

    const aktiv =
      (await repo.istScopeModulAktiv('team', teamId, pluginId)) ||
      (await repo.istScopeModulAktiv('club', club.id, pluginId));
    if (!aktiv) {
      res.status(403).json({ fehler: `Modul "${pluginId}" ist für dieses Team nicht freigeschaltet.` });
      return;
    }

    // #25: Serverseitige Schreibsperre für archivierte Teams (Downloads über /_storage/presign-download bleiben erlaubt)
    const istDownloadRoute = req.method === 'POST' && subPfad === '/_storage/presign-download';
    if (team.status === 'ARCHIVED' && istSchreibMethode(req.method) && !istDownloadRoute) {
      res.status(409).json({
        fehler: 'Dieses Team ist archiviert und befindet sich im Lesemodus.',
        code: 'TEAM_ARCHIVED_READ_ONLY',
      });
      return;
    }

    const darfStorageSchreiben =
      berechtigung.effektiveTeamRolle === 'TEAM_ADMIN' ||
      berechtigung.effektiveTeamRolle === 'STAFF';

    if (
      await handleStorageSubRoute({
        req,
        res,
        subPfad,
        club,
        team,
        pluginId,
        darfSchreiben: darfStorageSchreiben,
      })
    ) {
      return;
    }

    if (
      await handleNotificationSubRoute({
        req,
        res,
        subPfad,
        pluginId,
        clubId: club.id,
        teamId: team.id,
      })
    ) {
      return;
    }

    const plugin = pluginHost.holePlugin(pluginId);
    if (!plugin?.handleRequest) {
      res.status(501).json({ fehler: 'Plugin stellt keinen Backend-Handler bereit.' });
      return;
    }

    const ctx = pluginHost.erstelleKontext({
      plugin,
      approvedCapabilities: status.approvedCapabilities,
      user: req.coreAuth!.user,
      club,
      team,
      clubRolle: berechtigung.clubRolle,
      effektiveTeamRolle: berechtigung.effektiveTeamRolle,
      userGroups: berechtigung.groups,
    });

    const ergebnis = await plugin.handleRequest(
      {
        method: req.method,
        path: subPfad,
        scope: 'team',
        params: { pluginId, teamId, clubId: club.id },
        query: req.query as Record<string, unknown>,
        body: req.body,
      },
      ctx
    );
    res.status(ergebnis.status).json(ergebnis.body);
  };

  // ---- 2. Club-Scope: /api/v2/plugins/:pluginId/clubs/:clubId/* ----
  const handleClubScope = async (req: Request, res: Response) => {
    const pluginId = String(req.params.pluginId ?? '').trim();
    const clubId = String(req.params.clubId ?? '').trim();
    const subPfad = normalisiereSubPfad(req.params[0]);

    const status = await repo.findePlugin(pluginId);
    if (!status || !status.enabledGlobally) {
      res.status(status ? 403 : 404).json({ fehler: `Plugin "${pluginId}" ist nicht aktiv.` });
      return;
    }

    const club = await repo.findeClubNachId(clubId);
    if (!club) {
      res.status(404).json({ fehler: 'Verein nicht gefunden.' });
      return;
    }

    const cm = await repo.findeClubMitgliedschaft(req.coreAuth!.user.uuid, clubId);
    if (!cm || cm.status !== 'ACTIVE') {
      res.status(403).json({ fehler: 'Keine aktive Mitgliedschaft in diesem Verein.' });
      return;
    }

    const istSystemPanel = status.manifest.navigation.surface === 'system';
    const aktiv = istSystemPanel || (await repo.istScopeModulAktiv('club', clubId, pluginId));
    if (!aktiv) {
      res.status(403).json({ fehler: `Modul "${pluginId}" ist für diesen Verein nicht freigeschaltet.` });
      return;
    }

    if (
      await handleStorageSubRoute({
        req,
        res,
        subPfad,
        club,
        team: null,
        pluginId,
        darfSchreiben: cm.rolle === 'CLUB_ADMIN',
      })
    ) {
      return;
    }

    if (
      await handleNotificationSubRoute({
        req,
        res,
        subPfad,
        pluginId,
        clubId: club.id,
      })
    ) {
      return;
    }

    const plugin = pluginHost.holePlugin(pluginId);
    if (!plugin?.handleRequest) {
      res.status(501).json({ fehler: 'Plugin stellt keinen Club-Backend-Handler bereit.' });
      return;
    }

    const ctx = pluginHost.erstelleKontext({
      plugin,
      approvedCapabilities: status.approvedCapabilities,
      user: req.coreAuth!.user,
      club,
      team: null,
      clubRolle: cm.rolle,
      effektiveTeamRolle: cm.rolle === 'CLUB_ADMIN' ? 'TEAM_ADMIN' : null,
      userGroups: [],
    });

    const ergebnis = await plugin.handleRequest(
      {
        method: req.method,
        path: subPfad,
        scope: 'club',
        params: { pluginId, clubId },
        query: req.query as Record<string, unknown>,
        body: req.body,
      },
      ctx
    );
    res.status(ergebnis.status).json(ergebnis.body);
  };

  // ---- 3. System-Scope: /api/v2/plugins/:pluginId/system/* (nur Sysadmin) ----
  const handleSystemScope = async (req: Request, res: Response) => {
    if (!req.coreAuth!.user.istSysadmin) {
      res.status(403).json({ fehler: 'Sysadmin-Berechtigung erforderlich.' });
      return;
    }
    const pluginId = String(req.params.pluginId ?? '').trim();
    const subPfad = normalisiereSubPfad(req.params[0]);

    const status = await repo.findePlugin(pluginId);
    if (!status || !status.enabledGlobally) {
      res.status(status ? 403 : 404).json({ fehler: `Plugin "${pluginId}" ist nicht aktiv.` });
      return;
    }
    if (
      status.manifest.permissions.includes('dev:git-install') &&
      !config.allowDevPlugins
    ) {
      res.status(403).json({ fehler: 'Dev-Plugins sind auf dieser Instanz gesperrt (ALLOW_DEV_PLUGINS=false).' });
      return;
    }

    const plugin = pluginHost.holePlugin(pluginId);
    if (!plugin?.handleRequest) {
      res.status(501).json({ fehler: 'Plugin stellt keinen System-Backend-Handler bereit.' });
      return;
    }

    const ctx = pluginHost.erstelleKontext({
      plugin,
      approvedCapabilities: status.approvedCapabilities,
      user: req.coreAuth!.user,
      club: null,
      team: null,
      clubRolle: null,
      effektiveTeamRolle: null,
      userGroups: [],
    });

    const ergebnis = await plugin.handleRequest(
      {
        method: req.method,
        path: subPfad,
        scope: 'system',
        params: { pluginId },
        query: req.query as Record<string, unknown>,
        body: req.body,
      },
      ctx
    );
    res.status(ergebnis.status).json(ergebnis.body);
  };

  protectedRouter.all('/:pluginId/teams/:teamId', auth, (req, res, next) => {
    handleTeamScope(req, res).catch(next);
  });
  protectedRouter.all('/:pluginId/teams/:teamId/*', auth, (req, res, next) => {
    handleTeamScope(req, res).catch(next);
  });
  protectedRouter.all('/:pluginId/clubs/:clubId', auth, (req, res, next) => {
    handleClubScope(req, res).catch(next);
  });
  protectedRouter.all('/:pluginId/clubs/:clubId/*', auth, (req, res, next) => {
    handleClubScope(req, res).catch(next);
  });
  protectedRouter.all('/:pluginId/system', auth, (req, res, next) => {
    handleSystemScope(req, res).catch(next);
  });
  protectedRouter.all('/:pluginId/system/*', auth, (req, res, next) => {
    handleSystemScope(req, res).catch(next);
  });

  // ---- 4. Öffentliche Share-Links: /api/v2/public/plugins/:pluginId/* ----
  const handlePublic = async (req: Request, res: Response) => {
    const pluginId = String(req.params.pluginId ?? '').trim();
    const subPfad = normalisiereSubPfad(req.params[0]);

    const status = await repo.findePlugin(pluginId);
    const plugin = pluginHost.holePlugin(pluginId);
    if (!status || !plugin) {
      res.status(404).json({ fehler: `Plugin "${pluginId}" nicht gefunden.` });
      return;
    }
    if (!status.enabledGlobally || !plugin.manifest.permissions.includes('share:public-links')) {
      res.status(403).json({ fehler: 'Öffentliche Share-Links sind für dieses Plugin nicht erlaubt.' });
      return;
    }
    if (!plugin.handlePublicRequest) {
      res.status(501).json({ fehler: 'Plugin stellt keinen öffentlichen Share-Handler bereit.' });
      return;
    }

    const dbScope = pluginHost.erstelleDbScope(pluginId);
    const hatStorageLeserecht = plugin.manifest.permissions.includes('storage:team-rw');

    const publicCtx: PluginPublicKontext = {
      pluginId,
      manifest: plugin.manifest,
      ...(hatStorageLeserecht
        ? {
            getSignedDownloadUrlForTeam: async ({ teamId, objectPath, expiresInSeconds }) => {
              const team = await repo.findeTeamNachId(teamId);
              if (!team) throw new Error('Ziel-Team nicht gefunden.');
              const club = await repo.findeClubNachId(team.clubId);
              if (!club) throw new Error('Ziel-Verein nicht gefunden.');
              const scope = storageBroker.erstellePluginScope({
                club,
                team,
                manifest: plugin.manifest,
              });
              return scope.getSignedDownloadUrl({ objectPath, expiresInSeconds });
            },
          }
        : {}),
    };

    const ergebnis = await plugin.handlePublicRequest(
      {
        method: req.method,
        path: subPfad,
        query: req.query as Record<string, unknown>,
        body: req.body,
      },
      dbScope,
      publicCtx
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
