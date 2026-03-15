"""
╔══════════════════════════════════════════════════════════════════════╗
║      NQ-TRADING AGENTS — PYDANTIC SCHEMAS & ENUMS                     ║
║   Every data contract lives here.                                    ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Session & Phase Enums ────────────────────────────────────────────
class SessionPhase(str, Enum):
    ASIAN_CONSOLIDATION = "ASIAN_CONSOLIDATION"
    LONDON_INDUCTION = "LONDON_INDUCTION"
    NY_REVERSAL = "NY_REVERSAL"
    OFF_SESSION = "OFF_SESSION"


class WeeklyAct(str, Enum):
    CONNECTOR = "CONNECTOR"
    ACCUMULATION = "ACCUMULATION"
    REVERSAL = "REVERSAL"
    DISTRIBUTION = "DISTRIBUTION"
    EPILOGUE = "EPILOGUE"


class InductionState(str, Enum):
    NO_PATTERN = "NO_PATTERN"
    WEDGE_FORMING = "WEDGE_FORMING"
    TRIANGLE_FORMING = "TRIANGLE_FORMING"
    FALSE_BREAKOUT = "FALSE_BREAKOUT"
    STOP_HUNT_ACTIVE = "STOP_HUNT_ACTIVE"
    EXHAUSTION_DETECTED = "EXHAUSTION_DETECTED"
    REVERSAL_CONFIRMED = "REVERSAL_CONFIRMED"


class TradeDirection(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class TradeStatus(str, Enum):
    PENDING = "PENDING"
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    REJECTED = "REJECTED"


class SignalType(str, Enum):
    SIGNATURE_TRADE = "SIGNATURE_TRADE"
    RAILROAD_TRACKS = "RAILROAD_TRACKS"
    STAR_PATTERN = "STAR_PATTERN"
    STOP_HUNT_REVERSAL = "STOP_HUNT_REVERSAL"
    TRADOVATE_FILL = "TRADOVATE_FILL"


class MarketTrend(str, Enum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    RANGING = "RANGING"


class VolatilityState(str, Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    EXTREME = "EXTREME"


# ── Data Models ──────────────────────────────────────────────────────
class CandleData(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


class LiquidityZone(BaseModel):
    price_low: float
    price_high: float
    zone_type: str  # "buy_side" | "sell_side"
    strength: float = 0.0
    tested: bool = False


class TradeSignal(BaseModel):
    signal_id: str
    symbol: str
    direction: TradeDirection
    signal_type: SignalType
    entry_price: float
    stop_loss: float
    take_profit: float
    lot_size: float
    confidence: float = 0.0
    induction_state: InductionState = InductionState.NO_PATTERN
    session_phase: SessionPhase = SessionPhase.OFF_SESSION
    weekly_act: WeeklyAct = WeeklyAct.CONNECTOR
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    description: str = ""
    thesis: str = ""
    confluence_factors: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class TradeRecord(BaseModel):
    trade_id: str
    symbol: str
    direction: TradeDirection
    entry_price: float
    stop_loss: float
    take_profit: float | None = None
    lot_size: float
    status: TradeStatus = TradeStatus.PENDING
    opened_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    closed_at: datetime | None = None
    pnl: float = 0.0
    signal_type: SignalType = SignalType.SIGNATURE_TRADE
    metadata: dict = Field(default_factory=dict)


class AccountState(BaseModel):
    balance: float = 100_000.0
    equity: float = 100_000.0
    free_margin: float = 100_000.0
    leverage: int = 100
    open_positions: int = 0
    daily_pnl: float = 0.0


class MarketStructureData(BaseModel):
    symbol: str
    trend: MarketTrend = MarketTrend.RANGING
    trend_strength: float = 0.0
    volatility: VolatilityState = VolatilityState.NORMAL
    atr: float = 0.0
    bias_score: float = 0.0
    support_levels: list[float] = Field(default_factory=list)
    resistance_levels: list[float] = Field(default_factory=list)
    liquidity_zones: list[LiquidityZone] = Field(default_factory=list)
    psych_levels: list[float] = Field(default_factory=list)


class AIAdvisoryState(BaseModel):
    """Snapshot of the AI advisory engine state for dashboard display."""
    enabled: bool = False
    last_verdict: str = ""             # "APPROVE" or "REJECT"
    last_confidence: str = ""          # "high", "medium", "low"
    last_action: str = ""              # "BUY", "SELL", "HOLD"
    last_reasoning: str = ""
    signals_reviewed: int = 0
    signals_approved: int = 0
    signals_rejected: int = 0


class DashboardState(BaseModel):
    account: AccountState = Field(default_factory=AccountState)
    symbol: str = "NAS100"
    current_price: float = 0.0
    session_phase: SessionPhase = SessionPhase.OFF_SESSION
    weekly_act: WeeklyAct = WeeklyAct.CONNECTOR
    induction_state: InductionState = InductionState.NO_PATTERN
    induction_meter: float = 0.0
    is_killzone: bool = False
    trading_permitted: bool = False
    pending_signals: list[TradeSignal] = Field(default_factory=list)
    trade_history: list[TradeRecord] = Field(default_factory=list)
    liquidity_zones: list[LiquidityZone] = Field(default_factory=list)
    market_structure: MarketStructureData | None = None
    ai_advisory: AIAdvisoryState = Field(default_factory=AIAdvisoryState)
