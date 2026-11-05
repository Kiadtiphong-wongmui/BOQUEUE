import type { RankedEntry } from "../lib/types";
import { Badge, Card, Empty, entryTone } from "./ui";

export function WinnerCard({ winner }: { winner: RankedEntry | null }) {
  return (
    <Card title="Current winner" subtitle="Next fan to be upgraded to the front row.">
      {winner ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-2xl font-bold" data-testid="winner-name">
                {winner.entry.fanName}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Entry {winner.entry.id} · fan {winner.entry.fanId}{" "}
                {winner.entry.membership === "vip" && <Badge tone={entryTone("vip")}>VIP</Badge>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Score</p>
              <p className="text-3xl font-bold tabular-nums" data-testid="winner-score">
                {winner.score.toFixed(2)}
              </p>
            </div>
          </div>
          <h3 className="mt-4 text-sm font-semibold">Why this fan?</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {winner.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <Empty>
          <strong className="block text-base">No eligible fan</strong>
          Everyone is cancelled, upgraded, blocked, invalid, or the concert has started.
        </Empty>
      )}
    </Card>
  );
}

export function TopCandidates({ candidates }: { candidates: RankedEntry[] }) {
  return (
    <Card title="Top 3 candidates" subtitle="One representative per fan group.">
      {candidates.length === 0 ? (
        <Empty>No candidates.</Empty>
      ) : (
        <ol className="space-y-2">
          {candidates.map((c, i) => (
            <li
              key={c.entry.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60"
            >
              <span className="min-w-0">
                <span className="mr-2 font-semibold">#{i + 1}</span>
                <span className="break-words">{c.entry.fanName}</span>
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{c.entry.id}</span>
              </span>
              <span className="font-semibold tabular-nums">{c.score.toFixed(2)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
