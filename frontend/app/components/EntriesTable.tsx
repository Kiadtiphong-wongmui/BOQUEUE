"use client";

import { useState } from "react";
import type { EntriesResponse, QueueEntry } from "../lib/types";
import { Badge, Card, Empty, Pager, entryTone } from "./ui";

function LoyaltyCell({
  entry,
  onSave,
}: {
  entry: QueueEntry;
  onSave: (id: string, value: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft(String(entry.loyaltyPoints ?? 0));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const value = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(value) || value < 0) {
      setError("Whole number ≥ 0");
      return;
    }
    setSaving(true);
    try {
      await onSave(entry.id, value);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={start}
        className="rounded px-2 py-1 text-left tabular-nums underline decoration-dotted hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label={`Edit loyalty points for ${entry.fanName}`}
      >
        {entry.loyaltyPoints ?? 0}
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input
        autoFocus
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label={`Loyalty points for ${entry.fanName}`}
        className="w-24 rounded border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
      />
      <button
        onClick={() => void save()}
        disabled={saving}
        className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={() => setEditing(false)} className="rounded px-2 py-1 text-xs">
        Cancel
      </button>
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function EntriesTable({
  entries,
  onSaveLoyalty,
  onPage,
}: {
  entries: EntriesResponse;
  onSaveLoyalty: (id: string, value: number) => Promise<void>;
  onPage: (offset: number) => void;
}) {
  return (
    <Card
      title="Queue entries"
      subtitle="Click a loyalty value to edit it. The ranking refreshes automatically."
    >
      {entries.items.length === 0 ? (
        <Empty>The queue is empty. Run the seed script to add sample data.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-2 pr-3">Fan</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Joined</th>
                <th className="py-2 pr-3">Upgrades 30d</th>
                <th className="py-2">Loyalty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {entries.items.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3">
                    {e.fanName}
                    <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{e.id}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={entryTone(e.membership, e.status)}>
                      {e.status}
                      {e.membership && e.membership !== "regular" ? ` · ${e.membership}` : ""}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                    {Number.isNaN(Date.parse(e.joinedQueueAt))
                      ? e.joinedQueueAt
                      : new Date(e.joinedQueueAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{e.upgradesLast30Days ?? 0}</td>
                  <td className="py-2">
                    <LoyaltyCell entry={e} onSave={onSaveLoyalty} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager total={entries.total} limit={entries.limit} offset={entries.offset} onChange={onPage} />
    </Card>
  );
}
