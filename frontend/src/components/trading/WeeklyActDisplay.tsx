"use client";

import type { WeeklyAct } from "@/lib/types";

const ACTS: { act: WeeklyAct; label: string; day: string; icon: string }[] = [
  { act: "CONNECTOR", label: "Connector", day: "Sun/Mon", icon: "🔗" },
  { act: "ACCUMULATION", label: "Accumulation", day: "Tue", icon: "📦" },
  { act: "REVERSAL", label: "Reversal", day: "Wed", icon: "🔄" },
  { act: "DISTRIBUTION", label: "Distribution", day: "Thu", icon: "📤" },
  { act: "EPILOGUE", label: "Epilogue", day: "Fri", icon: "🏁" },
];

export default function WeeklyActDisplay({ currentAct }: { currentAct: WeeklyAct }) {
  return (
    <div className="glass-card p-5">
      <h3 className="section-title mb-4">Weekly 5-Act Structure</h3>
      <div className="flex gap-2">
        {ACTS.map(({ act, label, day, icon }, idx) => {
          const active = act === currentAct;
          const past = ACTS.findIndex((a) => a.act === currentAct) > idx;
          return (
            <div
              key={act}
              className={`flex-1 rounded-xl px-2 py-3 text-center transition-all duration-300 ${
                active
                  ? "glass-card-active bg-brand/10"
                  : past
                    ? "bg-surface-200 border border-white/[0.04]"
                    : "bg-surface-100 border border-white/[0.04]"
              }`}
            >
              <div className="text-base">{icon}</div>
              <div
                className={`mt-1 text-[11px] font-bold uppercase tracking-wider ${
                  active ? "text-brand" : past ? "text-slate-400" : "text-slate-600"
                }`}
              >
                {label}
              </div>
              <div className="mt-0.5 text-[9px] text-slate-500">{day}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
