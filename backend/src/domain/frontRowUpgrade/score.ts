import { SCORE_CONFIG as C } from './config.ts';
import type { RankingOptions, TicketQueueEntry } from './types.ts';

/** Entry with everything parsed exactly once. */
export type PreparedEntry = {
  entry: TicketQueueEntry;
  joinedMs: number;
  ticketValue: number;
  loyalty: number;
  upgrades: number;
  isVip: boolean;
};

export type ScoreComponents = {
  loyalty: number;
  wait: number;
  hoursWaited: number;
  longWaitBonus: number;
  vip: number;
  ticket: number;
  penalty: number;
  total: number;
};

const FACTOR = 10 ** C.scorePrecision;
export const roundScore = (n: number): number => Math.round(n * FACTOR) / FACTOR;

export function computeComponents(
  p: PreparedEntry,
  groupUpgrades: number,
  nowMs: number,
  options: RankingOptions,
): ScoreComponents {
  const hoursWaited = Math.max(0, (nowMs - p.joinedMs) / 3_600_000);
  const rush = options.rushHour ? C.modes.rushHourWaitMultiplier : 1;

  const loyalty = C.loyaltyWeight * Math.log1p(p.loyalty);
  const baseWait = C.waitWeightPerHour * Math.min(hoursWaited, C.waitCapHours);
  const longWaitBonus = hoursWaited >= C.longWaitThresholdHours ? C.longWaitBonus : 0;
  const wait = (baseWait + longWaitBonus) * rush;
  const vip = p.isVip ? C.vipBonus + (options.vipHour ? C.modes.vipHourExtraBonus : 0) : 0;
  const ticket = C.ticketValueWeight * Math.log10(1 + Math.min(p.ticketValue, C.ticketValueCap));

  const fair = options.fairQueue ? C.modes.fairQueuePenaltyMultiplier : 1;
  const penalty = Math.min(C.upgradePenaltyCap * fair, C.upgradePenaltyPerUpgrade * groupUpgrades * fair);

  const total = roundScore(loyalty + wait + vip + ticket - penalty);
  return { loyalty, wait, hoursWaited, longWaitBonus, vip, ticket, penalty, total };
}

/** Hot-path version used for every eligible entry. */
export function computeScore(
  p: PreparedEntry,
  groupUpgrades: number,
  nowMs: number,
  options: RankingOptions,
): number {
  return computeComponents(p, groupUpgrades, nowMs, options).total;
}

/** Positive => a ranks ahead of b. score desc, joined asc, loyalty desc, id asc. */
export function compareRanked(
  a: PreparedEntry,
  aScore: number,
  b: PreparedEntry,
  bScore: number,
): number {
  if (aScore !== bScore) return bScore - aScore;
  if (a.joinedMs !== b.joinedMs) return a.joinedMs - b.joinedMs;
  if (a.loyalty !== b.loyalty) return b.loyalty - a.loyalty;
  if (a.entry.id < b.entry.id) return -1;
  if (a.entry.id > b.entry.id) return 1;
  return 0;
}

/** Why `a` was ranked above `b`. */
export function decidingFactor(
  a: PreparedEntry,
  aScore: number,
  b: PreparedEntry,
  bScore: number,
): string {
  if (aScore !== bScore) return `higher score (${aScore} vs ${bScore})`;
  if (a.joinedMs !== b.joinedMs) return 'tie on score, joined the queue earlier';
  if (a.loyalty !== b.loyalty) return 'tie on score and join time, more loyalty points';
  return 'tie on everything else, lower entry id';
}

export function describeModes(options: RankingOptions): string[] {
  const out: string[] = [];
  if (options.rushHour) out.push(`Rush Hour active: wait score x${C.modes.rushHourWaitMultiplier}`);
  if (options.vipHour) out.push(`VIP Hour active: VIP members get +${C.modes.vipHourExtraBonus} extra`);
  if (options.fairQueue) {
    out.push(`Fair Queue active: recent-upgrade penalty x${C.modes.fairQueuePenaltyMultiplier}`);
  }
  return out;
}

const f = (n: number) => n.toFixed(2);

export function explain(
  p: PreparedEntry,
  c: ScoreComponents,
  groupUpgrades: number,
  groupSize: number,
  options: RankingOptions,
): string[] {
  const reasons: string[] = [];
  reasons.push(`Loyalty: ${p.loyalty} points -> +${f(c.loyalty)}`);
  reasons.push(
    `Waiting: ${f(c.hoursWaited)}h in queue -> +${f(c.wait)}` +
      (c.longWaitBonus > 0 ? ` (includes long-wait bonus ${c.longWaitBonus})` : ''),
  );
  reasons.push(p.isVip ? `VIP membership -> +${f(c.vip)}` : 'Not VIP -> +0.00');
  reasons.push(`Ticket value: ${p.ticketValue} -> +${f(c.ticket)}`);
  reasons.push(
    `Recent upgrades: ${groupUpgrades} in the last 30 days` +
      (groupSize > 1 ? ` (summed over ${groupSize} linked accounts)` : '') +
      ` -> -${f(c.penalty)}`,
  );
  if (groupSize > 1) {
    reasons.push(`Represents a group of ${groupSize} linked accounts; only this one entry competes`);
  }
  reasons.push(...describeModes(options));
  return reasons;
}
