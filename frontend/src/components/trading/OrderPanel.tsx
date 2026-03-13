"use client";

import { useState } from "react";

export default function OrderPanel({
  isLive,
  orderStatus,
  onMarket,
  onBracket,
}: {
  isLive: boolean;
  orderStatus: string | null;
  onMarket: (action: "Buy" | "Sell", qty: number) => void;
  onBracket: (
    action: "Buy" | "Sell",
    qty: number,
    profitTicks: number,
    stopTicks: number,
  ) => void;
}) {
  const [qty, setQty] = useState(1);
  const [tp, setTp] = useState(80);
  const [sl, setSl] = useState(40);
  const [mode, setMode] = useState<"market" | "bracket">("bracket");

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">
        Order Entry
        {!isLive && (
          <span className="ml-2 rounded bg-slate-600/30 px-1.5 py-0.5 text-slate-500">
            PAPER
          </span>
        )}
      </h3>

      {/* Mode tabs */}
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-800/60 p-0.5">
        {(["market", "bracket"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
              mode === m
                ? "bg-slate-700 text-slate-100"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Qty */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
        <label className="flex items-center gap-1.5 text-slate-400">
          Qty
          <input
            type="number"
            min={1}
            max={100}
            value={qty}
            onChange={(e) => setQty(Math.max(1, +e.target.value))}
            className="w-16 rounded bg-slate-800 px-2 py-1 text-slate-200 outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </label>
        {mode === "bracket" && (
          <>
            <label className="flex items-center gap-1.5 text-slate-400">
              TP
              <input
                type="number"
                min={1}
                value={tp}
                onChange={(e) => setTp(Math.max(1, +e.target.value))}
                className="w-16 rounded bg-slate-800 px-2 py-1 text-slate-200 outline-none focus:ring-1 focus:ring-amber-500/50"
              />
              <span className="text-slate-600">ticks</span>
            </label>
            <label className="flex items-center gap-1.5 text-slate-400">
              SL
              <input
                type="number"
                min={1}
                value={sl}
                onChange={(e) => setSl(Math.max(1, +e.target.value))}
                className="w-16 rounded bg-slate-800 px-2 py-1 text-slate-200 outline-none focus:ring-1 focus:ring-amber-500/50"
              />
              <span className="text-slate-600">ticks</span>
            </label>
          </>
        )}
      </div>

      {/* Buy / Sell buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={!isLive}
          onClick={() =>
            mode === "market"
              ? onMarket("Buy", qty)
              : onBracket("Buy", qty, tp, sl)
          }
          className="rounded-lg bg-emerald-600/80 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          BUY {qty}
        </button>
        <button
          disabled={!isLive}
          onClick={() =>
            mode === "market"
              ? onMarket("Sell", qty)
              : onBracket("Sell", qty, tp, sl)
          }
          className="rounded-lg bg-red-600/80 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          SELL {qty}
        </button>
      </div>

      {/* Order status */}
      {orderStatus && (
        <p className="mt-3 text-center text-xs font-medium text-amber-400">
          {orderStatus}
        </p>
      )}
    </div>
  );
}
