import { Router } from 'express';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { NotificationService } from '../services/notificationService.ts';

/**
 * Core-Notification-Endpunkt:
 * - Benutzer lesen/quittieren eigene In-App-Benachrichtigungen
 * - Sysadmins oder Team Admins/Coaches (im eigenen Team) können Benachrichtigungen
 *   über Core-Kanäle (In-App, SMTP) und nachgelieferte Channel-Plugins auslösen.
 */
export function erstelleNotificationRouter(
  repo: CoreRepository,
  config: CoreServerConfig,
  notificationService: NotificationService
): Router {
  const router = Router();
  const auth = requireAuth(repo, config);
  router.use(auth);

  router.get('/', async (req, res, next) => {
    try {
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
      const daten = await repo.listeNotificationsFuerBenutzer(req.coreAuth!.user.uuid, limit);
      res.status(200).json(daten);
    } catch (err) {
      next(err);
    }
  });

  router.get('/channels', async (req, res, next) => {
    try {
      const teamId = typeof req.query.teamId === 'string' && req.query.teamId.trim()
        ? req.query.teamId.trim()
        : undefined;
      if (teamId && !req.coreAuth!.user.istSysadmin) {
        const mitgliedschaften = await repo.listeMitgliedschaften(teamId);
        const aktiv = mitgliedschaften.some(
          (m) => m.userUuid === req.coreAuth!.user.uuid && m.status === 'AKTIV'
        );
        if (!aktiv) {
          res.status(403).json({ fehler: 'Kein aktiver Zugriff auf dieses Team.' });
          return;
        }
      }
      const channels = await notificationService.listeKanaeleFuerTeam(teamId);
      res.status(200).json({ channels });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:notificationId/read', async (req, res, next) => {
    try {
      const id = String(req.params.notificationId ?? '').trim();
      const aktualisiert = await repo.markiereNotificationGelesen(req.coreAuth!.user.uuid, id);
      if (!aktualisiert) {
        res.status(404).json({ fehler: 'Benachrichtigung nicht gefunden.' });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/read-all', async (req, res, next) => {
    try {
      const aktualisiert = await repo.markiereAlleNotificationsGelesen(req.coreAuth!.user.uuid);
      res.status(200).json({ ok: true, markedRead: aktualisiert });
    } catch (err) {
      next(err);
    }
  });

  router.post('/dispatch', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const user = req.coreAuth!.user;
      const teamId = typeof body.teamId === 'string' && body.teamId.trim()
        ? body.teamId.trim()
        : undefined;

      let team = undefined;
      if (teamId) {
        team = (await repo.findeTeamNachId(teamId)) ?? undefined;
        if (!team) {
          res.status(404).json({ fehler: 'Team nicht gefunden.' });
          return;
        }
        if (!user.istSysadmin) {
          const mitgliedschaften = await repo.listeMitgliedschaften(teamId);
          const rolle = mitgliedschaften.find(
            (m) => m.userUuid === user.uuid && m.status === 'AKTIV'
          )?.rolle;
          if (rolle !== 'TEAM_ADMIN' && rolle !== 'COACH') {
            res.status(403).json({
              fehler: 'Nur Sysadmins, Team Admins oder Coaches dürfen Benachrichtigungen senden.',
            });
            return;
          }
        }
      } else if (!user.istSysadmin) {
        res.status(403).json({
          fehler: 'Instanzweite Benachrichtigungen ohne teamId erfordern Sysadmin-Rechte.',
        });
        return;
      }

      const ergebnis = await notificationService.dispatch({
        sourcePluginId: 'core',
        team,
        payload: {
          eventType: typeof body.eventType === 'string' ? body.eventType : 'core.announcement',
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

      res.status(200).json(ergebnis);
    } catch (err) {
      if (err instanceof Error && (err.message.includes('Notification') || err.message.includes('linkPath'))) {
        res.status(400).json({ fehler: err.message });
        return;
      }
      next(err);
    }
  });

  return router;
}
