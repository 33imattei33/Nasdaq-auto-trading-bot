"""
╔══════════════════════════════════════════════════════════════════════╗
║      MARKET STRUCTURE ANALYZER                                       ║
║   Pure computation: runs on every candle set.                        ║
║   Detects trend, liquidity zones, psych levels, swing structure.     ║
║   NO Fair Value Gaps. NO retail indicators.                          ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from nq_trading_agents.config import CONFIG
from nq_trading_agents.models.schemas import (
    CandleData,
    LiquidityZone,
    MarketStructureData,
    MarketTrend,
    VolatilityState,
)


class MarketStructureAnalyzer:
    """Computes structural market data from raw candles."""

    def __init__(self) -> None:
        self._cfg = CONFIG.market_structure

    # ── ATR ───────────────────────────────────────────────────────────
    def _atr(self, candles: list[CandleData]) -> float:
        if len(candles) < 2:
            return 0.0
        trs: list[float] = []
        for i in range(1, len(candles)):
            prev_close = candles[i - 1].close
            c = candles[i]
            tr = max(c.high - c.low, abs(c.high - prev_close), abs(c.low - prev_close))
            trs.append(tr)
        period = min(self._cfg.atr_period, len(trs))
        return sum(trs[-period:]) / period if period > 0 else 0.0

    # ── Trend detection via swing highs / lows ───────────────────────
    def _detect_trend(self, candles: list[CandleData]) -> tuple[MarketTrend, float]:
        if len(candles) < 6:
            return MarketTrend.RANGING, 0.0

        swing_highs: list[float] = []
        swing_lows: list[float] = []
        for i in range(2, len(candles) - 2):
            if candles[i].high > candles[i - 1].high and candles[i].high > candles[i + 1].high:
                swing_highs.append(candles[i].high)
            if candles[i].low < candles[i - 1].low and candles[i].low < candles[i + 1].low:
                swing_lows.append(candles[i].low)

        if len(swing_highs) < 2 or len(swing_lows) < 2:
            return MarketTrend.RANGING, 0.0

        hh = swing_highs[-1] > swing_highs[-2]
        hl = swing_lows[-1] > swing_lows[-2]
        lh = swing_highs[-1] < swing_highs[-2]
        ll = swing_lows[-1] < swing_lows[-2]

        if hh and hl:
            strength = min(1.0, (swing_highs[-1] - swing_highs[-2]) / max(1, self._atr(candles)))
            return MarketTrend.BULLISH, round(abs(strength), 2)
        if lh and ll:
            strength = min(1.0, (swing_lows[-2] - swing_lows[-1]) / max(1, self._atr(candles)))
            return MarketTrend.BEARISH, round(abs(strength), 2)
        return MarketTrend.RANGING, 0.0

    # ── Volatility state ─────────────────────────────────────────────
    def _volatility_state(self, atr: float, avg_range: float) -> VolatilityState:
        if avg_range == 0:
            return VolatilityState.NORMAL
        ratio = atr / avg_range
        if ratio < 0.6:
            return VolatilityState.LOW
        if ratio < 1.2:
            return VolatilityState.NORMAL
        if ratio < 2.0:
            return VolatilityState.HIGH
        return VolatilityState.EXTREME

    # ── Liquidity zones ──────────────────────────────────────────────
    def _find_liquidity_zones(self, candles: list[CandleData]) -> list[LiquidityZone]:
        if len(candles) < 10:
            return []

        zones: list[LiquidityZone] = []
        atr = self._atr(candles)
        threshold = atr * 0.3
        lows = sorted(c.low for c in candles)
        highs = sorted(c.high for c in candles)

        # Cluster around repeated swing lows → buy-side liquidity
        for i in range(len(lows) - 1):
            if abs(lows[i] - lows[i + 1]) < threshold:
                zones.append(LiquidityZone(
                    price_low=lows[i],
                    price_high=lows[i + 1],
                    zone_type="buy_side",
                    strength=0.7,
                ))

        # Cluster around repeated swing highs → sell-side liquidity
        for i in range(len(highs) - 1):
            if abs(highs[i] - highs[i + 1]) < threshold:
                zones.append(LiquidityZone(
                    price_low=highs[i],
                    price_high=highs[i + 1],
                    zone_type="sell_side",
                    strength=0.7,
                ))

        return zones[:10]

    # ── Psychological levels ─────────────────────────────────────────
    def _psych_levels(self, candles: list[CandleData]) -> list[float]:
        if not candles:
            return []
        low = min(c.low for c in candles)
        high = max(c.high for c in candles)
        interval = self._cfg.psych_level_interval
        start = math.floor(low / interval) * interval
        levels: list[float] = []
        p = start
        while p <= high + interval:
            levels.append(p)
            p += interval
        return levels

    # ── Support / Resistance ─────────────────────────────────────────
    def _support_resistance(self, candles: list[CandleData]) -> tuple[list[float], list[float]]:
        supports: list[float] = []
        resistances: list[float] = []
        for i in range(2, len(candles) - 2):
            if candles[i].low < candles[i - 1].low and candles[i].low < candles[i + 1].low:
                supports.append(candles[i].low)
            if candles[i].high > candles[i - 1].high and candles[i].high > candles[i + 1].high:
                resistances.append(candles[i].high)
        return sorted(set(supports))[-5:], sorted(set(resistances))[-5:]

    # ── Main analysis ────────────────────────────────────────────────
    def analyze(self, symbol: str, candles: list[CandleData]) -> MarketStructureData:
        if len(candles) < 5:
            return MarketStructureData(symbol=symbol)

        trend, strength = self._detect_trend(candles)
        atr = self._atr(candles)
        avg_range = sum(c.high - c.low for c in candles) / len(candles)
        vol = self._volatility_state(atr, avg_range)
        zones = self._find_liquidity_zones(candles)
        psych = self._psych_levels(candles)
        supports, resistances = self._support_resistance(candles)

        bias = strength if trend == MarketTrend.BULLISH else (-strength if trend == MarketTrend.BEARISH else 0.0)

        return MarketStructureData(
            symbol=symbol,
            trend=trend,
            trend_strength=strength,
            volatility=vol,
            atr=round(atr, 2),
            bias_score=round(bias, 2),
            support_levels=supports,
            resistance_levels=resistances,
            liquidity_zones=zones,
            psych_levels=psych,
        )
