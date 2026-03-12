"use client";

import type { TradovateFill } from "@/lib/types";

export default function FillsPanel({ fills }: { fills: TradovateFill[] }) {
  const recent = fills.slice(-15).reverse();

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">
        Recent Fills
        {fills.length > 0 && (
          <span className="ml-2 text-slate-500">({fills.length})</span>
        )}
      </h3>
      {recent.length === 0 ? (
        <p className="text-[10px] text-slate-600">No fills yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1.5">Time</th>
                <th className="py-1.5">Side</th>
                <th className="py-1.5">Qty</th>
                <th className="py-1.5">Price</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((f) => (
                <tr
                  key={f.id}
                  className="border-t border-slate-800/50 text-slate-300"
                >
                  <td className="py-1.5 text-slate-500">
                    {new Date(f.timestamp).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="py-1.5">
                    <span
                      className={
                        f.action === "Buy"
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      {f.action}
                    </span>
                  </td>
                  <td className="py-1.5">{f.qty}</td>
                  <td className="py-1.5 font-mono">{f.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
