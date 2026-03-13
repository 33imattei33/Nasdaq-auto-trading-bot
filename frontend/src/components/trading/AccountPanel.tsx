"use client";

import type { AccountState } from "@/lib/types";

export default function AccountPanel({
  account,
  symbol,
  price,
}: {
  account: AccountState;
  symbol: string;
  price: number;
}) {
  const pnlColor = account.daily_pnl >= 0 ? "text-brand" : "text-red-400";
  const pnlBg = account.daily_pnl >= 0 ? "bg-brand/10" : "bg-red-500/10";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {/* Symbol */}
      <div className="stat-card">
        <div className="stat-label">Symbol</div>
        <div className="stat-value">{symbol}</div>
      </div>

      {/* Live Price */}
      <div className="stat-card">
        <div className="stat-label">Live Price</div>
        <div className="stat-value font-mono">
          {price > 0 ? price.toFixed(2) : "—"}
        </div>
      </div>

      {/* Balance */}
      <div className="stat-card">
        <div className="stat-label">Balance</div>
        <div className="stat-value">
          ${account.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* Equity */}
      <div className="stat-card">
        <div className="stat-label">Equity</div>
        <div className="stat-value">
          ${account.equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* Daily P&L */}
      <div className="stat-card relative overflow-hidden">
        <div className={`absolute inset-0 ${pnlBg} pointer-events-none`} />
        <div className="relative">
          <div className="stat-label">Daily P&L</div>
          <div className={`stat-value ${pnlColor}`}>
            {account.daily_pnl >= 0 ? "+" : ""}
            ${Math.abs(account.daily_pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
}
