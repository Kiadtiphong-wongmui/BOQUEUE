import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFrontRowUpgradeQueue,
  normalizePhone,
  parseTicketValue,
} from '../src/domain/frontRowUpgrade/index.ts';
import type { TicketQueueEntry } from '../src/domain/frontRowUpgrade/index.ts';

const NOW = new Date('2026-06-01T12:00:00Z');
const FUTURE = '2026-06-01T20:00:00Z';

let seq = 0;
function make(overrides: Partial<TicketQueueEntry> = {}): TicketQueueEntry {
  seq++;
  return {
    id: `e${seq}`,
    fanId: `fan-${seq}`,
    fanName: `Fan ${seq}`,
    ticketValue: 1500,
    joinedQueueAt: '2026-06-01T10:00:00Z',
    eventStartsAt: FUTURE,
    status: 'waiting',
    loyaltyPoints: 0,
    upgradesLast30Days: 0,
    membership: 'regular',
    phoneNumber: null,
    deviceId: null,
    paymentAccount: null,
    ...overrides,
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

function excludedReason(result: ReturnType<typeof buildFrontRowUpgradeQueue>, id: string) {
  return result.excludedEntries.find((x) => x.entry.id === id)?.reason;
}

describe('eligibility', () => {
  it('cancelled entry can never win and is reported', () => {
    const cancelled = make({ id: 'c', status: 'cancelled', loyaltyPoints: 999_999, membership: 'vip' });
    const other = make({ id: 'o' });
    const r = buildFrontRowUpgradeQueue([cancelled, other], NOW);
    assert.equal(r.winner?.entry.id, 'o');
    assert.equal(excludedReason(r, 'c'), 'Cancelled entry');
  });

  it('already upgraded entry is excluded', () => {
    const r = buildFrontRowUpgradeQueue([make({ id: 'u', status: 'upgraded' })], NOW);
    assert.equal(r.winner, null);
    assert.equal(excludedReason(r, 'u'), 'Already upgraded');
  });

  it('entry whose concert already started can never win', () => {
    const started = make({ id: 's', eventStartsAt: '2026-06-01T11:00:00Z', loyaltyPoints: 5000 });
    const exact = make({ id: 'x', eventStartsAt: '2026-06-01T12:00:00Z' });
    const ok = make({ id: 'ok' });
    const r = buildFrontRowUpgradeQueue([started, exact, ok], NOW);
    assert.equal(r.winner?.entry.id, 'ok');
    assert.equal(excludedReason(r, 's'), 'Concert already started');
    assert.equal(excludedReason(r, 'x'), 'Concert already started');
  });

  it('blocked fan can never win', () => {
    const blocked = make({ id: 'b', membership: 'blocked', loyaltyPoints: 99999 });
    const ok = make({ id: 'ok' });
    const r = buildFrontRowUpgradeQueue([blocked, ok], NOW);
    assert.equal(r.winner?.entry.id, 'ok');
    assert.equal(excludedReason(r, 'b'), 'Blocked fan');
  });

  it('invalid ticket values (bad / 0 / negative / null / NaN / Infinity) are excluded', () => {
    const bad: Array<TicketQueueEntry['ticketValue']> = ['abc', 0, -5, null, NaN, Infinity, '', '0', '-10'];
    const entries = bad.map((v, i) => make({ id: `bad${i}`, ticketValue: v }));
    const r = buildFrontRowUpgradeQueue(entries, NOW);
    assert.equal(r.winner, null);
    for (const e of entries) assert.equal(excludedReason(r, e.id), 'Invalid ticket value');
  });

  it('string ticket values are parsed ("1,500" ok, "abc" not)', () => {
    assert.equal(parseTicketValue('1,500'), 1500);
    assert.equal(parseTicketValue(' 1500 '), 1500);
    assert.equal(parseTicketValue('abc'), null);
    const r = buildFrontRowUpgradeQueue(
      [make({ id: 'good', ticketValue: '1,500' }), make({ id: 'bad', ticketValue: 'abc' })],
      NOW,
    );
    assert.equal(r.winner?.entry.id, 'good');
    assert.equal(excludedReason(r, 'bad'), 'Invalid ticket value');
  });

  it('malformed dates are excluded instead of throwing', () => {
    const r = buildFrontRowUpgradeQueue(
      [
        make({ id: 'd1', joinedQueueAt: 'not-a-date' }),
        make({ id: 'd2', eventStartsAt: '' }),
        make({ id: 'ok' }),
      ],
      NOW,
    );
    assert.equal(r.winner?.entry.id, 'ok');
    assert.equal(excludedReason(r, 'd1'), 'Invalid date');
    assert.equal(excludedReason(r, 'd2'), 'Invalid date');
  });

  it('empty list and all-excluded list give winner null without crashing', () => {
    assert.equal(buildFrontRowUpgradeQueue([], NOW).winner, null);
    const r = buildFrontRowUpgradeQueue([make({ status: 'cancelled' }), make({ membership: 'blocked' })], NOW);
    assert.equal(r.winner, null);
    assert.deepEqual(r.topCandidates, []);
    assert.equal(r.excludedEntries.length, 2);
  });
});

describe('fan grouping', () => {
  it('phone numbers in different formats link accounts (incl. +66)', () => {
    const forms = ['081-234-5678', '081 234 5678', ' 0812345678', '+66812345678', '66812345678', '+66 81 234 5678'];
    const entries = forms.map((p, i) => make({ id: `p${i}`, phoneNumber: p }));
    const r = buildFrontRowUpgradeQueue(entries, NOW);
    assert.equal(r.fanGroups.length, 1);
    assert.equal(r.fanGroups[0]!.entries.length, forms.length);
    assert.match(r.fanGroups[0]!.connectionReasons[0]!, /^Shared phone 0812345678 \(entries p0, p1, p2, p3, p4 \+1 more\)$/);
    assert.equal(normalizePhone('+66812345678'), '0812345678');
  });

  it('indirect links A-B (phone) and B-C (device) form one group', () => {
    const a = make({ id: 'A', phoneNumber: '0811111111' });
    const b = make({ id: 'B', phoneNumber: '081-111-1111', deviceId: 'DEV-9' });
    const c = make({ id: 'C', deviceId: ' dev-9 ' });
    const d = make({ id: 'D' });
    const r = buildFrontRowUpgradeQueue([c, d, a, b], NOW);
    assert.equal(r.fanGroups.length, 2);
    const g = r.fanGroups.find((x) => x.entries.length === 3)!;
    assert.deepEqual(g.entries.map((e) => e.id), ['A', 'B', 'C']);
    assert.ok(g.connectionReasons.includes('Shared phone 0811111111 (entries A, B)'));
    assert.ok(g.connectionReasons.includes('Shared device ID dev-9 (entries B, C)'));
  });

  it('payment account links accounts (trim + lowercase)', () => {
    const r = buildFrontRowUpgradeQueue(
      [make({ paymentAccount: 'ACC-1' }), make({ paymentAccount: ' acc-1 ' })],
      NOW,
    );
    assert.equal(r.fanGroups.length, 1);
    assert.match(r.fanGroups[0]!.connectionReasons[0]!, /^Shared payment account acc-1/);
  });

  it('same fanId links accounts', () => {
    const r = buildFrontRowUpgradeQueue([make({ fanId: 'F' }), make({ fanId: 'F' })], NOW);
    assert.equal(r.fanGroups.length, 1);
    assert.match(r.fanGroups[0]!.connectionReasons[0]!, /^Same fanId F/);
  });

  it('empty values never link accounts', () => {
    const entries = [
      make({ deviceId: '', phoneNumber: '', paymentAccount: '   ' }),
      make({ deviceId: '', phoneNumber: '', paymentAccount: '   ' }),
      make({ deviceId: null, phoneNumber: undefined, paymentAccount: null }),
      make({ deviceId: '  ', phoneNumber: ' - ', paymentAccount: undefined }),
    ];
    const r = buildFrontRowUpgradeQueue(entries, NOW);
    assert.equal(r.fanGroups.length, 4);
    assert.equal(r.stats.multiAccountGroups, 0);
  });

  it('only one representative per group competes', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      make({ id: `s${i}`, deviceId: 'shared', loyaltyPoints: 100 + i }),
    );
    const r = buildFrontRowUpgradeQueue(entries, NOW);
    assert.equal(r.topCandidates.length, 1);
    assert.equal(r.winner?.entry.id, 's9');
  });

  it('a large group does not win just because it has many accounts', () => {
    const big = Array.from({ length: 50 }, (_, i) =>
      make({ id: `big${i}`, deviceId: 'farm', loyaltyPoints: 10, upgradesLast30Days: 1 }),
    );
    const solo = make({ id: 'solo', loyaltyPoints: 10 });
    const r = buildFrontRowUpgradeQueue([...big, solo], NOW);
    assert.equal(r.winner?.entry.id, 'solo');
    // group's upgrade history is summed (50) so the penalty hits the cap
    const bigRep = r.fanGroups.find((g) => g.entries.length === 50)!.representative!;
    assert.ok(bigRep.score < r.winner!.score);
  });

  it('upgrade history spread over several accounts is summed for the penalty', () => {
    const spreadA = make({ id: 'a', deviceId: 'd', upgradesLast30Days: 2, loyaltyPoints: 50 });
    const spreadB = make({ id: 'b', deviceId: 'd', upgradesLast30Days: 2, loyaltyPoints: 50 });
    const single = make({ id: 'single', upgradesLast30Days: 2, loyaltyPoints: 50 });
    const r = buildFrontRowUpgradeQueue([spreadA, spreadB, single], NOW);
    const group = r.fanGroups.find((g) => g.entries.length === 2)!;
    assert.ok(group.representative!.score < r.fanGroups.find((g) => g.entries.length === 1)!.representative!.score);
  });

  it('a very long chain (100,000 entries) neither overflows the stack nor is slow', () => {
    const n = 100_000;
    const phone = (k: number) => `08${String(k).padStart(8, '0')}`;
    // pairs (0,1),(2,3).. share a device; pairs (1,2),(3,4).. share a phone => one long chain
    const entries: TicketQueueEntry[] = [];
    for (let i = 0; i < n; i++) {
      entries.push(
        make({
          id: `c${String(i).padStart(6, '0')}`,
          deviceId: `d${Math.floor(i / 2)}`,
          phoneNumber: phone(Math.floor((i + 1) / 2)),
        }),
      );
    }
    const start = performance.now();
    const r = buildFrontRowUpgradeQueue(entries, NOW);
    const ms = performance.now() - start;
    assert.equal(r.fanGroups.length, 1);
    assert.equal(r.fanGroups[0]!.entries.length, n);
    assert.ok(ms < 5000, `took ${ms}ms`);
  });
});

describe('ranking', () => {
  it('same input + same time => same winner, in any input order', () => {
    const entries = Array.from({ length: 40 }, (_, i) =>
      make({
        id: `r${i}`,
        loyaltyPoints: (i * 37) % 500,
        upgradesLast30Days: i % 4,
        joinedQueueAt: new Date(NOW.getTime() - (1 + (i % 9)) * 3_600_000).toISOString(),
        membership: i % 5 === 0 ? 'vip' : 'regular',
        deviceId: i % 7 === 0 ? 'shared-dev' : null,
      }),
    );
    const base = buildFrontRowUpgradeQueue(entries, NOW);
    for (let run = 0; run < 5; run++) {
      const shuffled = [...entries];
      // deterministic Fisher-Yates with an LCG so the test itself has no randomness
      let state = run + 1;
      for (let i = shuffled.length - 1; i > 0; i--) {
        state = (state * 1103515245 + 12345) % 2 ** 31;
        const j = state % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      const again = buildFrontRowUpgradeQueue(shuffled, NOW);
      assert.equal(again.winner?.entry.id, base.winner?.entry.id);
      assert.equal(again.winner?.score, base.winner?.score);
      assert.deepEqual(
        again.topCandidates.map((c) => c.entry.id),
        base.topCandidates.map((c) => c.entry.id),
      );
      assert.deepEqual(
        again.fanGroups.map((g) => g.id),
        base.fanGroups.map((g) => g.id),
      );
    }
  });

  it('does not mutate its input (deep-frozen)', () => {
    const entries = deepFreeze([
      make({ id: 'm1', deviceId: 'x', loyaltyPoints: 3 }),
      make({ id: 'm2', deviceId: 'x' }),
      make({ id: 'm3', status: 'cancelled' }),
    ]);
    const snapshot = JSON.stringify(entries);
    assert.doesNotThrow(() => buildFrontRowUpgradeQueue(entries, NOW, { rushHour: true, fairQueue: true }));
    assert.equal(JSON.stringify(entries), snapshot);
  });

  it('tie-break: score, then earlier joinedQueueAt, then loyalty, then id', () => {
    // identical score components => compare by tie-breakers
    const same = { loyaltyPoints: 0, joinedQueueAt: '2026-06-01T10:00:00Z' };
    const r1 = buildFrontRowUpgradeQueue([make({ id: 'b', ...same }), make({ id: 'a', ...same })], NOW);
    assert.equal(r1.winner?.entry.id, 'a');
    assert.match(r1.winner!.reasons.join('\n'), /lower entry id/);

    // earlier join wins when scores are equal: cap wait so that score is identical
    const capped = { joinedQueueAt: '2026-05-01T00:00:00Z' };
    const early = make({ id: 'z-early', ...capped, joinedQueueAt: '2026-04-01T00:00:00Z' });
    const late = make({ id: 'a-late', ...capped });
    const r2 = buildFrontRowUpgradeQueue([late, early], NOW);
    assert.equal(r2.winner?.entry.id, 'z-early');
    assert.match(r2.winner!.reasons.join('\n'), /joined the queue earlier/);
  });

  it('higher score wins and the reasons explain the components', () => {
    const r = buildFrontRowUpgradeQueue(
      [make({ id: 'low', loyaltyPoints: 1 }), make({ id: 'high', loyaltyPoints: 5000, membership: 'vip' })],
      NOW,
    );
    assert.equal(r.winner?.entry.id, 'high');
    const text = r.winner!.reasons.join('\n');
    assert.match(text, /Loyalty: 5000 points/);
    assert.match(text, /VIP membership/);
    assert.match(text, /Beat runner-up/);
    assert.equal(r.topCandidates.length, 2);
  });

  it('null / negative loyalty and upgrades are treated as 0', () => {
    const r = buildFrontRowUpgradeQueue(
      [
        make({ id: 'n', loyaltyPoints: null, upgradesLast30Days: null }),
        make({ id: 'neg', loyaltyPoints: -50, upgradesLast30Days: -3 }),
        make({ id: 'u', loyaltyPoints: undefined, upgradesLast30Days: undefined }),
      ],
      NOW,
    );
    const scores = new Set(r.fanGroups.map((g) => g.representative!.score));
    assert.equal(scores.size, 1);
  });

  it('returns at most 3 top candidates, winner first', () => {
    const entries = Array.from({ length: 8 }, (_, i) => make({ id: `t${i}`, loyaltyPoints: i * 100 }));
    const r = buildFrontRowUpgradeQueue(entries, NOW);
    assert.deepEqual(r.topCandidates.map((c) => c.entry.id), ['t7', 't6', 't5']);
    assert.equal(r.winner, r.topCandidates[0]);
  });
});

describe('modes', () => {
  const longWaiter = () =>
    make({ id: 'waiter', joinedQueueAt: '2026-06-01T00:00:00Z', loyaltyPoints: 0 });

  it('Rush Hour boosts people who waited longer', () => {
    const loyal = make({ id: 'loyal', loyaltyPoints: 30 });
    const waiter = longWaiter();
    assert.equal(buildFrontRowUpgradeQueue([loyal, waiter], NOW).winner?.entry.id, 'loyal');
    const rush = buildFrontRowUpgradeQueue([loyal, waiter], NOW, { rushHour: true });
    assert.equal(rush.winner?.entry.id, 'waiter');
    assert.ok(rush.winner!.reasons.some((x) => x.startsWith('Rush Hour active')));
  });

  it('VIP Hour boosts VIP members', () => {
    const vip = make({ id: 'vip', membership: 'vip', loyaltyPoints: 0 });
    const loyal = make({ id: 'loyal', loyaltyPoints: 8 });
    assert.equal(buildFrontRowUpgradeQueue([vip, loyal], NOW).winner?.entry.id, 'loyal');
    const hour = buildFrontRowUpgradeQueue([vip, loyal], NOW, { vipHour: true });
    assert.equal(hour.winner?.entry.id, 'vip');
    assert.ok(hour.winner!.reasons.some((x) => x.startsWith('VIP Hour active')));
  });

  it('Fair Queue penalises recent upgrades harder', () => {
    const lucky = make({ id: 'lucky', loyaltyPoints: 400, upgradesLast30Days: 1 });
    const fresh = make({ id: 'fresh', loyaltyPoints: 20 });
    assert.equal(buildFrontRowUpgradeQueue([lucky, fresh], NOW).winner?.entry.id, 'lucky');
    const fair = buildFrontRowUpgradeQueue([lucky, fresh], NOW, { fairQueue: true });
    assert.equal(fair.winner?.entry.id, 'fresh');
    assert.ok(fair.winner!.reasons.some((x) => x.startsWith('Fair Queue active')));
  });

  it('modes can be combined and all appear in the reasons', () => {
    const r = buildFrontRowUpgradeQueue([make({ membership: 'vip' })], NOW, {
      rushHour: true,
      vipHour: true,
      fairQueue: true,
    });
    const text = r.winner!.reasons.join('\n');
    assert.match(text, /Rush Hour active/);
    assert.match(text, /VIP Hour active/);
    assert.match(text, /Fair Queue active/);
  });
});

describe('input validation', () => {
  it('rejects an invalid `now`', () => {
    assert.throws(() => buildFrontRowUpgradeQueue([], new Date('nope')), RangeError);
  });
});
