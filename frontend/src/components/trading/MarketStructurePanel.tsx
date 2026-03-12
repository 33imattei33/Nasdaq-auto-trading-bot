"use client";

import type { MarketStructureData } from "@/lib/types";

export default function MarketStructurePanel({
  data,
}: {
  data: MarketStructureData | null;
}) {
  if (!data) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Market Structure
        </h3>
        <p className="mt-2 text-xs text-slate-600">Awaiting candle data…</p>
      </div>
    );
  }

  const biasColor =
    data.bias_score > 0.2
      ? "text-emerald-400"
      : data.bias_score < -0.2
        ? "text-red-400"
        : "text-slate-400";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Market Structure
        </h3>
        <span className={`text-sm font-bold ${biasColor}`}>
          {data.bias_score > 0 ? "+" : ""}
          {data.bias_score.toFixed(2)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-[10px]">
        <div>
          <span className="text-slate-500">Trend:</span>{" "}
          <span className="text-slate-300">{data.trend}</span>
        </div>
        <div>
          <span className="text-slate-500">Strength:</span>{" "}
          <span className="text-slate-300">
            {(data.trend_strength * 100).toFixed(0)}%
          </span>
        </div>
        <div>
          <span className="text-slate-500">Volatility:</span>{" "}
          <span className="text-slate-300">{data.volatility}</span>
        </div>
        <div>
          <span className="text-slate-500">ATR:</span>{" "}
          <span className="text-slate-300">{data.atr.toFixed(1)}</span>
        </div>
      </div>

      {data.support_levels.length > 0 && (
        <div className="mt-2 text-[10px]">
          <span className="text-emerald-500">S: </span>
          <span className="text-slate-400">
            {data.support_levels.slice(0, 3).map((s) => s.toFixed(1)).join(", ")}
          </span>
        </div>
      )}
      {data.resistance_levels.length > 0 && (
        <div className="text-[10px]">
          <span className="text-red-500">R: </span>
          <span className="text-slate-400">
            {data.resistance_levels.slice(0, 3).map((r) => r.toFixed(1)).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}
