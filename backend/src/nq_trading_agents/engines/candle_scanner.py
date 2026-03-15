"""
╔══════════════════════════════════════════════════════════════════════╗
║      CANDLESTICK ANATOMY SCANNER                                     ║
║   Railroad Tracks + Star patterns at psychological levels            ║
║   Pure computation — no indicators.                                  ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

from dataclasses import dataclass

from nq_trading_agents.config import CONFIG
from nq_trading_agents.models.schemas import CandleData, SignalType


@dataclass
class CandlePattern:
    pattern_type: SignalType
    candle_index: int
    direction: str  # "bullish" | "bearish"
    confidence: float


class CandlestickAnatomyScanner:
    """Detects institutional-grade candlestick patterns."""

    def __init__(self) -> None:
        self._cfg = CONFIG.candle_scanner

    def _body(self, c: CandleData) -> float:
        return abs(c.close - c.open)

    def _upper_wick(self, c: CandleData) -> float:
        return c.high - max(c.open, c.close)

    def _lower_wick(self, c: CandleData) -> float:
        return min(c.open, c.close) - c.low

    def _is_bullish(self, c: CandleData) -> bool:
        return c.close > c.open

    def detect_railroad_tracks(self, candles: list[CandleData]) -> CandlePattern | None:
        """Two adjacent candles with similar-sized bodies in opposite directions."""
        if len(candles) < 2:
            return None

        prev, curr = candles[-2], candles[-1]
        prev_body = self._body(prev)
        curr_body = self._body(curr)

        if min(prev_body, curr_body) == 0:
            return None

        ratio = max(prev_body, curr_body) / min(prev_body, curr_body)
        opposite = (self._is_bullish(prev) != self._is_bullish(curr))

        if opposite and ratio <= self._cfg.railroad_body_ratio:
            direction = "bullish" if self._is_bullish(curr) else "bearish"
            return CandlePattern(
                pattern_type=SignalType.RAILROAD_TRACKS,
                candle_index=len(candles) - 1,
                direction=direction,
                confidence=75.0,
            )
        return None

    def detect_star_pattern(self, candles: list[CandleData]) -> CandlePattern | None:
        """Hammer / shooting star — long wick, tiny body."""
        if len(candles) < 1:
            return None

        c = candles[-1]
        body = self._body(c)
        upper = self._upper_wick(c)
        lower = self._lower_wick(c)

        if body == 0:
            body = 0.0001  # avoid div/0

        # Hammer (bullish) — long lower wick
        if lower >= body * self._cfg.star_wick_multiplier and upper < body:
            return CandlePattern(
                pattern_type=SignalType.STAR_PATTERN,
                candle_index=len(candles) - 1,
                direction="bullish",
                confidence=70.0,
            )

        # Shooting star (bearish) — long upper wick
        if upper >= body * self._cfg.star_wick_multiplier and lower < body:
            return CandlePattern(
                pattern_type=SignalType.STAR_PATTERN,
                candle_index=len(candles) - 1,
                direction="bearish",
                confidence=70.0,
            )
        return None

    def scan(self, candles: list[CandleData]) -> list[CandlePattern]:
        patterns: list[CandlePattern] = []
        rr = self.detect_railroad_tracks(candles)
        if rr:
            patterns.append(rr)
        star = self.detect_star_pattern(candles)
        if star:
            patterns.append(star)
        return patterns
