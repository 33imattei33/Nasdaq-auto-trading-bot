"""
╔══════════════════════════════════════════════════════════════════════╗
║      RISK MANAGER — APEX 100K ACCOUNT PROTECTION                     ║
║                                                                      ║
║   Rules enforced:                                                    ║
║   1. Max risk per trade: min(2% equity, $300)                        ║
║   2. Max SL distance: 60 NQ points                                  ║
║   3. Max contracts: 4 MNQ per trade                                  ║
║   4. Max daily loss: $600 (stops trading)                            ║
║   5. Trailing drawdown buffer: won't risk > 50% of remaining        ║
║   6. Intraday only: no trades after 16:00 ET / 21:00 UTC            ║
║   7. Max 3 trades per day                                            ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from smart_money_bot.config import CONFIG
from smart_money_bot.domain.entities.trade import TradeSide

log = logging.getLogger(__name__)


@dataclass
class RiskManager:
    """Stateless risk-checking utilities.

    For MNQ:  tick_size=0.25, tick_value=$0.50, point_value=$2.00/contract
    """

    def calculate_contracts(
        self, equity: float, sl_distance_points: float
    ) -> int:
        """How many MNQ contracts can we trade within risk limits?

        max_risk = min(equity × 2%, $300)
        contracts = floor(max_risk / (sl_points × $2.00))
        capped at 4
        """
        risk = CONFIG.risk
        pct_risk = equity * risk.max_risk_per_trade_pct
        max_risk_usd = min(pct_risk, risk.max_risk_per_trade_usd)

        if sl_distance_points <= 0:
            return risk.default_contracts

        risk_per_contract = sl_distance_points * risk.point_value
        if risk_per_contract <= 0:
            return risk.default_contracts

        qty = int(max_risk_usd / risk_per_contract)
        return max(1, min(qty, risk.max_contracts))

    def validate_stop_loss(
        self,
        entry: float,
        sl: float,
        side: TradeSide,
        contracts: int = 1,
        equity: float = 100_000.0,
        daily_pnl: float = 0.0,
    ) -> tuple[bool, str]:
        """Full SL validation against APEX 100K rules.

        Returns (ok, reason).
        """
        risk = CONFIG.risk
        apex = CONFIG.apex

        if entry <= 0:
            return False, "Invalid entry price"

        sl_distance = (entry - sl) if side == TradeSide.BUY else (sl - entry)
        if sl_distance <= 0:
            return False, "SL on wrong side of entry"

        if sl_distance > risk.max_sl_points:
            return False, f"SL {sl_distance:.1f}pts > max {risk.max_sl_points}pts"

        dollar_risk = sl_distance * risk.point_value * contracts
        if dollar_risk > risk.max_risk_per_trade_usd:
            return False, f"${dollar_risk:.0f} risk > ${risk.max_risk_per_trade_usd:.0f} cap"

        pct = dollar_risk / equity if equity > 0 else 1.0
        if pct > risk.max_risk_per_trade_pct:
            return False, f"Risk {pct:.2%} > {risk.max_risk_per_trade_pct:.0%} limit"

        buffer = apex.trailing_drawdown - abs(min(0, daily_pnl))
        if dollar_risk > buffer * 0.5:
            return False, f"${dollar_risk:.0f} > 50% of drawdown buffer ${buffer:.0f}"

        return True, "OK"

    def is_daily_trade_limit_reached(
        self, trade_timestamps: list[datetime], now: datetime | None = None
    ) -> bool:
        now = now or datetime.now(timezone.utc)
        today = now.date()
        count = sum(1 for ts in trade_timestamps if ts.date() == today)
        return count >= CONFIG.risk.max_trades_per_day

    def is_daily_loss_exceeded(self, daily_pnl: float) -> bool:
        return daily_pnl < -CONFIG.risk.max_daily_loss_usd

    def is_past_intraday_close(self, now: datetime | None = None) -> bool:
        now = now or datetime.now(timezone.utc)
        return now.hour >= CONFIG.apex.intraday_close_hour_utc

    def can_open_trade(
        self,
        trade_timestamps: list[datetime],
        daily_pnl: float = 0.0,
        now: datetime | None = None,
    ) -> tuple[bool, str]:
        """Master gate — can we open a new trade right now?"""
        now = now or datetime.now(timezone.utc)

        if self.is_past_intraday_close(now):
            return False, "Past APEX intraday close time"
        if self.is_daily_trade_limit_reached(trade_timestamps, now):
            return False, f"Daily trade limit ({CONFIG.risk.max_trades_per_day}) reached"
        if self.is_daily_loss_exceeded(daily_pnl):
            return False, f"Daily loss ${daily_pnl:.0f} exceeds ${CONFIG.risk.max_daily_loss_usd:.0f} limit"
        return True, "OK"
