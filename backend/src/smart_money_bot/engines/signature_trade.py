"""
╔══════════════════════════════════════════════════════════════════════╗
║      SIGNATURE TRADE DETECTOR  (v2)                                  ║
║                                                                      ║
║   Detects the institutional Signature Trade sequence:                ║
║                                                                      ║
║   1. WEDGE / CONSOLIDATION  (candles[-N .. -4])                      ║
║      highs slope down AND lows slope up → contracting range          ║
║                                                                      ║
║   2. STOP HUNT              (candle[-3] or [-2])                     ║
║      big wick that pierces recent high/low, body closes back in      ║
║                                                                      ║
║   3. EXHAUSTION             (candle[-2])                             ║
║      doji-like: small body relative to total range                   ║
║                                                                      ║
║   4. REVERSAL               (candle[-1])                             ║
║      strong candle in the OPPOSITE direction of the stop hunt        ║
║                                                                      ║
║   The detector keeps a rolling state machine so the orchestrator     ║
║   can query the current induction state at any time.                 ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from smart_money_bot.config import CONFIG
from smart_money_bot.models.schemas import (
    CandleData,
    ForexiaSignal,
    InductionState,
    SignalType,
    TradeDirection,
)

log = logging.getLogger(__name__)


@dataclass
class WedgePattern:
    upper_slope: float
    lower_slope: float
    candle_count: int
    is_contracting: bool


@dataclass
class StopHunt:
    direction: str          # "above" or "below"
    wick_size: float
    zone_breached: float
    candle_index: int       # index into the candle array


class SignatureTradeDetector:
    """Detects the full Signature Trade sequence from raw candles."""

    def __init__(self) -> None:
        self._cfg = CONFIG.signature
        self.induction_state = InductionState.NO_PATTERN

    # ── 1. Wedge / Consolidation ──────────────────────────────────

    def _detect_wedge(self, candles: list[CandleData], end_idx: int | None = None) -> WedgePattern | None:
        """Check for a contracting wedge in candles ending at `end_idx`.

        By default checks the last `min_consolidation_candles` candles,
        but can be shifted backwards with `end_idx` to check the
        consolidation BEFORE a stop-hunt candle.
        """
        n_needed = self._cfg.min_consolidation_candles
        if end_idx is None:
            end_idx = len(candles)
        start_idx = end_idx - n_needed
        if start_idx < 0:
            return None

        segment = candles[start_idx:end_idx]
        highs = [c.high for c in segment]
        lows = [c.low for c in segment]
        n = len(highs)
        x_mean = (n - 1) / 2.0
        denom = sum((i - x_mean) ** 2 for i in range(n))
        if denom == 0:
            return None

        upper_slope = sum((i - x_mean) * (h - sum(highs) / n) for i, h in enumerate(highs)) / denom
        lower_slope = sum((i - x_mean) * (lo - sum(lows) / n) for i, lo in enumerate(lows)) / denom

        # Contracting = highs falling AND lows rising, OR slopes close together
        is_contracting = (
            (upper_slope < 0 and lower_slope > 0) or
            abs(upper_slope - lower_slope) < self._cfg.wedge_slope_threshold
        )

        if not is_contracting:
            return None

        return WedgePattern(
            upper_slope=round(upper_slope, 6),
            lower_slope=round(lower_slope, 6),
            candle_count=n,
            is_contracting=True,
        )

    # ── 2. Stop Hunt ─────────────────────────────────────────────

    def _detect_stop_hunt(self, candles: list[CandleData], at_idx: int | None = None,
                          lookback: int | None = None) -> StopHunt | None:
        """Check if candle at `at_idx` is a stop-hunt candle.

        A stop hunt candle has a wick that exceeds the recent zone
        high/low, but the body closes back inside the zone.
        """
        if lookback is None:
            lookback = self._cfg.stop_hunt_lookback
        if at_idx is None:
            at_idx = len(candles) - 1
        if at_idx < lookback:
            return None

        zone = candles[at_idx - lookback:at_idx]
        current = candles[at_idx]
        zone_high = max(c.high for c in zone)
        zone_low = min(c.low for c in zone)

        body_top = max(current.open, current.close)
        body_bottom = min(current.open, current.close)
        upper_wick = current.high - body_top
        lower_wick = body_bottom - current.low
        body = abs(current.close - current.open)

        min_wick = max(body * self._cfg.stop_hunt_wick_multiplier, 0.5)

        # Upside stop hunt: wick pierced above zone high
        if current.high > zone_high and upper_wick > min_wick:
            return StopHunt(direction="above", wick_size=upper_wick,
                            zone_breached=zone_high, candle_index=at_idx)

        # Downside stop hunt: wick pierced below zone low
        if current.low < zone_low and lower_wick > min_wick:
            return StopHunt(direction="below", wick_size=lower_wick,
                            zone_breached=zone_low, candle_index=at_idx)

        return None

    # ── 3. Exhaustion ─────────────────────────────────────────────

    def _is_exhaustion(self, candle: CandleData) -> bool:
        """A doji / indecision candle: tiny body relative to range."""
        body = abs(candle.close - candle.open)
        total = candle.high - candle.low
        if total <= 0:
            return False
        return (body / total) < self._cfg.exhaustion_body_ratio

    # ── 4. Reversal confirmation ──────────────────────────────────

    @staticmethod
    def _is_reversal(current: CandleData, hunt_direction: str) -> bool:
        """Check if `current` candle reverses away from the stop hunt direction.

        If hunt was "above" (trapped longs), reversal is a strong BEARISH candle.
        If hunt was "below" (trapped shorts), reversal is a strong BULLISH candle.
        """
        body = abs(current.close - current.open)
        total = current.high - current.low
        if total <= 0 or body <= 0:
            return False

        # Need a decisive candle (body > 40% of range)
        if body / total < 0.4:
            return False

        if hunt_direction == "above":
            # Expecting bearish reversal
            return current.close < current.open
        else:
            # Expecting bullish reversal
            return current.close > current.open

    # ── Full evaluation ───────────────────────────────────────────

    # ── Momentum scalp detection (simpler alternative) ────────────

    def _detect_momentum_scalp(self, candles: list[CandleData]) -> InductionState:
        """Simpler momentum-based scalp entry.

        Looks for:
        1. A strong directional move (4+ of 8 candles same direction)
        2. A pullback of 2+ candles the other way
        3. A reversal candle resuming the original direction

        Also catches: double rejection off a level (2+ wicks hitting same zone)
        """
        if len(candles) < 15:
            return InductionState.NO_PATTERN

        recent = candles[-15:]
        last = candles[-1]

        # Method A: Pullback-continuation
        trend_window = recent[:10]
        pullback_window = recent[-5:-1]
        bullish_run = sum(1 for c in trend_window if c.close > c.open)
        bearish_run = sum(1 for c in trend_window if c.close < c.open)

        if bullish_run >= 6:
            pullback = sum(1 for c in pullback_window if c.close < c.open)
            if pullback >= 2 and last.close > last.open:
                body = last.close - last.open
                total = last.high - last.low
                if total > 0 and body / total > 0.25:
                    return InductionState.REVERSAL_CONFIRMED

        if bearish_run >= 6:
            pullback = sum(1 for c in pullback_window if c.close > c.open)
            if pullback >= 2 and last.close < last.open:
                body = last.open - last.close
                total = last.high - last.low
                if total > 0 and body / total > 0.25:
                    return InductionState.REVERSAL_CONFIRMED

        # Method B: Double rejection (2+ wicks hitting same level)
        lows = [c.low for c in candles[-6:-1]]
        highs = [c.high for c in candles[-6:-1]]
        avg_range = sum(c.high - c.low for c in candles[-20:]) / 20

        if avg_range > 0:
            low_zone = min(lows)
            near_low = sum(1 for lo in lows if abs(lo - low_zone) < avg_range * 0.4)
            if near_low >= 2 and last.close > last.open:
                body = last.close - last.open
                if body > avg_range * 0.25:
                    return InductionState.REVERSAL_CONFIRMED

            high_zone = max(highs)
            near_high = sum(1 for hi in highs if abs(hi - high_zone) < avg_range * 0.4)
            if near_high >= 2 and last.close < last.open:
                body = last.open - last.close
                if body > avg_range * 0.25:
                    return InductionState.REVERSAL_CONFIRMED

        return InductionState.NO_PATTERN

    def evaluate(self, candles: list[CandleData]) -> InductionState:
        """Scan the candle history for the Signature Trade sequence.

        The sequence spans multiple candles:
          - Wedge:      candles[...-3]  (consolidation before the action)
          - Stop hunt:  candles[-3] or [-2]
          - Exhaustion: candle after stop hunt
          - Reversal:   candles[-1] — the current/last candle

        We scan the last few candles looking for stop-hunt events and
        then verify the full sequence around them.
        """
        if len(candles) < 25:
            self.induction_state = InductionState.NO_PATTERN
            return self.induction_state

        # Default: no pattern
        self.induction_state = InductionState.NO_PATTERN

        # Check the last 4 candles for a potential stop-hunt event
        # The stop hunt can be at position -3, -2, or even -1 relative to end
        for hunt_offset in [3, 2]:
            hunt_idx = len(candles) - hunt_offset
            if hunt_idx < 21:
                continue

            # 1. Check for wedge BEFORE the hunt candle
            wedge = self._detect_wedge(candles, end_idx=hunt_idx)
            if not wedge:
                continue

            self.induction_state = InductionState.WEDGE_FORMING

            # 2. Check if candle at hunt_idx is a stop hunt
            hunt = self._detect_stop_hunt(candles, at_idx=hunt_idx)
            if not hunt:
                continue

            self.induction_state = InductionState.STOP_HUNT_ACTIVE

            # 3. Check exhaustion candle(s) between hunt and last candle
            # The candle(s) after the hunt and before the reversal should show exhaustion
            exhaustion_found = False
            for ex_idx in range(hunt_idx, len(candles) - 1):
                if self._is_exhaustion(candles[ex_idx]):
                    exhaustion_found = True
                    break

            if exhaustion_found:
                self.induction_state = InductionState.EXHAUSTION_DETECTED

            # 4. Check if the LAST candle is a reversal
            last = candles[-1]
            if self._is_reversal(last, hunt.direction):
                self.induction_state = InductionState.REVERSAL_CONFIRMED
                log.info(
                    f"✓ REVERSAL_CONFIRMED: hunt={hunt.direction} at idx {hunt_idx}, "
                    f"wedge={wedge.candle_count} bars, last close={last.close}"
                )
                return self.induction_state

        # Also try: stop hunt at the second-to-last candle, reversal at last
        # (no exhaustion gap between them — direct reversal off the hunt)
        for hunt_offset in [2, 1]:
            hunt_idx = len(candles) - hunt_offset
            if hunt_idx < 21:
                continue

            wedge = self._detect_wedge(candles, end_idx=max(hunt_idx, self._cfg.min_consolidation_candles))
            if not wedge:
                # Relaxed: try wedge further back
                for wb in range(hunt_idx - 2, max(20, hunt_idx - 10), -1):
                    wedge = self._detect_wedge(candles, end_idx=wb)
                    if wedge:
                        break
            if not wedge:
                continue

            if self.induction_state == InductionState.NO_PATTERN:
                self.induction_state = InductionState.WEDGE_FORMING

            hunt = self._detect_stop_hunt(candles, at_idx=hunt_idx)
            if not hunt:
                continue

            if self.induction_state.value in ("NO_PATTERN", "WEDGE_FORMING"):
                self.induction_state = InductionState.STOP_HUNT_ACTIVE

            last = candles[-1]
            if self._is_reversal(last, hunt.direction):
                self.induction_state = InductionState.REVERSAL_CONFIRMED
                log.info(
                    f"✓ REVERSAL_CONFIRMED (direct): hunt={hunt.direction} at idx {hunt_idx}, "
                    f"last close={last.close}"
                )
                return self.induction_state

        # Signature pattern not found — try momentum scalp
        momentum_state = self._detect_momentum_scalp(candles)
        if momentum_state == InductionState.REVERSAL_CONFIRMED:
            self.induction_state = InductionState.REVERSAL_CONFIRMED
            log.info(
                f"✓ REVERSAL_CONFIRMED (momentum scalp): "
                f"last close={candles[-1].close}"
            )
            return self.induction_state

        return self.induction_state

    # ── Signal generation ─────────────────────────────────────────

    def generate_signal(
        self,
        candles: list[CandleData],
        symbol: str,
        lot_size: float,
        signal_id: str,
    ) -> ForexiaSignal | None:
        """Generate a trading signal if REVERSAL_CONFIRMED."""
        state = self.evaluate(candles)
        if state != InductionState.REVERSAL_CONFIRMED:
            return None

        current = candles[-1]
        direction = TradeDirection.BUY if current.close > current.open else TradeDirection.SELL

        # Scalping: tight SL based on recent swing, capped at 15 points
        if direction == TradeDirection.BUY:
            entry = current.close
            recent_low = min(c.low for c in candles[-5:])
            sl = recent_low
            sl_dist = entry - sl
            # Cap SL distance for scalping (max 15 pts, min 3 pts)
            sl_dist = max(3.0, min(sl_dist, 15.0))
            sl = entry - sl_dist
            tp = entry + sl_dist * 2  # 2:1 R:R
        else:
            entry = current.close
            recent_high = max(c.high for c in candles[-5:])
            sl = recent_high
            sl_dist = sl - entry
            sl_dist = max(3.0, min(sl_dist, 15.0))
            sl = entry + sl_dist
            tp = entry - sl_dist * 2  # 2:1 R:R

        return ForexiaSignal(
            signal_id=signal_id,
            symbol=symbol,
            direction=direction,
            signal_type=SignalType.SIGNATURE_TRADE,
            entry_price=round(entry, 2),
            stop_loss=round(sl, 2),
            take_profit=round(tp, 2),
            lot_size=lot_size,
            confidence=85.0,
            induction_state=state,
        )
