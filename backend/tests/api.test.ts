import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { QueueRepository } from '../src/db/repository.ts';
import { sampleEntries } from '../src/db/syntheticData.ts';
import { maskReason, maskTail } from '../src/lib/mask.ts';
import { createApp } from '../src/server.ts';

const ORIGIN = 'http://localhost:3000';
const entries = sampleEntries(new Date());

const repo: QueueRepository = {
  async ping() {},
  async listEntries(limit, offset) {
    return { items: entries.slice(offset, offset + limit), total: entries.length };
  },
  async getAllEntries() {
    return entries;
  },
  async updateLoyaltyPoints(id, value) {
    const e = entries.find((x) => x.id === id);
    if (!e) return false;
    e.loyaltyPoints = value;
    return true;
  },
};

describe('HTTP API (fake repository)', () => {
  let base = '';
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;

  before(async () => {
    server = createApp(repo, ORIGIN).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const post = (path: string, body: unknown) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('GET /api/health', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok', db: 'connected' });
  });

  it('CORS only allows the configured origin', async () => {
    const ok = await fetch(`${base}/api/health`, { headers: { origin: ORIGIN } });
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
    const bad = await fetch(`${base}/api/health`, { headers: { origin: 'http://evil.example' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
  });

  it('GET /api/queue/entries masks phone and payment account, validates paging', async () => {
    const res = await fetch(`${base}/api/queue/entries?limit=3`);
    const body = (await res.json()) as { items: Array<{ phoneNumber: string | null }>; total: number };
    assert.equal(body.items.length, 3);
    assert.match(body.items[0]!.phoneNumber!, /^\*+\d{4}$/);
    assert.equal((await fetch(`${base}/api/queue/entries?limit=abc`)).status, 400);
    assert.equal((await fetch(`${base}/api/queue/entries?limit=100000`)).status, 400);
  });

  it('POST /api/queue/rank returns winner, top 3, multi-account groups and excluded reasons', async () => {
    const res = await post('/api/queue/rank', {});
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.winner);
    assert.ok(body.winner.reasons.length > 0);
    assert.equal(body.topCandidates.length, 3);
    assert.ok(body.fanGroups.items.every((g: any) => g.accountCount > 1));
    assert.ok(body.fanGroups.total >= 2);
    assert.equal(body.summary.excludedByReason['Cancelled entry'], 1);
    assert.ok(!JSON.stringify(body).includes('0812345678'), 'raw phone number leaked');
    const filtered = (await (await post('/api/queue/rank', { excludedReason: 'Blocked fan' })).json()) as any;
    assert.equal(filtered.excludedEntries.total, 1);
  });

  it('POST /api/queue/rank honours `now` and modes, and validates input', async () => {
    const later = new Date(Date.now() + 7 * 3_600_000).toISOString(); // after the concert starts
    const body = (await (await post('/api/queue/rank', { now: later })).json()) as any;
    assert.equal(body.winner, null);
    assert.equal((await post('/api/queue/rank', { now: 'nope' })).status, 400);
    assert.equal((await post('/api/queue/rank', { modes: { rushHour: 'yes' } })).status, 400);
    const rush = (await (await post('/api/queue/rank', { modes: { rushHour: true } })).json()) as any;
    assert.ok(rush.winner.reasons.some((r: string) => r.startsWith('Rush Hour active')));
  });

  it('PATCH loyalty-points validates and updates', async () => {
    const patch = (id: string, body: unknown) =>
      fetch(`${base}/api/queue/entries/${id}/loyalty-points`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    assert.equal((await patch('S001', { loyaltyPoints: 777 })).status, 200);
    assert.equal(entries.find((e) => e.id === 'S001')!.loyaltyPoints, 777);
    for (const bad of [-1, 1.5, '5', null, undefined]) {
      assert.equal((await patch('S001', { loyaltyPoints: bad })).status, 400, `value ${String(bad)}`);
    }
    assert.equal((await patch('NOPE', { loyaltyPoints: 1 })).status, 404);
  });

  it('returns 400 for malformed JSON and 404 for unknown routes', async () => {
    const res = await fetch(`${base}/api/queue/rank`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad',
    });
    assert.equal(res.status, 400);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });
});

describe('masking', () => {
  it('keeps only the last 4 characters', () => {
    assert.equal(maskTail('0812345678'), '******5678');
    assert.equal(maskTail(''), null);
    assert.equal(maskTail(null), null);
    assert.equal(maskTail('123'), '***');
  });
  it('masks values embedded in connection reasons', () => {
    assert.equal(maskReason('Shared phone 0812345678 (entries a, b)'), 'Shared phone ******5678 (entries a, b)');
    assert.equal(maskReason('Shared device ID dev-9 (entries a, b)'), 'Shared device ID dev-9 (entries a, b)');
  });
});
