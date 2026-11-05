export type TicketQueueEntry = {
  id: string;
  fanId: string;
  fanName: string;
  ticketValue: string | number | null;
  joinedQueueAt: string;
  eventStartsAt: string;
  status: 'waiting' | 'upgraded' | 'cancelled';
  loyaltyPoints?: number | null;
  upgradesLast30Days?: number | null;
  membership?: 'regular' | 'vip' | 'blocked';
  phoneNumber?: string | null;
  deviceId?: string | null;
  paymentAccount?: string | null;
};

export type RankingOptions = {
  rushHour?: boolean;
  vipHour?: boolean;
  fairQueue?: boolean;
};

export type RankedEntry = {
  entry: TicketQueueEntry;
  score: number;
  /** Human readable explanation. Only populated for winner / top candidates. */
  reasons: string[];
};

export type FanGroup = {
  id: string;
  entries: TicketQueueEntry[];
  representative: RankedEntry | null;
  connectionReasons: string[];
};

export type ExcludedEntry = {
  entry: TicketQueueEntry;
  reason: string;
};

export type FrontRowUpgradeStats = {
  totalEntries: number;
  eligibleEntries: number;
  excludedEntries: number;
  fanGroups: number;
  multiAccountGroups: number;
};

export type FrontRowUpgradeResult = {
  winner: RankedEntry | null;
  /** Top 3 group representatives (winner first). */
  topCandidates: RankedEntry[];
  fanGroups: FanGroup[];
  excludedEntries: ExcludedEntry[];
  stats: FrontRowUpgradeStats;
};
