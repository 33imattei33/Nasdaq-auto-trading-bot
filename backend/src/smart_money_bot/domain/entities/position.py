from __future__ import annotations

from dataclasses import dataclass, field

from .trade import Trade


@dataclass
class Position:
    account_equity: float
    open_trades: list[Trade] = field(default_factory=list)
    trade_history: list[Trade] = field(default_factory=list)

    def add_open_trade(self, trade: Trade) -> None:
        self.open_trades.append(trade)

    def close_trade(self, trade_id: str, pnl: float) -> None:
        for idx, trade in enumerate(self.open_trades):
            if trade.trade_id == trade_id:
                trade.pnl = pnl
                self.trade_history.append(trade)
                del self.open_trades[idx]
                self.account_equity += pnl
                return

    @property
    def active_risk_exposure(self) -> float:
        return sum(
            abs(t.entry_price - t.stop_loss) * t.lot_size for t in self.open_trades
        )
