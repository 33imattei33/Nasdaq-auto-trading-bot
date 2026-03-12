"use client";

import type { WeeklyAct } from "@/lib/types";

const ACTS: { act: WeeklyAct; label: string; day: string }[] = [
  { act: "CONNECTOR", label: "Connector", day: "Sun/Mon" },
  { act: "ACCUMULATION", label: "Accumulation", day: "Tue" },
  { act: "REVERSAL", label: "Reversal", day: "Wed" },
  { act: "DISTRIBUTION", label: "Distribution", day: "Thu" },
  { act: "EPILOGUE", label: "Epilogue", day: "Fri" },
];

export default function WeeklyActDisplay({ currentAct }: { currentAct: WeeklyAct }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">
        Weekly 5-Act Structure
      </h3>
      <div className="flex gap-1">
        {ACTS.map(({ act, label, day }) => {
          const active = act === currentAct;
          return (
            <div
              key={act}
              className={`flex-1 rounded-lg px-2 py-2 text-center transition-colors ${
                active
                  ? "bg-amber-500/20 border border-amber-500/50"
                  : "bg-slate-800/50 border border-slate-800"
              }`}
            >
              <div
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  active ? "text-amber-300" : "text-slate-600"
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
