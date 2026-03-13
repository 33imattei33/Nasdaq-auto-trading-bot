"use client";

import type { TradovatePosition } from "@/lib/types";

export default function PositionsPanel({
  positions,
  lastPrice,
  onLiquidate,
}: {
  positions: TradovatePosition[];
  lastPrice: number;
  onLiquidate: (contractId: number) => void;
}) {
  const activePositions = positions.filter((p) => p.netPos !== 0);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">Open Positions</h3>
        {activePositions.length > 0 && (
          <span className="badge-green">{activePositions.length}</span>
        )}
      </div>

      {activePositions.length === 0 ? (
        <p className="text-xs text-slate-600">No open positions.</p>
      ) : (
        <div className="space-y-2">
          {activePositions.map((p) => {
            const isLong = p.netPos > 0;
            const qty = Math.abs(p.netPos);
            const unrealizedPnl =
              lastPrice > 0
                ? (lastPrice - p.netPrice) * p.netPos * 2
                : 0;
            const pnlColor =
              unrealizedPnl > 0
                ? "text-brand"
                : unrealizedPnl < 0
                  ? "text-red-400"
                  : "text-slate-400";

            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-surface-100 px-4 py-3 transition hover:bg-surface-200"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase ${
                      isLong
                        ? "bg-brand/15 text-brand"
                        : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {isLong ? "LONG" : "SHORT"} {qty}
                  </span>

                  <div className="text-xs text-slate-400">
                    Entry{" "}
                    <span className="font-mono font-semibold text-slate-200">{p.netPrice.toFixed(2)}</span>
                  </div>

                  <div className={`text-sm font-bold ${pnlColor}`}>
                    {unrealizedPnl >= 0 ? "+" : ""}
                    ${unrealizedPnl.toFixed(2)}
                  </div>
                </div>

                <button
                  onClick={() => onLiquidate(p.contractId)}
                  className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1 text-[10px] font-bold text-red-400 transition hover:bg-red-500/20"
                >
                  Close
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
