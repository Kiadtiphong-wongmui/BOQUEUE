import { HttpError } from '../lib/httpError.ts';

export function parseIntParam(
  raw: unknown,
  name: string,
  opts: { min: number; max: number; fallback: number },
): number {
  if (raw === undefined || raw === '') return opts.fallback;
  const n =
    typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < opts.min || n > opts.max) {
    throw new HttpError(400, `${name} must be an integer between ${opts.min} and ${opts.max}`);
  }
  return n;
}

export function parseIsoDate(raw: unknown, name: string): Date | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
    throw new HttpError(400, `${name} must be an ISO 8601 date string`);
  }
  return new Date(raw);
}

export function parseModes(raw: unknown) {
  const out: { rushHour?: boolean; vipHour?: boolean; fairQueue?: boolean } = {};
  if (raw === undefined) return out;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, 'modes must be an object');
  }
  for (const key of ['rushHour', 'vipHour', 'fairQueue'] as const) {
    const v = (raw as Record<string, unknown>)[key];
    if (v === undefined) continue;
    if (typeof v !== 'boolean') throw new HttpError(400, `modes.${key} must be a boolean`);
    out[key] = v;
  }
  return out;
}
