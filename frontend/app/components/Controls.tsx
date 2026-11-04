import type { Modes } from "../lib/types";
import { Card } from "./ui";

const STEPS = [
  { label: "+5 min", minutes: 5 },
  { label: "+15 min", minutes: 15 },
  { label: "+1 hour", minutes: 60 },
];

export function TimeControls({
  simulatedNow,
  offsetMinutes,
  onAdvance,
  onReset,
}: {
  simulatedNow: Date | null;
  offsetMinutes: number;
  onAdvance: (minutes: number) => void;
  onReset: () => void;
}) {
  return (
    <Card title="Simulated time" subtitle="Move the clock forward to see how the ranking changes.">
      <p className="text-lg font-semibold tabular-nums" data-testid="simulated-time">
        {simulatedNow ? simulatedNow.toLocaleString() : "—"}
      </p>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        {offsetMinutes === 0 ? "Real time" : `Real time + ${offsetMinutes} min`}
      </p>
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <button
            key={s.label}
            onClick={() => onAdvance(s.minutes)}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={onReset}
          disabled={offsetMinutes === 0}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-700"
        >
          Reset
        </button>
      </div>
    </Card>
  );
}

const MODE_INFO: Array<{ key: keyof Modes; label: string; help: string }> = [
  {
    key: "rushHour",
    label: "Rush Hour",
    help: "Waiting time counts 2.5x. People who queued the longest are favoured.",
  },
  {
    key: "vipHour",
    label: "VIP Hour",
    help: "VIP members get an extra +8 bonus on top of the normal VIP bonus.",
  },
  {
    key: "fairQueue",
    label: "Fair Queue",
    help: "Recent upgrades are penalised 2.5x harder, so people who have not won lately go first.",
  },
];

export function ModeToggles({
  modes,
  onToggle,
}: {
  modes: Modes;
  onToggle: (key: keyof Modes) => void;
}) {
  return (
    <Card title="Modes" subtitle="Can be combined.">
      <ul className="space-y-3">
        {MODE_INFO.map((m) => (
          <li key={m.key}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={modes[m.key]}
                onChange={() => onToggle(m.key)}
              />
              <span>
                <span className="block text-sm font-medium">{m.label}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">{m.help}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
}
