"""
╔══════════════════════════════════════════════════════════════════════╗
║      SMART MONEY BOT — ORCHESTRATOR                                  ║
║   Central nervous system. Every scan cycle flows through here.       ║
║                                                                      ║
║   Pipeline:                                                          ║
║   1. Session Phase  → Is it NY reversal kill zone?                   ║
║   2. Weekly Act     → High-probability day?                          ║
║   3. Market Struct. → Trend, liquidity, support/resistance           ║
║   4. Candle Scanner → Railroad tracks, star patterns                 ║
║   5. Signature Det. → Wedge → Stop Hunt → Exhaustion → Reversal     ║
║   6. Risk Manager   → Lot size, SL validation, daily limit          ║
║   7. Broker         → EXECUTE                                        ║
║                                                                      ║
║   Every step must pass. One failure = no trade.                      ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from smart_money_bot.config import CONFIG
from smart_money_bot.engines.hegelian_engine import HegelianDialecticEngine
from smart_money_bot.engines.weekly_structure import WeeklyStructureEngine
from smart_money_bot.engines.market_structure import MarketStructureAnalyzer
from smart_money_bot.engines.candle_scanner import CandlestickAnatomyScanner
from smart_money_bot.engines.signature_trade import SignatureTradeDetector
from smart_money_bot.models.schemas import (
    AccountState,
    CandleData,
    DashboardState,
    ForexiaSignal,
    InductionState,
    LiquidityZone,
    MarketStructureData,
    SessionPhase,
    TradeDirection,
    TradeRecord,
    TradeStatus,
    WeeklyAct,
)

log = logging.getLogger(__name__)


class Orchestrator:
    """Central scan-evaluate-execute loop."""

    def __init__(self, broker=None) -> None:
        # Engines
        self.dialectic = HegelianDialecticEngine()
        self.weekly = WeeklyStructureEngine()
        self.structure = MarketStructureAnalyzer()
        self.scanner = CandlestickAnatomyScanner()
        self.signature = SignatureTradeDetector()

        # Broker (paper or Tradovate)
        self.broker = broker

        # State
        self._account = AccountState()
        self._active_signals: list[ForexiaSignal] = []
        self._trade_history: list[TradeRecord] = []
        self._candle_cache: list[CandleData] = []
        self._market_structure: MarketStructureData | None = None
        self._liquidity_zones: list[LiquidityZone] = []
        self._trade_timestamps: list[datetime] = []
        self._start_time = datetime.now(timezone.utc)

    # ── Risk ─────────────────────────────────────────────────────────
    def _calculate_contracts(self, sl_distance_points: float) -> int:
        """Calculate MNQ contracts based on $300 max SL and 2% equity.

        Formula:
            max_risk_usd = min($300, equity × 2%)
            risk_per_contract = sl_distance_points × $2.00 (point_value)
            contracts = floor(max_risk_usd / risk_per_contract)
            cap at max_contracts (4)
        """
        risk = CONFIG.risk
        equity = self._account.equity

        # Two caps: 2% of equity AND hard $300 limit
        pct_risk = equity * risk.max_risk_per_trade_pct
        max_risk_usd = min(pct_risk, risk.max_risk_per_trade_usd)

        if sl_distance_points <= 0:
            return risk.default_contracts

        risk_per_contract = sl_distance_points * risk.point_value
        if risk_per_contract <= 0:
            return risk.default_contracts

        qty = int(max_risk_usd / risk_per_contract)
        qty = max(1, min(qty, risk.max_contracts))

        log.info(
            f"Position sizing: equity=${equity:,.0f}, "
            f"max_risk=${max_risk_usd:.0f}, SL={sl_distance_points:.1f}pts, "
            f"risk/contract=${risk_per_contract:.0f}, contracts={qty}"
        )
        return qty

    def _is_daily_limit_reached(self, now: datetime) -> bool:
        today = now.date()
        count = sum(1 for ts in self._trade_timestamps if ts.date() == today)
        return count >= CONFIG.risk.max_trades_per_day

    def _get_daily_pnl(self) -> float:
        """Return today's realized P&L from the account state."""
        return self._account.daily_pnl

    def _is_daily_loss_exceeded(self) -> bool:
        """Check if daily loss exceeds the max daily loss limit."""
        return self._get_daily_pnl() < -CONFIG.risk.max_daily_loss_usd

    def _validate_stop_loss(self, entry: float, sl: float, direction: TradeDirection,
                            contracts: int = 1) -> tuple[bool, str]:
        """Validate SL meets ALL APEX safety rules.

        Returns (ok, reason) — if not ok, reason explains why.
        """
        risk = CONFIG.risk

        if entry <= 0:
            return False, "Invalid entry price"

        # Distance in points
        if direction == TradeDirection.BUY:
            sl_distance = entry - sl
        else:
            sl_distance = sl - entry

        if sl_distance <= 0:
            return False, "SL is on wrong side of entry"

        # Rule 1: SL distance in points
        if sl_distance > risk.max_sl_points:
            return False, f"SL distance {sl_distance:.1f} pts > max {risk.max_sl_points} pts"

        # Rule 2: Dollar risk check
        dollar_risk = sl_distance * risk.point_value * contracts
        if dollar_risk > risk.max_risk_per_trade_usd:
            return False, f"Dollar risk ${dollar_risk:.0f} > max ${risk.max_risk_per_trade_usd:.0f}"

        # Rule 3: Percentage risk check
        pct_risk = dollar_risk / self._account.equity if self._account.equity > 0 else 1.0
        if pct_risk > risk.max_risk_per_trade_pct:
            return False, f"Risk {pct_risk:.2%} > max {risk.max_risk_per_trade_pct:.0%}"

        # Rule 4: Trailing drawdown protection
        apex = CONFIG.apex
        remaining_buffer = apex.trailing_drawdown - abs(min(0, self._account.daily_pnl))
        if dollar_risk > remaining_buffer * 0.5:
            return False, (
                f"Dollar risk ${dollar_risk:.0f} > 50% of remaining "
                f"drawdown buffer ${remaining_buffer:.0f}"
            )

        return True, "OK"

    def _is_intraday_close_time(self, now: datetime) -> bool:
        """Check if we're past the APEX intraday close deadline."""
        return now.hour >= CONFIG.apex.intraday_close_hour_utc

    # ── Feed candles ─────────────────────────────────────────────────
    def feed_candles(self, candles: list[CandleData]) -> None:
        self._candle_cache = candles
        self._market_structure = self.structure.analyze(CONFIG.symbol, candles)
        self._liquidity_zones = self._market_structure.liquidity_zones

    # ── Main scan cycle ──────────────────────────────────────────────
    def scan(self, now: datetime | None = None, *, force: bool = False) -> ForexiaSignal | None:
        """Run the full scan pipeline.

        When *force* is True the session / killzone / daily-limit gates
        are skipped.  Useful for testing outside NY hours.
        """
        now = now or datetime.now(timezone.utc)
        candles = self._candle_cache

        # 1. Session gate
        phase = self.dialectic.get_current_phase(now)
        if not force:
            if phase not in (SessionPhase.NY_REVERSAL, SessionPhase.LONDON_INDUCTION):
                log.debug(f"Session={phase.value} — skipping (need NY or London)")
                return None

            if not self.dialectic.is_killzone(now):
                log.debug("Outside kill zone — skipping")
                return None

        # 2. Weekly act gate
        act = self.weekly.get_current_act(now)
        if not force and self.weekly.should_reduce_risk(now):
            log.debug("Friday epilogue — reduced risk, skipping")
            return None

        # Friday NY session: trade with reduced size (max 2 contracts)
        is_friday_ny = (act == WeeklyAct.EPILOGUE and not self.weekly.should_reduce_risk(now))
        if is_friday_ny:
            log.info("Friday NY kill zone — trading with reduced size")

        # 3. Daily limit gate
        if not force and self._is_daily_limit_reached(now):
            log.debug("Daily trade limit reached")
            return None

        # 3b. Daily loss gate
        if not force and self._is_daily_loss_exceeded():
            log.warning(f"Daily loss ${self._get_daily_pnl():.0f} exceeds limit — NO MORE TRADES TODAY")
            return None

        # 3c. Intraday close gate — no new trades near close
        if not force and self._is_intraday_close_time(now):
            log.warning("Past APEX intraday close time — no new trades")
            return None

        # 4. Need candles
        if len(candles) < 25:
            log.info(f"Scan: not enough candles ({len(candles)} < 25)")
            return None

        log.info(
            f"Scan: {len(candles)} candles | phase={phase.value} | "
            f"force={force} | last_close={candles[-1].close:.2f}"
        )

        # 5. Signature trade detection
        state = self.signature.evaluate(candles)
        log.info(f"Scan: induction_state={state.value}")
        if state != InductionState.REVERSAL_CONFIRMED:
            return None

        # 6. Build signal
        # First get a preliminary signal to know entry / SL distance
        signal_id = f"SM-{uuid.uuid4().hex[:10].upper()}"
        signal = self.signature.generate_signal(candles, CONFIG.symbol, 1, signal_id)

        if signal is None:
            return None

        # Calculate SL distance in points
        if signal.direction == TradeDirection.BUY:
            sl_distance_pts = signal.entry_price - signal.stop_loss
        else:
            sl_distance_pts = signal.stop_loss - signal.entry_price

        # Calculate correct position size from risk rules
        contracts = self._calculate_contracts(sl_distance_pts)

        # Friday NY: cap at 2 contracts for reduced risk
        if is_friday_ny:
            contracts = min(contracts, 2)
            log.info(f"Friday NY: capped contracts to {contracts}")

        signal.lot_size = float(contracts)

        # 7. Validate SL against ALL APEX safety rules
        sl_ok, sl_reason = self._validate_stop_loss(
            signal.entry_price, signal.stop_loss, signal.direction, contracts
        )
        if not sl_ok:
            log.warning(f"Stop loss REJECTED: {sl_reason}")
            return None

        signal.session_phase = phase
        signal.weekly_act = act

        # 8. Record the signal (execution is handled by the caller)
        self._active_signals.append(signal)
        trade = TradeRecord(
            trade_id=signal.signal_id,
            symbol=signal.symbol,
            direction=signal.direction,
            entry_price=signal.entry_price,
            stop_loss=signal.stop_loss,
            take_profit=signal.take_profit,
            lot_size=signal.lot_size,
            status=TradeStatus.PENDING,
            signal_type=signal.signal_type,
        )
        self._trade_history.append(trade)

        log.info(
            f"✓ SIGNAL GENERATED: {trade.trade_id} "
            f"{trade.direction.value} @ {trade.entry_price} "
            f"SL={trade.stop_loss} TP={trade.take_profit}"
        )
        return signal

    def record_execution(self, signal_id: str, success: bool) -> None:
        """Mark a signal's trade record as OPEN or REJECTED after execution."""
        now = datetime.now(timezone.utc)
        for trade in reversed(self._trade_history):
            if trade.trade_id == signal_id:
                if success:
                    trade.status = TradeStatus.OPEN
                    self._trade_timestamps.append(now)
                    self._account.open_positions += 1
                else:
                    trade.status = TradeStatus.REJECTED
                break

    # ── Dashboard state ──────────────────────────────────────────────
    async def get_dashboard_state(self) -> DashboardState:
        now = datetime.now(timezone.utc)
        phase = self.dialectic.get_current_phase(now)
        act = self.weekly.get_current_act(now)
        is_kz = self.dialectic.is_killzone(now)
        trading_ok = self.dialectic.is_trading_permitted(now) and not self._is_daily_limit_reached(now)

        induction = self.signature.induction_state
        meter = 0.0
        if self._candle_cache:
            candle_models = self._candle_cache
            meter = self.dialectic.calculate_induction_meter(candle_models)

        return DashboardState(
            account=self._account,
            symbol=CONFIG.symbol,
            current_price=self._candle_cache[-1].close if self._candle_cache else 0.0,
            session_phase=phase,
            weekly_act=act,
            induction_state=induction,
            induction_meter=meter,
            is_killzone=is_kz,
            trading_permitted=trading_ok,
            pending_signals=self._active_signals[-10:],
            trade_history=self._trade_history[-20:],
            liquidity_zones=self._liquidity_zones[:20],
            market_structure=self._market_structure,
        )
