"use client";

import type { AccountState } from "@/lib/types";
import { Card, CardTitle, CardValue } from "@/components/ui/card";

export default function AccountPanel({
  account,
  symbol,
  price,
}: {
  account: AccountState;
  symbol: string;
  price: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <Card>
        <CardTitle>Symbol</CardTitle>
        <CardValue>{symbol}</CardValue>
      </Card>
      <Card>
        <CardTitle>Live Price</CardTitle>
        <CardValue>{price > 0 ? price.toFixed(2) : "—"}</CardValue>
      </Card>
      <Card>
        <CardTitle>Balance</CardTitle>
        <CardValue>${account.balance.toFixed(2)}</CardValue>
      </Card>
      <Card>
        <CardTitle>Equity</CardTitle>
        <CardValue>${account.equity.toFixed(2)}</CardValue>
      </Card>
      <Card>
        <CardTitle>Daily P&L</CardTitle>
        <CardValue>
          <span
            className={
              account.daily_pnl >= 0 ? "text-emerald-400" : "text-red-400"
            }
          >
            {account.daily_pnl >= 0 ? "+" : ""}
            {account.daily_pnl.toFixed(2)}
          </span>
        </CardValue>
      </Card>
    </div>
  );
}
