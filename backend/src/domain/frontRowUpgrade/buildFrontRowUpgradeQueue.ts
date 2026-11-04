import { SCORE_CONFIG as C } from './config.ts';
import {
  nonNegative,
  normalizeKey,
  normalizePhone,
  parseTicketValue,
  parseTime,
} from './normalize.ts';
import {
  compareRanked,
  computeComponents,
  computeScore,
  decidingFactor,
  explain,
  type PreparedEntry,
} from './score.ts';
import type {
  ExcludedEntry,
  FanGroup,
  FrontRowUpgradeResult,
  RankedEntry,
  RankingOptions,
  TicketQueueEntry,
} from './types.ts';
import { UnionFind } from './unionFind.ts';

type SharedKey = { kind: string; value: string; members: number[] };

/** Tracks the first index per key; allocates only once a key is actually shared. */
class KeyIndex {
  readonly kind: string;
  readonly label: string;
  readonly first = new Map<string, number>();
  readonly shared = new Map<string, SharedKey>();

  constructor(kind: string, label: string) {
    this.kind = kind;
    this.label = label;
  }

  /** Returns the earlier index sharing this key, or -1. */
  add(value: string, index: number): number {
    const prev = this.first.get(value);
    if (prev === undefined) {
      this.first.set(value, index);
      return -1;
    }
    let info = this.shared.get(value);
    if (info === undefined) {
      info = { kind: this.label, value, members: [prev] };
      this.shared.set(value, info);
    }
    info.members.push(index);
    return prev;
  }
}

function exclusionReason(entry: TicketQueueEntry, nowMs: number): {
  reason: string | null;
  joinedMs: number;
  ticketValue: number;
} {
  const none = { joinedMs: 0, ticketValue: 0 };
  if (entry.status === 'cancelled') return { reason: 'Cancelled entry', ...none };
  if (entry.status === 'upgraded') return { reason: 'Already upgraded', ...none };

  const joinedMs = parseTime(entry.joinedQueueAt);
  const startsMs = parseTime(entry.eventStartsAt);
  if (joinedMs === null || startsMs === null) return { reason: 'Invalid date', ...none };
  if (startsMs <= nowMs) return { reason: 'Concert already started', ...none };
  if (entry.membership === 'blocked') return { reason: 'Blocked fan', ...none };

  const ticketValue = parseTicketValue(entry.ticketValue);
  if (ticketValue === null) return { reason: 'Invalid ticket value', ...none };
  return { reason: null, joinedMs, ticketValue };
}

/**
 * Pure and deterministic: same entries + now + options => same result,
 * regardless of the input order. Never mutates its input.
 */
export function buildFrontRowUpgradeQueue(
  entries: TicketQueueEntry[],
  now: Date,
  options: RankingOptions = {},
): FrontRowUpgradeResult {
  const nowMs = now.getTime();
  if (Number.isNaN(nowMs)) throw new RangeError('`now` must be a valid Date');

  // ---- 1. eligibility (each entry parsed exactly once) -------------------
  const excluded: ExcludedEntry[] = [];
  const eligible: PreparedEntry[] = [];
  const uf = new UnionFind(entries.length);
  const phones = new KeyIndex('phone', 'phone');
  const devices = new KeyIndex('device', 'device ID');
  const payments = new KeyIndex('payment', 'payment account');
  const fans = new KeyIndex('fan', 'fanId');

  for (const entry of entries) {
    const { reason, joinedMs, ticketValue } = exclusionReason(entry, nowMs);
    if (reason !== null) {
      excluded.push({ entry, reason });
      continue;
    }
    const index = eligible.length;
    eligible.push({
      entry,
      joinedMs,
      ticketValue,
      loyalty: nonNegative(entry.loyaltyPoints),
      upgrades: nonNegative(entry.upgradesLast30Days),
      isVip: entry.membership === 'vip',
    });

    // ---- 2. linking: empty values never link --------------------------
    const keys: Array<[KeyIndex, string | null]> = [
      [phones, normalizePhone(entry.phoneNumber)],
      [devices, normalizeKey(entry.deviceId)],
      [payments, normalizeKey(entry.paymentAccount)],
      [fans, typeof entry.fanId === 'string' && entry.fanId.trim() !== '' ? entry.fanId.trim() : null],
    ];
    for (const [idx, value] of keys) {
      if (value === null) continue;
      const prev = idx.add(value, index);
      if (prev !== -1) uf.union(prev, index);
    }
  }

  excluded.sort((a, b) => (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));

  const m = eligible.length;

  // ---- 3. group totals, scores, representative per group ----------------
  const groupUpgrades = new Float64Array(m);
  for (let i = 0; i < m; i++) groupUpgrades[uf.find(i)]! += eligible[i]!.upgrades;

  const scores = new Float64Array(m);
  const best = new Int32Array(m).fill(-1);
  for (let i = 0; i < m; i++) {
    const root = uf.find(i);
    const s = computeScore(eligible[i]!, groupUpgrades[root]!, nowMs, options);
    scores[i] = s;
    const b = best[root]!;
    if (b === -1 || compareRanked(eligible[i]!, s, eligible[b]!, scores[b]!) < 0) best[root] = i;
  }

  // ---- 4. top N representatives, O(g * N) --------------------------------
  const top: number[] = [];
  for (let root = 0; root < m; root++) {
    const rep = best[root]!;
    if (rep === -1) continue;
    let pos = top.length;
    while (
      pos > 0 &&
      compareRanked(eligible[rep]!, scores[rep]!, eligible[top[pos - 1]!]!, scores[top[pos - 1]!]!) < 0
    ) {
      pos--;
    }
    if (pos < C.topCandidateCount) {
      top.splice(pos, 0, rep);
      if (top.length > C.topCandidateCount) top.pop();
    }
  }

  const rankedByIndex = new Map<number, RankedEntry>();
  top.forEach((idx, rank) => {
    const p = eligible[idx]!;
    const root = uf.find(idx);
    const comps = computeComponents(p, groupUpgrades[root]!, nowMs, options);
    const reasons = explain(p, comps, groupUpgrades[root]!, uf.size[root]!, options);
    const next = top[rank + 1];
    if (rank === 0 && next !== undefined) {
      reasons.push(
        `Beat runner-up ${eligible[next]!.entry.fanName} (${eligible[next]!.entry.id}) by ${decidingFactor(
          p,
          scores[idx]!,
          eligible[next]!,
          scores[next]!,
        )}`,
      );
    } else if (rank === 0) {
      reasons.push('Only eligible group in the queue');
    }
    rankedByIndex.set(idx, { entry: p.entry, score: scores[idx]!, reasons });
  });
  const topCandidates = top.map((i) => rankedByIndex.get(i)!);

  // ---- 5. fan groups ---------------------------------------------------
  const members = new Map<number, TicketQueueEntry[]>();
  for (let i = 0; i < m; i++) {
    const root = uf.find(i);
    const list = members.get(root);
    if (list) list.push(eligible[i]!.entry);
    else members.set(root, [eligible[i]!.entry]);
  }

  const reasonsByRoot = new Map<number, string[]>();
  for (const idx of [phones, devices, payments, fans]) {
    for (const info of idx.shared.values()) {
      const ids = info.members.map((i) => eligible[i]!.entry.id).sort();
      const shown = ids.slice(0, C.maxIdsInReason).join(', ');
      const more = ids.length > C.maxIdsInReason ? ` +${ids.length - C.maxIdsInReason} more` : '';
      const text =
        info.kind === 'fanId'
          ? `Same fanId ${info.value} (entries ${shown}${more})`
          : `Shared ${info.kind} ${info.value} (entries ${shown}${more})`;
      const root = uf.find(info.members[0]!);
      const list = reasonsByRoot.get(root);
      if (list) list.push(text);
      else reasonsByRoot.set(root, [text]);
    }
  }

  const rootKeys: Array<{ group: FanGroup; rep: number }> = [];
  for (const [root, list] of members) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const rep = best[root]!;
    const repRanked =
      rankedByIndex.get(rep) ?? { entry: eligible[rep]!.entry, score: scores[rep]!, reasons: [] };
    rootKeys.push({
      rep,
      group: {
        id: `group-${list[0]!.id}`,
        entries: list,
        representative: repRanked,
        connectionReasons: (reasonsByRoot.get(root) ?? []).sort(),
      },
    });
  }
  rootKeys.sort((a, b) =>
    compareRanked(eligible[a.rep]!, scores[a.rep]!, eligible[b.rep]!, scores[b.rep]!),
  );
  const fanGroups = rootKeys.map((k) => k.group);

  let multi = 0;
  for (const g of fanGroups) if (g.entries.length > 1) multi++;

  return {
    winner: topCandidates[0] ?? null,
    topCandidates,
    fanGroups,
    excludedEntries: excluded,
    stats: {
      totalEntries: entries.length,
      eligibleEntries: m,
      excludedEntries: excluded.length,
      fanGroups: fanGroups.length,
      multiAccountGroups: multi,
    },
  };
}
