"use client";

import type { MarketStructureData } from "@/lib/types";

export default function MarketStructurePanel({
  data,
}: {
  data: MarketStructureData | null;
}) {
  if (!data) {
    return (
      <div className="glass-card p-5">
        <h3 className="section-title">Market Structure</h3>
        <p className="mt-3 text-xs text-slate-600">Awaiting candle data…</p>
      </div>
    );
  }

  const biasColor =
    data.bias_score > 0.2
      ? "text-brand"
      : data.bias_score < -0.2
        ? "text-red-400"
        : "text-slate-400";

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="section-title">Market Structure</h3>
        <span className={`text-lg font-bold ${biasColor}`}>
          {data.bias_score > 0 ? "+" : ""}
          {data.bias_score.toFixed(2)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="flex items-center justify-between rounded-lg bg-surface-100 px-3 py-2">
          <span className="text-[10px] text-slate-500">Trend</span>
          <span className="text-xs font-semibold text-slate-200">{data.trend}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-surface-100 px-3 py-2">
          <span className="text-[10px] text-slate-500">Strength</span>
          <span className="text-xs font-semibold text-slate-200">
            {(data.trend_strength * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-surface-100 px-3 py-2">
          <span className="text-[10px] text-slate-500">Volatility</span>
          <span className="text-xs font-semibold text-slate-200">{data.volatility}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-surface-100 px-3 py-2">
          <span className="text-[10px] text-slate-500">ATR</span>
          <span className="text-xs font-semibold text-slate-200">{data.atr.toFixed(1)}</span>
        </div>
      </div>

      {(data.support_levels.length > 0 || data.resistance_levels.length > 0) && (
        <div className="mt-3 space-y-1">
          {data.support_levels.length > 0 && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="badge-green">S</span>
              <span className="text-slate-400">
                {data.support_levels.slice(0, 3).map((s) => s.toFixed(1)).join(" · ")}
              </span>
            </div>
          )}
          {data.resistance_levels.length > 0 && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="badge-red">R</span>
              <span className="text-slate-400">
                {data.resistance_levels.slice(0, 3).map((r) => r.toFixed(1)).join(" · ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
