import { Router } from 'express';
import type { QueueRepository } from '../db/repository.ts';

export function healthRouter(repo: QueueRepository): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    try {
      await repo.ping();
      res.json({ status: 'ok', db: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', db: 'unreachable' });
    }
  });
  return router;
}
