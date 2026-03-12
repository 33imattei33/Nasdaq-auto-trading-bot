"use client";

import type { LiquidityZone } from "@/lib/types";

export default function LiquidityPanel({ zones }: { zones: LiquidityZone[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
        Liquidity Zones
      </h3>
      {zones.length === 0 ? (
        <p className="text-[10px] text-slate-600">No zones mapped yet.</p>
      ) : (
        <div className="space-y-1">
          {zones.slice(0, 6).map((z, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded bg-slate-800/50 px-2 py-1 text-[10px]"
            >
              <span
                className={
                  z.zone_type === "buy_side"
                    ? "text-emerald-400"
                    : "text-red-400"
                }
              >
                {z.zone_type === "buy_side" ? "BUY" : "SELL"}
              </span>
              <span className="text-slate-400">
                {z.price_low.toFixed(1)} – {z.price_high.toFixed(1)}
              </span>
              <span className="text-slate-600">
                {(z.strength * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
