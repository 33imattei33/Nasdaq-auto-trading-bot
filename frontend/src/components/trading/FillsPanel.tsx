"use client";

import type { TradovateFill } from "@/lib/types";

export default function FillsPanel({ fills }: { fills: TradovateFill[] }) {
  const recent = fills.slice(-15).reverse();

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">Recent Fills</h3>
        {fills.length > 0 && (
          <span className="text-xs text-slate-500">({fills.length})</span>
        )}
      </div>
      {recent.length === 0 ? (
        <p className="text-xs text-slate-600">No fills yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((f) => (
                <tr key={f.id}>
                  <td className="text-slate-500">
                    {new Date(f.timestamp).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td>
                    <span
                      className={
                        f.action === "Buy"
                          ? "text-brand font-semibold"
                          : "text-red-400 font-semibold"
                      }
                    >
                      {f.action}
                    </span>
                  </td>
                  <td>{f.qty}</td>
                  <td className="font-mono">{f.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
