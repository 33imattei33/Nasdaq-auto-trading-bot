"use client";

import type { InductionState } from "@/lib/types";

const STATE_LABELS: Record<InductionState, { label: string; pct: number }> = {
  NO_PATTERN: { label: "No Pattern", pct: 0 },
  WEDGE_FORMING: { label: "Wedge Forming", pct: 20 },
  TRIANGLE_FORMING: { label: "Triangle Forming", pct: 30 },
  FALSE_BREAKOUT: { label: "False Breakout", pct: 50 },
  STOP_HUNT_ACTIVE: { label: "Stop Hunt Active", pct: 70 },
  EXHAUSTION_DETECTED: { label: "Exhaustion Detected", pct: 85 },
  REVERSAL_CONFIRMED: { label: "REVERSAL CONFIRMED", pct: 100 },
};

export default function InductionMeter({
  state,
  meter,
}: {
  state: InductionState;
  meter: number;
}) {
  const meta = STATE_LABELS[state] ?? STATE_LABELS.NO_PATTERN;
  const pct = Math.max(meta.pct, meter);
  const color =
    pct >= 85
      ? "bg-emerald-500"
      : pct >= 50
        ? "bg-amber-500"
        : "bg-slate-600";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">
        Induction Meter
      </h3>
      <div className="mt-2 text-lg font-bold text-slate-100">{pct.toFixed(0)}%</div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 text-[10px] text-slate-500">{meta.label}</div>
    </div>
  );
}
