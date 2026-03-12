"use client";

import type { HealthInfo, LiveQuote } from "@/lib/types";

const modeColor: Record<string, string> = {
  LIVE: "text-red-400 bg-red-500/20 border-red-500/30",
  DEMO: "text-amber-300 bg-amber-500/20 border-amber-500/30",
  paper: "text-slate-400 bg-slate-500/20 border-slate-500/30",
};

export default function ConnectionStatus({
  health,
  quote,
}: {
  health: HealthInfo | null;
  quote: LiveQuote | null;
}) {
  if (!health) return null;

  const mode = health.mode ?? "paper";
  const cls = modeColor[mode] ?? modeColor.paper;
  const isLive = health.broker === "tradovate";

  return (
    <div
      className={`flex items-center gap-4 rounded-lg border px-3 py-2 text-xs ${cls}`}
    >
      {/* Connection dot */}
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            isLive && health.token_valid
              ? "bg-emerald-400 animate-pulse"
              : isLive
                ? "bg-amber-400"
                : "bg-slate-500"
          }`}
        />
        <span className="font-semibold uppercase tracking-wider">
          {isLive ? "TRADOVATE" : "PAPER"} {mode}
        </span>
      </div>

      {/* Account */}
      {health.account_spec && (
        <span className="text-slate-400">
          Acct: <span className="text-slate-200">{health.account_spec}</span>
        </span>
      )}

      {/* Contract */}
      {health.front_month && (
        <span className="text-slate-400">
          Contract:{" "}
          <span className="text-slate-200">{health.front_month}</span>
        </span>
      )}

      {/* Live quote */}
      {quote && quote.last > 0 && (
        <span className="text-slate-400">
          Last:{" "}
          <span className="font-mono text-slate-100">
            {quote.last.toFixed(2)}
          </span>
          <span className="ml-1 text-slate-500">
            (B:{quote.bid.toFixed(2)} / A:{quote.ask.toFixed(2)})
          </span>
        </span>
      )}

      {/* WS streams */}
      {isLive && (
        <span className="ml-auto text-slate-500">
          WS:{health.ws_streams ?? 0} | Candles:{health.candle_count ?? 0} |
          Up:{Math.floor((health.uptime_seconds ?? 0) / 60)}m
        </span>
      )}
    </div>
  );
}
