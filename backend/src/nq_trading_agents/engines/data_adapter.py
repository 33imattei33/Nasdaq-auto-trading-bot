"""
╔══════════════════════════════════════════════════════════════════════╗
║      DATA ADAPTER — Bridge between internal data and LLM agents      ║
║                                                                      ║
║   Converts our internal CandleData / MarketStructureData into the    ║
║   text reports that analyst LLM nodes expect.                        ║
║                                                                      ║
║   This lets us inject OUR pre-computed analysis into the LLM agent   ║
║   graph instead of fetching external data.                           ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

from datetime import datetime

from nq_trading_agents.models.schemas import (
    CandleData,
    TradeSignal,
    InductionState,
    LiquidityZone,
    MarketStructureData,
    SessionPhase,
    WeeklyAct,
)


class NQDataAdapter:
    """Converts NQ-Trading Agents's internal state into text context
    that the LLM analyst agents can reason about."""

    @staticmethod
    def candles_to_summary(candles: list[CandleData], n_recent: int = 20) -> str:
        """Summarise the last N candles into a readable market data block."""
        if not candles:
            return "No candle data available."

        recent = candles[-n_recent:]
        highs = [c.high for c in recent]
        lows = [c.low for c in recent]
        closes = [c.close for c in recent]

        range_high = max(highs)
        range_low = min(lows)
        latest = recent[-1]

        # Simple ATR approximation
        true_ranges: list[float] = []
        for i in range(1, len(recent)):
            tr = max(
                recent[i].high - recent[i].low,
                abs(recent[i].high - recent[i - 1].close),
                abs(recent[i].low - recent[i - 1].close),
            )
            true_ranges.append(tr)
        atr = sum(true_ranges) / len(true_ranges) if true_ranges else 0.0

        # Trend: compare first half average to second half
        mid = len(closes) // 2
        first_avg = sum(closes[:mid]) / mid if mid > 0 else 0
        second_avg = sum(closes[mid:]) / (len(closes) - mid) if (len(closes) - mid) > 0 else 0
        trend = "bullish" if second_avg > first_avg else "bearish" if second_avg < first_avg else "flat"

        return (
            f"## MNQ Futures — Last {len(recent)} Candles\n"
            f"- Latest close: {latest.close:,.2f}\n"
            f"- Range: {range_low:,.2f} – {range_high:,.2f} ({range_high - range_low:.1f} pts)\n"
            f"- ATR (approx): {atr:.1f} pts\n"
            f"- Short-term trend: {trend}\n"
            f"- Latest candle: O={latest.open:.2f} H={latest.high:.2f} "
            f"L={latest.low:.2f} C={latest.close:.2f} V={latest.volume:.0f}\n"
        )

    @staticmethod
    def market_structure_to_report(ms: MarketStructureData | None) -> str:
        """Convert MarketStructureData into a text report for LLM agents."""
        if ms is None:
            return "Market structure data unavailable."

        lines = [
            f"## Market Structure Report — {ms.symbol}",
            f"- Trend: {ms.trend.value} (strength: {ms.trend_strength:.1f})",
            f"- Volatility: {ms.volatility.value}",
            f"- ATR: {ms.atr:.1f} points",
            f"- Directional Bias: {ms.bias_score:+.1f}",
        ]

        if ms.support_levels:
            levels = ", ".join(f"{s:,.2f}" for s in ms.support_levels[:5])
            lines.append(f"- Key supports: {levels}")

        if ms.resistance_levels:
            levels = ", ".join(f"{r:,.2f}" for r in ms.resistance_levels[:5])
            lines.append(f"- Key resistances: {levels}")

        if ms.liquidity_zones:
            lines.append(f"- Liquidity zones: {len(ms.liquidity_zones)} identified")
            for z in ms.liquidity_zones[:5]:
                lines.append(
                    f"  • {z.zone_type} zone: {z.price_low:,.2f}–{z.price_high:,.2f} "
                    f"(strength {z.strength:.1f})"
                )

        return "\n".join(lines)

    @staticmethod
    def session_context_to_report(
        phase: SessionPhase,
        act: WeeklyAct,
        induction: InductionState,
        induction_meter: float,
        is_killzone: bool,
        now: datetime,
    ) -> str:
        """Build a session-context report for the AI agents."""
        session_labels = {
            SessionPhase.NY_REVERSAL: "New York Session — Reversal (Synthesis)",
            SessionPhase.LONDON_INDUCTION: "London Session — Induction (Antithesis)",
            SessionPhase.ASIAN_CONSOLIDATION: "Asian Session — Consolidation (Thesis)",
            SessionPhase.OFF_SESSION: "Off-Session (no trading)",
        }
        weekly_labels = {
            WeeklyAct.CONNECTOR: "Monday — Connector (sets weekly range)",
            WeeklyAct.ACCUMULATION: "Tuesday — Accumulation (high probability)",
            WeeklyAct.REVERSAL: "Wednesday — Reversal (mid-week pivot)",
            WeeklyAct.DISTRIBUTION: "Thursday — Distribution (continuation)",
            WeeklyAct.EPILOGUE: "Friday — Epilogue (reduced risk)",
        }

        return (
            f"## Session & Weekly Context\n"
            f"- UTC time: {now.strftime('%Y-%m-%d %H:%M UTC')}\n"
            f"- Session phase: {session_labels.get(phase, phase.value)}\n"
            f"- Weekly act: {weekly_labels.get(act, act.value)}\n"
            f"- Kill zone active: {'YES' if is_killzone else 'NO'}\n"
            f"- Induction state: {induction.value}\n"
            f"- Retail trap meter: {induction_meter:.1f}%\n"
        )

    @staticmethod
    def signal_to_proposal(signal: TradeSignal) -> str:
        """Convert a TradeSignal into a text trade proposal for AI review."""
        sl_dist = abs(signal.entry_price - signal.stop_loss)
        tp_dist = abs(signal.take_profit - signal.entry_price) if signal.take_profit else 0
        rr = tp_dist / sl_dist if sl_dist > 0 else 0

        factors = "\n".join(f"  • {f}" for f in signal.confluence_factors) if signal.confluence_factors else "  (none)"

        return (
            f"## Trade Proposal for AI Review\n"
            f"- Signal ID: {signal.signal_id}\n"
            f"- Direction: {signal.direction.value}\n"
            f"- Type: {signal.signal_type.value}\n"
            f"- Entry: {signal.entry_price:,.2f}\n"
            f"- Stop Loss: {signal.stop_loss:,.2f} ({sl_dist:.1f} pts risk)\n"
            f"- Take Profit: {signal.take_profit:,.2f} ({tp_dist:.1f} pts target)\n"
            f"- Risk:Reward = 1:{rr:.1f}\n"
            f"- Contracts: {signal.lot_size:.0f}\n"
            f"- Confidence: {signal.confidence:.0%}\n"
            f"- Thesis: {signal.thesis}\n"
            f"- Confluence factors:\n{factors}\n"
        )

    @staticmethod
    def build_full_context(
        candles: list[CandleData],
        market_structure: MarketStructureData | None,
        signal: TradeSignal,
        phase: SessionPhase,
        act: WeeklyAct,
        induction: InductionState,
        induction_meter: float,
        is_killzone: bool,
        now: datetime,
    ) -> str:
        """Build a complete context string for the AI advisory agents."""
        adapter = NQDataAdapter
        parts = [
            adapter.candles_to_summary(candles),
            adapter.market_structure_to_report(market_structure),
            adapter.session_context_to_report(phase, act, induction, induction_meter, is_killzone, now),
            adapter.signal_to_proposal(signal),
        ]
        return "\n---\n\n".join(parts)
