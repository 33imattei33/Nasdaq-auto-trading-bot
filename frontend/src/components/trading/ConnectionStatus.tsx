"use client";

import type { HealthInfo, LiveQuote } from "@/lib/types";

export default function ConnectionStatus({
  health,
  quote,
}: {
  health: HealthInfo | null;
  quote: LiveQuote | null;
}) {
  if (!health) return null;

  const mode = health.mode ?? "paper";
  const isLive = health.broker === "tradovate";
  const connected = isLive && health.token_valid;

  return (
    <div className="flex items-center gap-4 text-xs">
      {/* Status pill */}
      <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
        connected
          ? "bg-brand/10 text-brand"
          : isLive
            ? "bg-amber-500/10 text-amber-400"
            : "bg-surface-200 text-slate-500"
      }`}>
        <span className={`inline-block h-2 w-2 rounded-full ${
          connected
            ? "bg-brand animate-pulse"
            : isLive
              ? "bg-amber-400"
              : "bg-slate-500"
        }`} />
        <span className="font-semibold uppercase tracking-wider">
          {isLive ? "TRADOVATE" : "PAPER"}
        </span>
        <span className="text-slate-500">{mode}</span>
      </div>

      {/* Account */}
      {health.account_spec && (
        <span className="hidden text-slate-500 md:inline">
          <span className="text-slate-300">{health.account_spec}</span>
        </span>
      )}

      {/* Live quote */}
      {quote && quote.last > 0 && (
        <span className="hidden items-center gap-2 md:flex">
          <span className="font-mono font-bold text-slate-100">
            {quote.last.toFixed(2)}
          </span>
          <span className="text-slate-600">
            B:{quote.bid.toFixed(2)} / A:{quote.ask.toFixed(2)}
          </span>
        </span>
      )}

      {/* WS Info */}
      {isLive && (
        <span className="hidden text-slate-600 lg:inline">
          WS:{health.ws_streams ?? 0} · Up:{Math.floor((health.uptime_seconds ?? 0) / 60)}m
        </span>
      )}
    </div>
  );
}
