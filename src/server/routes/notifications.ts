import { Router } from 'express';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { requireAuth } from '../middleware/auth.ts';

export function erstelleNotificationsRouter(
  repo: CoreRepository,
  config: CoreServerConfig
): Router {
  const router = Router();
  const auth = requireAuth(repo, config);

  router.get('/', auth, async (req, res, next) => {
    try {
      const limit = Number(req.query.limit ?? 30);
      const nurUngelesen = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
      const [eintraege, ungelesen] = await Promise.all([
        repo.listeNotificationsFuerUser(req.coreAuth!.user.uuid, { limit, nurUngelesen }),
        repo.zaehleUngeleseneNotifications(req.coreAuth!.user.uuid),
      ]);
      res.json({ notifications: eintraege, ungelesen });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/read', auth, async (req, res, next) => {
    try {
      const id = String(req.params.id ?? '').trim();
      await repo.markiereNotificationGelesen(req.coreAuth!.user.uuid, id);
      const ungelesen = await repo.zaehleUngeleseneNotifications(req.coreAuth!.user.uuid);
      res.json({ ok: true, ungelesen });
    } catch (err) {
      next(err);
    }
  });

  router.post('/read-all', auth, async (req, res, next) => {
    try {
      const markiert = await repo.markiereAlleNotificationsGelesen(req.coreAuth!.user.uuid);
      res.json({ ok: true, markiert, ungelesen: 0 });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
