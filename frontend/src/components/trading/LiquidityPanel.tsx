"use client";

import type { LiquidityZone } from "@/lib/types";

export default function LiquidityPanel({ zones }: { zones: LiquidityZone[] }) {
  return (
    <div className="glass-card p-5">
      <h3 className="section-title mb-3">Liquidity Zones</h3>
      {zones.length === 0 ? (
        <p className="text-xs text-slate-600">No zones mapped yet.</p>
      ) : (
        <div className="space-y-2">
          {zones.slice(0, 6).map((z, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-surface-100 px-3 py-2 transition hover:bg-surface-200"
            >
              <span
                className={
                  z.zone_type === "buy_side"
                    ? "badge-green"
                    : "badge-red"
                }
              >
                {z.zone_type === "buy_side" ? "BUY" : "SELL"}
              </span>
              <span className="text-xs font-mono text-slate-300">
                {z.price_low.toFixed(1)} – {z.price_high.toFixed(1)}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {(z.strength * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
