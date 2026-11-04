"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { fetchEntries, fetchRank, updateLoyaltyPoints, type RankParams } from "../lib/api";
import type { EntriesResponse, Modes, RankResponse } from "../lib/types";
import { EntriesTable } from "./EntriesTable";
import { ModeToggles, TimeControls } from "./Controls";
import { ExcludedList, FanGroupsList } from "./Lists";
import { TopCandidates, WinnerCard } from "./Winner";

const PAGE = 10;
const ENTRIES_PAGE = 15;

type Loaded<T> = { key: string; data: T | null; error: string | null };

const subscribeNoop = () => () => {};

// Clock base for the simulated time. Server snapshot is 0 so nothing reads the
// clock while prerendering; the client captures Date.now() once, lazily.
let clientBaseMs: number | null = null;
const getClientBase = () => (clientBaseMs ??= Date.now());
const getServerBase = () => 0;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error";
}

export function QueueDashboard() {
  const baseMs = useSyncExternalStore(subscribeNoop, getClientBase, getServerBase);
  const mounted = baseMs !== 0;
  const [offsetMinutes, setOffsetMinutes] = useState(0);
  const [modes, setModes] = useState<Modes>({ rushHour: false, vipHour: false, fairQueue: false });
  const [showSingles, setShowSingles] = useState(false);
  const [groupOffset, setGroupOffset] = useState(0);
  const [excludedOffset, setExcludedOffset] = useState(0);
  const [excludedReason, setExcludedReason] = useState<string | null>(null);
  const [entriesOffset, setEntriesOffset] = useState(0);
  const [version, setVersion] = useState(0); // bump to force a refetch

  const simulatedNow = useMemo(() => new Date(baseMs + offsetMinutes * 60_000), [baseMs, offsetMinutes]);

  const rankParams = useMemo<RankParams>(
    () => ({
      now: simulatedNow.toISOString(),
      modes,
      groupOffset,
      groupLimit: PAGE,
      includeSingleAccountGroups: showSingles,
      excludedOffset,
      excludedLimit: PAGE,
      excludedReason,
    }),
    [simulatedNow, modes, groupOffset, showSingles, excludedOffset, excludedReason],
  );
  const rankKey = `${version}|${JSON.stringify(rankParams)}`;
  const entriesKey = `${version}|${entriesOffset}`;

  const [rank, setRank] = useState<Loaded<RankResponse>>({ key: "", data: null, error: null });
  const [entries, setEntries] = useState<Loaded<EntriesResponse>>({ key: "", data: null, error: null });

  useEffect(() => {
    if (!mounted) return;
    const ctrl = new AbortController();
    fetchRank(rankParams, ctrl.signal)
      .then((data) => setRank({ key: rankKey, data, error: null }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setRank({ key: rankKey, data: null, error: describeError(err) });
      });
    return () => ctrl.abort();
  }, [mounted, rankParams, rankKey]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchEntries(ENTRIES_PAGE, entriesOffset, ctrl.signal)
      .then((data) => setEntries({ key: entriesKey, data, error: null }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setEntries({ key: entriesKey, data: null, error: describeError(err) });
      });
    return () => ctrl.abort();
  }, [entriesOffset, entriesKey]);

  const saveLoyalty = useCallback(async (id: string, value: number) => {
    await updateLoyaltyPoints(id, value);
    setVersion((v) => v + 1); // re-rank + reload entries
  }, []);

  const rankLoading = rank.key !== rankKey;
  const error = (!rankLoading && rank.error) || (entries.key === entriesKey && entries.error) || null;
  const data = rank.data;

  const resetPaging = () => {
    setGroupOffset(0);
    setExcludedOffset(0);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Front Row Upgrade Queue</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Picks the next fan to move to the front row. Linked accounts count as one fan, so creating
          several accounts never earns more than one upgrade per round.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <span>{error}</span>
          <button
            onClick={() => setVersion((v) => v + 1)}
            className="rounded-lg border border-red-400 px-3 py-1.5 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <TimeControls
          simulatedNow={mounted ? simulatedNow : null}
          offsetMinutes={offsetMinutes}
          onAdvance={(m) => {
            setOffsetMinutes((o) => o + m);
            resetPaging();
          }}
          onReset={() => {
            setOffsetMinutes(0);
            resetPaging();
          }}
        />
        <ModeToggles
          modes={modes}
          onToggle={(key) => {
            setModes((m) => ({ ...m, [key]: !m[key] }));
            resetPaging();
          }}
        />
      </div>

      <div
        className={`mt-4 space-y-4 transition-opacity ${rankLoading && data ? "opacity-60" : ""}`}
        aria-busy={rankLoading}
      >
        {rankLoading && !data && !error && (
          <p className="rounded-lg border border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
            Loading ranking…
          </p>
        )}
        {data && (
          <>
            {rankLoading && <p className="text-xs text-zinc-500">Updating…</p>}
            <WinnerCard winner={data.winner} />
            <TopCandidates candidates={data.topCandidates} />
            <FanGroupsList
              groups={data.fanGroups}
              showSingles={showSingles}
              multiAccountCount={data.summary.multiAccountGroups}
              onShowSingles={(v) => {
                setShowSingles(v);
                setGroupOffset(0);
              }}
              onPage={setGroupOffset}
            />
            <ExcludedList
              excluded={data.excludedEntries}
              byReason={data.summary.excludedByReason}
              reason={excludedReason}
              onReason={(r) => {
                setExcludedReason(r);
                setExcludedOffset(0);
              }}
              onPage={setExcludedOffset}
            />
          </>
        )}

        {entries.key !== entriesKey && !entries.data ? (
          <p className="rounded-lg border border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
            Loading entries…
          </p>
        ) : (
          entries.data && (
            <EntriesTable entries={entries.data} onSaveLoyalty={saveLoyalty} onPage={setEntriesOffset} />
          )
        )}
      </div>
    </div>
  );
}
