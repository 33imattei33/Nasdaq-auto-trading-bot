"use client";

import type { SessionPhase } from "@/lib/types";

const PHASE_META: Record<SessionPhase, { label: string; color: string; desc: string }> = {
  ASIAN_CONSOLIDATION: {
    label: "ASIAN — Problem",
    color: "text-slate-400 bg-slate-700/40",
    desc: "Consolidation forming. Do NOT trade.",
  },
  LONDON_INDUCTION: {
    label: "LONDON — Reaction",
    color: "text-amber-300 bg-amber-500/20",
    desc: "Retail trap in progress. Watching for false breakout.",
  },
  NY_REVERSAL: {
    label: "NEW YORK — Solution",
    color: "text-emerald-300 bg-emerald-500/20",
    desc: "Signature trade window. Executing if confirmed.",
  },
  OFF_SESSION: {
    label: "OFF SESSION",
    color: "text-slate-500 bg-slate-800/40",
    desc: "Market closed. Waiting for Asian open.",
  },
};

export default function SessionPhasePanel({
  phase,
  isKillzone,
  tradingPermitted,
}: {
  phase: SessionPhase;
  isKillzone: boolean;
  tradingPermitted: boolean;
}) {
  const meta = PHASE_META[phase] ?? PHASE_META.OFF_SESSION;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Hegelian Phase
        </h3>
        {isKillzone && (
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400 animate-pulse">
            KILL ZONE
          </span>
        )}
      </div>
      <div className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-semibold ${meta.color}`}>
        {meta.label}
      </div>
      <p className="mt-2 text-xs text-slate-500">{meta.desc}</p>
      <div className="mt-2 flex items-center gap-2 text-[10px]">
        <span className={tradingPermitted ? "text-emerald-400" : "text-slate-600"}>
          {tradingPermitted ? "● TRADING PERMITTED" : "○ TRADING PAUSED"}
        </span>
      </div>
    </div>
  );
}
