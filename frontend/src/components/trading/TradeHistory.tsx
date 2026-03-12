"use client";

import type { TradeRecord } from "@/lib/types";

export default function TradeHistory({ trades }: { trades: TradeRecord[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">
        Trade History
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1.5">Time</th>
              <th className="py-1.5">ID</th>
              <th className="py-1.5">Side</th>
              <th className="py-1.5">Entry</th>
              <th className="py-1.5">SL</th>
              <th className="py-1.5">TP</th>
              <th className="py-1.5">Lots</th>
              <th className="py-1.5">P&L</th>
              <th className="py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td className="py-4 text-slate-600" colSpan={9}>
                  No trades executed in current cycle.
                </td>
              </tr>
            ) : (
              trades.map((t) => {
                const pnlColor =
                  t.pnl > 0
                    ? "text-emerald-400"
                    : t.pnl < 0
                      ? "text-red-400"
                      : "text-slate-400";
                return (
                  <tr
                    key={t.trade_id}
                    className="border-t border-slate-800/50 text-slate-300"
                  >
                    <td className="py-1.5">
                      {new Date(t.opened_at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-1.5 font-mono text-[10px]">{t.trade_id}</td>
                    <td className="py-1.5">{t.direction}</td>
                    <td className="py-1.5">{t.entry_price.toFixed(2)}</td>
                    <td className="py-1.5">{t.stop_loss.toFixed(2)}</td>
                    <td className="py-1.5">
                      {t.take_profit ? t.take_profit.toFixed(2) : "—"}
                    </td>
                    <td className="py-1.5">{t.lot_size.toFixed(2)}</td>
                    <td className={`py-1.5 font-medium ${pnlColor}`}>
                      {t.pnl >= 0 ? "+" : ""}
                      {t.pnl.toFixed(2)}
                    </td>
                    <td className="py-1.5">{t.status}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
