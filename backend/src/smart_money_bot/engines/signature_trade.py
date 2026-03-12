"""
╔══════════════════════════════════════════════════════════════════════╗
║      SIGNATURE TRADE DETECTOR                                        ║
║   Wedge/Triangle → False Breakout → Stop Hunt → Exhaustion Reversal  ║
║   This IS the institutional trade. Everything else is noise.         ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from smart_money_bot.config import CONFIG
from smart_money_bot.models.schemas import (
    CandleData,
    InductionState,
    TradeDirection,
    ForexiaSignal,
    SignalType,
)


@dataclass
class WedgePattern:
    upper_slope: float
    lower_slope: float
    candle_count: int
    is_contracting: bool


@dataclass
class StopHunt:
    direction: str  # "above" or "below"
    wick_size: float
    zone_breached: float


class SignatureTradeDetector:
    """Detects the full Signature Trade sequence from raw candles."""

    def __init__(self) -> None:
        self._cfg = CONFIG.signature
        self.induction_state = InductionState.NO_PATTERN

    def _detect_wedge(self, candles: list[CandleData]) -> WedgePattern | None:
        if len(candles) < self._cfg.min_consolidation_candles:
            return None

        segment = candles[-self._cfg.min_consolidation_candles:]
        highs = [c.high for c in segment]
        lows = [c.low for c in segment]

        n = len(highs)
        x_mean = (n - 1) / 2
        upper_slope = sum((i - x_mean) * (h - sum(highs) / n)
                         for i, h in enumerate(highs)) / max(1, sum((i - x_mean) ** 2 for i in range(n)))
        lower_slope = sum((i - x_mean) * (l - sum(lows) / n)
                         for i, l in enumerate(lows)) / max(1, sum((i - x_mean) ** 2 for i in range(n)))

        is_contracting = (upper_slope < 0 and lower_slope > 0) or abs(upper_slope - lower_slope) < self._cfg.wedge_slope_threshold

        if not is_contracting:
            return None

        return WedgePattern(
            upper_slope=round(upper_slope, 4),
            lower_slope=round(lower_slope, 4),
            candle_count=n,
            is_contracting=is_contracting,
        )

    def _detect_stop_hunt(self, candles: list[CandleData], lookback: int = 20) -> StopHunt | None:
        if len(candles) < lookback + 1:
            return None

        zone = candles[-(lookback + 1):-1]
        current = candles[-1]
        zone_high = max(c.high for c in zone)
        zone_low = min(c.low for c in zone)

        upper_wick = current.high - max(current.open, current.close)
        lower_wick = min(current.open, current.close) - current.low
        body = abs(current.close - current.open)

        if current.high > zone_high and upper_wick > body * self._cfg.stop_hunt_wick_multiplier:
            return StopHunt(direction="above", wick_size=upper_wick, zone_breached=zone_high)
        if current.low < zone_low and lower_wick > body * self._cfg.stop_hunt_wick_multiplier:
            return StopHunt(direction="below", wick_size=lower_wick, zone_breached=zone_low)
        return None

    def _is_exhaustion(self, candle: CandleData) -> bool:
        body = abs(candle.close - candle.open)
        total = candle.high - candle.low
        if total == 0:
            return False
        return (body / total) < self._cfg.exhaustion_body_ratio

    def evaluate(self, candles: list[CandleData]) -> InductionState:
        if len(candles) < 25:
            self.induction_state = InductionState.NO_PATTERN
            return self.induction_state

        wedge = self._detect_wedge(candles)
        if wedge:
            self.induction_state = InductionState.WEDGE_FORMING
        else:
            self.induction_state = InductionState.NO_PATTERN
            return self.induction_state

        stop_hunt = self._detect_stop_hunt(candles)
        if stop_hunt:
            self.induction_state = InductionState.STOP_HUNT_ACTIVE
        else:
            return self.induction_state

        current = candles[-1]
        if self._is_exhaustion(current):
            self.induction_state = InductionState.EXHAUSTION_DETECTED

            # Check if next candle reverses
            prev = candles[-2]
            reversed_dir = (
                (current.close > current.open and prev.close < prev.open)
                or (current.close < current.open and prev.close > prev.open)
            )
            if reversed_dir:
                self.induction_state = InductionState.REVERSAL_CONFIRMED

        return self.induction_state

    def generate_signal(
        self,
        candles: list[CandleData],
        symbol: str,
        lot_size: float,
        signal_id: str,
    ) -> ForexiaSignal | None:
        state = self.evaluate(candles)
        if state != InductionState.REVERSAL_CONFIRMED:
            return None

        current = candles[-1]
        direction = TradeDirection.BUY if current.close > current.open else TradeDirection.SELL

        if direction == TradeDirection.BUY:
            entry = current.close
            sl = current.low
            tp = entry + (entry - sl) * 2
        else:
            entry = current.close
            sl = current.high
            tp = entry - (sl - entry) * 2

        return ForexiaSignal(
            signal_id=signal_id,
            symbol=symbol,
            direction=direction,
            signal_type=SignalType.SIGNATURE_TRADE,
            entry_price=entry,
            stop_loss=sl,
            take_profit=tp,
            lot_size=lot_size,
            confidence=85.0,
            induction_state=state,
        )
