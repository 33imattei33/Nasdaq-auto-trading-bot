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
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">
        Open Positions
        {activePositions.length > 0 && (
          <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
            {activePositions.length}
          </span>
        )}
      </h3>

      {activePositions.length === 0 ? (
        <p className="text-[10px] text-slate-600">No open positions.</p>
      ) : (
        <div className="space-y-2">
          {activePositions.map((p) => {
            const isLong = p.netPos > 0;
            const qty = Math.abs(p.netPos);
            const unrealizedPnl =
              lastPrice > 0
                ? (lastPrice - p.netPrice) * p.netPos * 2 // MNQ = $2/pt
                : 0;
            const pnlColor =
              unrealizedPnl > 0
                ? "text-emerald-400"
                : unrealizedPnl < 0
                  ? "text-red-400"
                  : "text-slate-400";

            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  {/* Direction badge */}
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                      isLong
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {isLong ? "LONG" : "SHORT"} {qty}
                  </span>

                  {/* Entry price */}
                  <div className="text-xs text-slate-300">
                    Entry:{" "}
                    <span className="font-mono">{p.netPrice.toFixed(2)}</span>
                  </div>

                  {/* Unrealized P&L */}
                  <div className={`text-xs font-semibold ${pnlColor}`}>
                    {unrealizedPnl >= 0 ? "+" : ""}
                    ${unrealizedPnl.toFixed(2)}
                  </div>
                </div>

                {/* Liquidate button */}
                <button
                  onClick={() => onLiquidate(p.contractId)}
                  className="rounded bg-red-500/20 px-2 py-1 text-[10px] font-medium text-red-300 transition hover:bg-red-500/40"
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
