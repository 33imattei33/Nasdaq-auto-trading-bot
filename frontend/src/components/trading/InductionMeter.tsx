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
  const isHot = pct >= 85;
  const isWarm = pct >= 50;

  return (
    <div className={`glass-card p-5 ${isHot ? "animate-glow-pulse" : ""}`}>
      <h3 className="section-title">Induction Meter</h3>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${isHot ? "text-brand" : isWarm ? "text-amber-400" : "text-slate-300"}`}>
          {pct.toFixed(0)}%
        </span>
        <span className="text-xs text-slate-500">{meta.label}</span>
      </div>
      <div className="progress-bar mt-3">
        <div
          className="progress-bar-fill"
          style={{
            width: `${pct}%`,
            background: isHot
              ? "linear-gradient(90deg, #00e68a, #00ff9d)"
              : isWarm
                ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                : "linear-gradient(90deg, #475569, #64748b)",
          }}
        />
      </div>
    </div>
  );
}
