import { Router } from 'express';
import type { QueueRepository } from '../db/repository.ts';
import { buildFrontRowUpgradeQueue } from '../domain/frontRowUpgrade/index.ts';
import type { RankedEntry } from '../domain/frontRowUpgrade/index.ts';
import { HttpError } from '../lib/httpError.ts';
import { maskEntry, maskReason } from '../lib/mask.ts';
import { parseIntParam, parseIsoDate, parseModes } from '../middleware/validate.ts';

const MAX_ENTRIES_PER_GROUP = 25;
const MAX_REASONS_PER_GROUP = 10;

function serializeRanked(r: RankedEntry) {
  return { entry: maskEntry(r.entry), score: r.score, reasons: r.reasons };
}

export function queueRouter(repo: QueueRepository): Router {
  const router = Router();

  router.get('/entries', async (req, res) => {
    const limit = parseIntParam(req.query.limit, 'limit', { min: 1, max: 200, fallback: 50 });
    const offset = parseIntParam(req.query.offset, 'offset', { min: 0, max: 100_000_000, fallback: 0 });
    const { items, total } = await repo.listEntries(limit, offset);
    res.json({ items: items.map(maskEntry), total, limit, offset });
  });

  router.patch('/entries/:id/loyalty-points', async (req, res) => {
    const id = String(req.params.id);
    if (id.length === 0 || id.length > 64) throw new HttpError(400, 'Invalid entry id');
    const value = (req.body as { loyaltyPoints?: unknown } | undefined)?.loyaltyPoints;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2_000_000_000) {
      throw new HttpError(400, 'loyaltyPoints must be an integer >= 0');
    }
    const updated = await repo.updateLoyaltyPoints(id, value);
    if (!updated) throw new HttpError(404, 'Entry not found');
    res.json({ id, loyaltyPoints: value });
  });

  router.post('/rank', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Body must be an object');

    const now = parseIsoDate(body.now, 'now') ?? new Date();
    const modes = parseModes(body.modes);
    const groupLimit = parseIntParam(body.groupLimit, 'groupLimit', { min: 1, max: 200, fallback: 20 });
    const groupOffset = parseIntParam(body.groupOffset, 'groupOffset', { min: 0, max: 100_000_000, fallback: 0 });
    const excludedLimit = parseIntParam(body.excludedLimit, 'excludedLimit', { min: 1, max: 200, fallback: 20 });
    const excludedOffset = parseIntParam(body.excludedOffset, 'excludedOffset', { min: 0, max: 100_000_000, fallback: 0 });
    const excludedReason = typeof body.excludedReason === 'string' ? body.excludedReason : undefined;
    const includeSingles = body.includeSingleAccountGroups === true;

    const entries = await repo.getAllEntries();
    const result = buildFrontRowUpgradeQueue(entries, now, modes);

    const excludedByReason: Record<string, number> = {};
    for (const x of result.excludedEntries) excludedByReason[x.reason] = (excludedByReason[x.reason] ?? 0) + 1;

    const groups = includeSingles ? result.fanGroups : result.fanGroups.filter((g) => g.entries.length > 1);
    const excluded = excludedReason
      ? result.excludedEntries.filter((x) => x.reason === excludedReason)
      : result.excludedEntries;

    res.json({
      now: now.toISOString(),
      modes,
      winner: result.winner ? serializeRanked(result.winner) : null,
      topCandidates: result.topCandidates.map(serializeRanked),
      summary: { ...result.stats, excludedByReason },
      fanGroups: {
        total: groups.length,
        limit: groupLimit,
        offset: groupOffset,
        items: groups.slice(groupOffset, groupOffset + groupLimit).map((g) => ({
          id: g.id,
          accountCount: g.entries.length,
          entries: g.entries.slice(0, MAX_ENTRIES_PER_GROUP).map(maskEntry),
          entriesTruncated: g.entries.length > MAX_ENTRIES_PER_GROUP,
          representative: g.representative
            ? { entryId: g.representative.entry.id, fanName: g.representative.entry.fanName, score: g.representative.score }
            : null,
          connectionReasons: g.connectionReasons.slice(0, MAX_REASONS_PER_GROUP).map(maskReason),
        })),
      },
      excludedEntries: {
        total: excluded.length,
        limit: excludedLimit,
        offset: excludedOffset,
        items: excluded
          .slice(excludedOffset, excludedOffset + excludedLimit)
          .map((x) => ({ entry: maskEntry(x.entry), reason: x.reason })),
      },
    });
  });

  return router;
}
