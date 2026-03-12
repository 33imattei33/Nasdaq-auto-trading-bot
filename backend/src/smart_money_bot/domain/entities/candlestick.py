from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Candlestick:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float

    @property
    def body_size(self) -> float:
        return abs(self.close - self.open)

    @property
    def upper_wick(self) -> float:
        return self.high - max(self.open, self.close)

    @property
    def lower_wick(self) -> float:
        return min(self.open, self.close) - self.low

    @property
    def is_bullish(self) -> bool:
        return self.close > self.open

    @property
    def is_bearish(self) -> bool:
        return self.close < self.open

    def has_rejection_wick(self, wick_multiplier: float = 1.5) -> bool:
        if self.body_size == 0:
            return True
        return (
            self.upper_wick >= self.body_size * wick_multiplier
            or self.lower_wick >= self.body_size * wick_multiplier
        )

    def is_railroad_track_with(self, previous: "Candlestick") -> bool:
        opposite_direction = (
            (self.is_bullish and previous.is_bearish)
            or (self.is_bearish and previous.is_bullish)
        )
        similar_body = min(self.body_size, previous.body_size) > 0 and (
            max(self.body_size, previous.body_size)
            / min(self.body_size, previous.body_size)
            <= 1.5
        )
        return opposite_direction and similar_body
