import express from 'express';
import type { Express } from 'express';
import type { QueueRepository } from './db/repository.ts';
import { cors } from './middleware/cors.ts';
import { errorHandler, notFound } from './middleware/errorHandler.ts';
import { healthRouter } from './routes/health.ts';
import { queueRouter } from './routes/queue.ts';

/** Builds the Express app. DB access is injected so it can be tested without MySQL. */
export function createApp(repo: QueueRepository, corsOrigin: string): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(corsOrigin));
  app.use(express.json({ limit: '10kb' }));

  app.use('/api/health', healthRouter(repo));
  app.use('/health', healthRouter(repo)); // legacy alias
  app.use('/api/queue', queueRouter(repo));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
