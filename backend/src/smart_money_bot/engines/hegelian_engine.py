"""
╔══════════════════════════════════════════════════════════════════════╗
║      HEGELIAN DIALECTIC ENGINE                                       ║
║   Asian Problem → London Reaction → NY Solution                      ║
║   Determines current session phase + kill zone detection             ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

from datetime import datetime

from smart_money_bot.config import CONFIG
from smart_money_bot.models.schemas import SessionPhase, CandleData


class HegelianDialecticEngine:
    """Maps UTC time to the 3-phase Hegelian trading cycle."""

    def __init__(self) -> None:
        self._cfg = CONFIG.session

    def get_current_phase(self, utc_now: datetime) -> SessionPhase:
        hour = utc_now.hour
        if self._cfg.asian_start <= hour < self._cfg.asian_end:
            return SessionPhase.ASIAN_CONSOLIDATION
        if self._cfg.london_start <= hour < self._cfg.london_end:
            return SessionPhase.LONDON_INDUCTION
        if self._cfg.ny_start <= hour < self._cfg.ny_end:
            return SessionPhase.NY_REVERSAL
        return SessionPhase.OFF_SESSION

    def is_killzone(self, utc_now: datetime) -> bool:
        hour = utc_now.hour
        in_london_kz = self._cfg.london_killzone_start <= hour < self._cfg.london_killzone_end
        in_ny_kz = self._cfg.ny_killzone_start <= hour < self._cfg.ny_killzone_end
        return in_london_kz or in_ny_kz

    def is_trading_permitted(self, utc_now: datetime) -> bool:
        phase = self.get_current_phase(utc_now)
        return phase == SessionPhase.NY_REVERSAL and self.is_killzone(utc_now)

    def calculate_induction_meter(self, candles: list[CandleData]) -> float:
        """
        Estimate how much retail is trapped (0-100%).
        Measures false breakout distance relative to consolidation range.
        """
        if len(candles) < 10:
            return 0.0

        consolidation = candles[-20:] if len(candles) >= 20 else candles
        highs = [c.high for c in consolidation]
        lows = [c.low for c in consolidation]
        range_size = max(highs) - min(lows)
        if range_size == 0:
            return 0.0

        latest = candles[-1]
        # How far price has pierced beyond the range
        above_breach = max(0.0, latest.high - max(highs[:-1]))
        below_breach = max(0.0, min(lows[:-1]) - latest.low)
        breach = max(above_breach, below_breach)

        meter = min(100.0, (breach / range_size) * 200.0)
        return round(meter, 1)
