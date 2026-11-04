export type Membership = "regular" | "vip" | "blocked";
export type EntryStatus = "waiting" | "upgraded" | "cancelled";

export type QueueEntry = {
  id: string;
  fanId: string;
  fanName: string;
  ticketValue: string | number | null;
  joinedQueueAt: string;
  eventStartsAt: string;
  status: EntryStatus;
  loyaltyPoints?: number | null;
  upgradesLast30Days?: number | null;
  membership?: Membership;
  phoneNumber?: string | null;
  deviceId?: string | null;
  paymentAccount?: string | null;
};

export type Modes = {
  rushHour: boolean;
  vipHour: boolean;
  fairQueue: boolean;
};

export type RankedEntry = {
  entry: QueueEntry;
  score: number;
  reasons: string[];
};

export type FanGroup = {
  id: string;
  accountCount: number;
  entries: QueueEntry[];
  entriesTruncated: boolean;
  representative: { entryId: string; fanName: string; score: number } | null;
  connectionReasons: string[];
};

export type Paged<T> = {
  total: number;
  limit: number;
  offset: number;
  items: T[];
};

export type RankResponse = {
  now: string;
  modes: Partial<Modes>;
  winner: RankedEntry | null;
  topCandidates: RankedEntry[];
  summary: {
    totalEntries: number;
    eligibleEntries: number;
    excludedEntries: number;
    fanGroups: number;
    multiAccountGroups: number;
    excludedByReason: Record<string, number>;
  };
  fanGroups: Paged<FanGroup>;
  excludedEntries: Paged<{ entry: QueueEntry; reason: string }>;
};

export type EntriesResponse = Paged<QueueEntry>;
