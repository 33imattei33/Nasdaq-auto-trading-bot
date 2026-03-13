"use client";

import type { SessionPhase } from "@/lib/types";

const PHASE_META: Record<SessionPhase, { label: string; color: string; icon: string; desc: string }> = {
  ASIAN_CONSOLIDATION: {
    label: "ASIAN — Problem",
    color: "text-slate-400 bg-surface-300",
    icon: "🌙",
    desc: "Consolidation forming. Do NOT trade.",
  },
  LONDON_INDUCTION: {
    label: "LONDON — Reaction",
    color: "text-amber-400 bg-amber-500/15",
    icon: "⚡",
    desc: "Retail trap in progress. Watching for false breakout.",
  },
  NY_REVERSAL: {
    label: "NEW YORK — Solution",
    color: "text-brand bg-brand/15",
    icon: "🎯",
    desc: "Signature trade window. Executing if confirmed.",
  },
  OFF_SESSION: {
    label: "OFF SESSION",
    color: "text-slate-600 bg-surface-200",
    icon: "⏸",
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
    <div className="glass-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="section-title">Hegelian Phase</h3>
        {isKillzone && (
          <span className="badge-red animate-pulse">KILL ZONE</span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-lg">{meta.icon}</span>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${meta.color}`}>
          {meta.label}
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{meta.desc}</p>
      <div className="divider mt-3" />
      <div className="mt-3 flex items-center gap-2 text-xs">
        {tradingPermitted ? (
          <span className="flex items-center gap-1.5 text-brand">
            <span className="pulse-dot" /> TRADING PERMITTED
          </span>
        ) : (
          <span className="text-slate-600">○ TRADING PAUSED</span>
        )}
      </div>
    </div>
  );
}
