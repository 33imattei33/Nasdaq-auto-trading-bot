"use client";

import type { TradeRecord } from "@/lib/types";

export default function TradeHistory({ trades }: { trades: TradeRecord[] }) {
  return (
    <div className="glass-card p-5">
      <h3 className="section-title mb-4">Trade History</h3>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>ID</th>
              <th>Side</th>
              <th>Entry</th>
              <th>SL</th>
              <th>TP</th>
              <th>Lots</th>
              <th>P&L</th>
              <th>Status</th>
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
                    ? "text-brand"
                    : t.pnl < 0
                      ? "text-red-400"
                      : "text-slate-400";
                return (
                  <tr key={t.trade_id}>
                    <td>
                      {new Date(t.opened_at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="font-mono text-[10px] text-slate-500">{t.trade_id}</td>
                    <td>
                      <span className={t.direction === "BUY" ? "text-brand" : "text-red-400"}>
                        {t.direction}
                      </span>
                    </td>
                    <td className="font-mono">{t.entry_price.toFixed(2)}</td>
                    <td className="font-mono">{t.stop_loss.toFixed(2)}</td>
                    <td className="font-mono">
                      {t.take_profit ? t.take_profit.toFixed(2) : "—"}
                    </td>
                    <td>{t.lot_size.toFixed(2)}</td>
                    <td className={`font-bold ${pnlColor}`}>
                      {t.pnl >= 0 ? "+" : ""}
                      {t.pnl.toFixed(2)}
                    </td>
                    <td>
                      <span className={`text-[10px] font-medium ${
                        t.status === "open" ? "text-brand" : "text-slate-500"
                      }`}>
                        {t.status}
                      </span>
                    </td>
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
