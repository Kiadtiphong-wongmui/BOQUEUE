/**
 * Every tunable number of the scoring model lives here.
 *
 * score = loyalty + wait + vip + ticketValue - upgradePenalty
 */
export const SCORE_CONFIG = {
  /** loyalty = loyaltyWeight * ln(1 + points). Diminishing returns. */
  loyaltyWeight: 6,

  /** wait = waitWeightPerHour * min(hoursWaited, waitCapHours) */
  waitWeightPerHour: 1,
  waitCapHours: 48,
  /** Extra flat bonus once somebody waited at least this long. */
  longWaitThresholdHours: 24,
  longWaitBonus: 12,

  /** VIP members get a flat bonus. */
  vipBonus: 10,

  /** ticket = ticketValueWeight * log10(1 + min(value, ticketValueCap)) */
  ticketValueWeight: 3,
  ticketValueCap: 100_000,

  /** penalty = min(upgradePenaltyCap, upgradePenaltyPerUpgrade * groupUpgrades) */
  upgradePenaltyPerUpgrade: 8,
  upgradePenaltyCap: 60,

  modes: {
    /** Rush Hour multiplies the whole wait component (incl. long-wait bonus). */
    rushHourWaitMultiplier: 2.5,
    /** VIP Hour adds this on top of the VIP bonus for VIP members. */
    vipHourExtraBonus: 8,
    /** Fair Queue multiplies the upgrade penalty (and its cap). */
    fairQueuePenaltyMultiplier: 2.5,
  },

  /** Scores are rounded to this many decimals to avoid float noise. */
  scorePrecision: 6,

  /** At most this many entry ids are listed in one connection reason. */
  maxIdsInReason: 5,
  topCandidateCount: 3,
} as const;
