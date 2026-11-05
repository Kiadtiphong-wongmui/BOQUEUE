import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../lib/httpError.ts';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

// Never log request bodies or DB messages: they can contain personal data.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const type = (err as { type?: string })?.type;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'Body too large' });
    return;
  }
  console.error('Unhandled error:', (err as { code?: string })?.code ?? (err as Error)?.name);
  res.status(500).json({ error: 'Internal server error' });
};
