from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

import pandas as pd

from smart_money_bot.application.ports.broker_port import BrokerPort
from smart_money_bot.domain.entities.candlestick import Candlestick
from smart_money_bot.domain.entities.position import Position
from smart_money_bot.domain.entities.trade import Trade, TradeSide, TradeStatus
from smart_money_bot.domain.services.risk_manager import RiskManager


class TradingPhase(str, Enum):
    ASIAN_CONSOLIDATION = "asian_consolidation"
    LONDON_INDUCTION = "london_induction"
    NY_REVERSAL = "ny_reversal"
    RESET = "reset"


@dataclass
class SmartMoneyAgent:
    symbol: str
    broker: BrokerPort
    risk_manager: RiskManager
    position: Position
    trade_timestamps: list[datetime] = field(default_factory=list)
    phase: TradingPhase = TradingPhase.ASIAN_CONSOLIDATION
    london_induction_seen: bool = False

    def _phase_from_session(self, now: datetime) -> TradingPhase:
        hour = now.hour
        if 0 <= hour < 8:
            return TradingPhase.ASIAN_CONSOLIDATION
        if 8 <= hour < 13:
            return TradingPhase.LONDON_INDUCTION
        if 13 <= hour < 21:
            return TradingPhase.NY_REVERSAL
        return TradingPhase.RESET

    def _to_candles(self, frame: pd.DataFrame) -> list[Candlestick]:
        candles: list[Candlestick] = []
        for _, row in frame.iterrows():
            candles.append(
                Candlestick(
                    timestamp=pd.to_datetime(row["timestamp"], utc=True).to_pydatetime(),
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row.get("volume", 0.0)),
                )
            )
        return candles

    def _liquidity_zone(self, candles: list[Candlestick], lookback: int = 20) -> tuple[float, float]:
        segment = candles[-lookback:]
        lows = [c.low for c in segment]
        highs = [c.high for c in segment]
        return min(lows), max(highs)

    def _is_stop_hunt(self, candle: Candlestick, zone_low: float, zone_high: float) -> bool:
        return candle.low < zone_low or candle.high > zone_high

    def _reversal_confirmed(self, previous: Candlestick, current: Candlestick) -> bool:
        return current.has_rejection_wick() or current.is_railroad_track_with(previous)

    def _build_trade(self, candle: Candlestick) -> Trade:
        side = TradeSide.BUY if candle.is_bullish else TradeSide.SELL
        lot_size = self.risk_manager.calculate_lot_size(self.position.account_equity)
        stop_loss = candle.low if side == TradeSide.BUY else candle.high

        return Trade(
            trade_id=f"SM-{uuid4().hex[:10].upper()}",
            symbol=self.symbol,
            side=side,
            entry_price=candle.close,
            stop_loss=stop_loss,
            lot_size=lot_size,
            opened_at=datetime.now(timezone.utc),
            status=TradeStatus.PENDING,
            metadata={"setup": "smart_money_signature_trade"},
        )

    def on_market_data(self, frame: pd.DataFrame, now: datetime | None = None) -> Trade | None:
        now = now or datetime.now(timezone.utc)
        self.phase = self._phase_from_session(now)

        if self.phase == TradingPhase.ASIAN_CONSOLIDATION:
            self.london_induction_seen = False
            return None

        candles = self._to_candles(frame)
        if len(candles) < 25:
            return None

        zone_low, zone_high = self._liquidity_zone(candles[:-1])
        current = candles[-1]
        previous = candles[-2]

        if self.phase == TradingPhase.LONDON_INDUCTION:
            if self._is_stop_hunt(current, zone_low, zone_high):
                self.london_induction_seen = True
            return None

        if self.phase != TradingPhase.NY_REVERSAL:
            return None

        if not self.london_induction_seen:
            return None

        if not self.risk_manager.can_open_trade(self.trade_timestamps, now):
            return None

        if not self._is_stop_hunt(current, zone_low, zone_high):
            return None

        if not self._reversal_confirmed(previous, current):
            return None

        trade = self._build_trade(current)
        if not self.risk_manager.is_stop_loss_within_limit(
            entry_price=trade.entry_price,
            stop_loss=trade.stop_loss,
            side=trade.side,
        ):
            trade.status = TradeStatus.REJECTED
            return None

        self.broker.place_trade(trade)
        trade.status = TradeStatus.OPEN
        self.position.add_open_trade(trade)
        self.trade_timestamps.append(now)
        self.london_induction_seen = False
        return trade
