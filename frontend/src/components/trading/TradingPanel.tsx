"use client";

import { Card, CardTitle, CardValue } from "@/components/ui/card";
import type { TradingPanelData } from "@/lib/types";

function phaseTone(phase: TradingPanelData["phase"]) {
  if (phase === "NY_REVERSAL") return "bg-emerald-500/20 text-emerald-300";
  if (phase === "LONDON_INDUCTION") return "bg-amber-500/20 text-amber-300";
  return "bg-slate-700/40 text-slate-300";
}

export default function TradingPanel({ data }: { data: TradingPanelData }) {
  return (
    <main className="mx-auto min-h-screen max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">NAS100 Smart Money Panel</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${phaseTone(data.phase)}`}>
          {data.phase.replaceAll("_", " ")}
        </span>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardTitle>Symbol</CardTitle>
          <CardValue>{data.symbol}</CardValue>
        </Card>
        <Card>
          <CardTitle>Live Price</CardTitle>
          <CardValue>{data.price.toFixed(2)}</CardValue>
        </Card>
        <Card>
          <CardTitle>Account Equity</CardTitle>
          <CardValue>${data.equity.toFixed(2)}</CardValue>
        </Card>
        <Card>
          <CardTitle>Active Risk</CardTitle>
          <CardValue>{data.activeRiskPercent.toFixed(2)}%</CardValue>
        </Card>
      </section>

      <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-300">Trade History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2">Time</th>
                <th className="py-2">ID</th>
                <th className="py-2">Side</th>
                <th className="py-2">Entry</th>
                <th className="py-2">Stop Loss</th>
                <th className="py-2">Lot</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.tradeHistory.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={7}>
                    No trade executed in current 24h cycle.
                  </td>
                </tr>
              ) : (
                data.tradeHistory.map((trade) => (
                  <tr key={trade.id} className="border-t border-slate-800 text-slate-200">
                    <td className="py-2">{trade.time}</td>
                    <td className="py-2">{trade.id}</td>
                    <td className="py-2">{trade.side}</td>
                    <td className="py-2">{trade.entry.toFixed(2)}</td>
                    <td className="py-2">{trade.stopLoss.toFixed(2)}</td>
                    <td className="py-2">{trade.lot.toFixed(2)}</td>
                    <td className="py-2">{trade.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
