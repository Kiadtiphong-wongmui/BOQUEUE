import type { FanGroup, Paged, QueueEntry } from "../lib/types";
import { Badge, Card, Empty, Pager } from "./ui";

export function FanGroupsList({
  groups,
  showSingles,
  onShowSingles,
  onPage,
  multiAccountCount,
}: {
  groups: Paged<FanGroup>;
  showSingles: boolean;
  onShowSingles: (value: boolean) => void;
  onPage: (offset: number) => void;
  multiAccountCount: number;
}) {
  return (
    <Card
      title="Fan groups"
      subtitle={`${multiAccountCount.toLocaleString()} group(s) with more than one linked account.`}
      action={
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showSingles}
            onChange={(e) => onShowSingles(e.target.checked)}
          />
          Include single-account groups
        </label>
      }
    >
      {groups.items.length === 0 ? (
        <Empty>No groups to show.</Empty>
      ) : (
        <ul className="space-y-3">
          {groups.items.map((g) => (
            <li key={g.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {g.accountCount} account{g.accountCount === 1 ? "" : "s"}
                </span>
                {g.representative && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Representative: <strong>{g.representative.fanName}</strong> (
                    {g.representative.score.toFixed(2)})
                  </span>
                )}
              </div>
              {g.connectionReasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                  {g.connectionReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 break-words text-xs text-zinc-500 dark:text-zinc-400">
                {g.entries.map((e) => e.fanName).join(", ")}
                {g.entriesTruncated && " …"}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager total={groups.total} limit={groups.limit} offset={groups.offset} onChange={onPage} />
    </Card>
  );
}

export function ExcludedList({
  excluded,
  byReason,
  reason,
  onReason,
  onPage,
}: {
  excluded: Paged<{ entry: QueueEntry; reason: string }>;
  byReason: Record<string, number>;
  reason: string | null;
  onReason: (reason: string | null) => void;
  onPage: (offset: number) => void;
}) {
  const reasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
  return (
    <Card
      title="Excluded entries"
      subtitle="Not eligible for the upgrade right now."
      action={
        <select
          aria-label="Filter by reason"
          className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
          value={reason ?? ""}
          onChange={(e) => onReason(e.target.value || null)}
        >
          <option value="">All reasons</option>
          {reasons.map(([r, n]) => (
            <option key={r} value={r}>
              {r} ({n.toLocaleString()})
            </option>
          ))}
        </select>
      }
    >
      {excluded.items.length === 0 ? (
        <Empty>Nothing excluded.</Empty>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {excluded.items.map((x) => (
            <li key={x.entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 break-words">
                {x.entry.fanName}
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{x.entry.id}</span>
              </span>
              <Badge tone="red">{x.reason}</Badge>
            </li>
          ))}
        </ul>
      )}
      <Pager total={excluded.total} limit={excluded.limit} offset={excluded.offset} onChange={onPage} />
    </Card>
  );
}
