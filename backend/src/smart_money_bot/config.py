"""
╔══════════════════════════════════════════════════════════════════════╗
║      SMART MONEY BOT — MASTER CONFIGURATION                         ║
║   All hardcoded institutional rules live here.  NO retail garbage.    ║
║                                                                      ║
║   APEX 100K INTRADAY TRAIL RULES                                     ║
║   • Account size:       $100,000                                     ║
║   • Trailing threshold: $3,000  (max drawdown from equity peak)      ║
║   • Max risk per trade: 2 % OR $300 hard cap (whichever is LESS)     ║
║   • Max contracts:      4 MNQ  (conservative for $300 SL)            ║
║   • Intraday only:      all positions closed by 16:00 ET / 21:00 UTC ║
║   • MNQ tick value:     $0.50  (1 point = 4 ticks = $2.00)           ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

from dataclasses import dataclass, field


# ─────────────────────────────────────────────────────────────────────
#  APEX ACCOUNT RULES — HARDCODED, DO NOT CHANGE
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class ApexAccountConfig:
    """APEX 100K Intraday Trail account rules."""
    account_size: float = 100_000.0
    trailing_drawdown: float = 3_000.0          # max trailing drawdown
    max_contracts_mnq: int = 14                  # APEX 100K limit for MNQ
    intraday_close_hour_utc: int = 21            # 4:00 PM ET = 21:00 UTC


# ─────────────────────────────────────────────────────────────────────
#  RISK MANAGEMENT — STRICT RULES TO PROTECT THE ACCOUNT
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class RiskConfig:
    # ── Per-trade risk ──
    max_risk_per_trade_pct: float = 0.02        # 2 % of equity
    max_risk_per_trade_usd: float = 300.0        # HARD CAP: $300 max loss per trade
    max_sl_points: float = 20.0                  # 20 NQ points max SL for scalping (was 60)

    # ── Position sizing ──
    default_contracts: int = 2                   # scalping: 2 MNQ default
    max_contracts: int = 4                       # never more than 4 MNQ per trade

    # ── Daily limits ──
    max_trades_per_day: int = 10                 # scalping: more trades allowed (was 3)
    max_daily_loss_usd: float = 600.0            # stop trading if day loss > $600
    # This is 20% of the trailing drawdown ($3,000). Conservative.

    # ── Bracket order defaults (in ticks, 1 tick = 0.25 pts for MNQ) ──
    default_sl_ticks: int = 40                   # 10 points = 40 ticks → $20/contract (scalp)
    default_tp_ticks: int = 80                   # 20 points = 80 ticks (2:1 R:R scalp)
    min_sl_ticks: int = 8                        # 2 points minimum SL
    max_sl_ticks: int = 80                       # 20 points maximum SL (scalp)

    # ── MNQ contract specs ──
    tick_size: float = 0.25                      # MNQ tick size
    tick_value: float = 0.50                     # $0.50 per tick per contract
    point_value: float = 2.00                    # $2.00 per point per contract (4 ticks)

    # ── Breakeven / trailing ──
    breakeven_after_points: float = 15.0         # move SL to BE after +15 pts
    trailing_stop_points: float = 10.0           # trail by 10 pts once in profit


# ─────────────────────────────────────────────────────────────────────
#  SESSION TIMES (UTC) — THE HEGELIAN DIALECTIC CLOCK
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class SessionConfig:
    # Asian Session  — Consolidation (Problem)
    asian_start: int = 0     # 00:00 UTC
    asian_end: int = 8       # 08:00 UTC

    # London Session — Reaction / Induction (Antithesis)
    london_start: int = 8    # 08:00 UTC
    london_end: int = 13     # 13:00 UTC

    # New York Session — Solution / Reversal (Synthesis)
    ny_start: int = 13       # 13:00 UTC
    ny_end: int = 21         # 21:00 UTC

    # Kill zones — highest probability sub-windows
    london_killzone_start: int = 8
    london_killzone_end: int = 10
    ny_killzone_start: int = 14
    ny_killzone_end: int = 16


# ─────────────────────────────────────────────────────────────────────
#  WEEKLY 5-ACT STRUCTURE — THE INSTITUTIONAL PLAYBOOK
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class WeeklyActConfig:
    """
    Act 1 (Sun/Mon) — Connector / Induction
    Act 2 (Tue)     — Accumulation
    Act 3 (Wed)     — Reversal (KEY DAY)
    Act 4 (Thu)     — Distribution
    Act 5 (Fri)     — Epilogue (reduce risk, close early)
    """
    connector_days: tuple[int, ...] = (6, 0)   # Sun=6, Mon=0
    accumulation_day: int = 1                    # Tue
    reversal_day: int = 2                        # Wed
    distribution_day: int = 3                    # Thu
    epilogue_day: int = 4                        # Fri


# ─────────────────────────────────────────────────────────────────────
#  SIGNATURE TRADE DETECTION PARAMETERS
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class SignatureTradeConfig:
    min_consolidation_candles: int = 3          # was 6 — 3 candles enough for scalping wedge
    wedge_slope_threshold: float = 0.8          # was 0.3 — much more lenient slope check
    stop_hunt_wick_multiplier: float = 0.8      # was 1.5 — smaller wicks count as hunts
    stop_hunt_lookback: int = 10                # was 20 (hardcoded) — shorter zone for scalps
    exhaustion_body_ratio: float = 0.5          # was 0.4 — more candles qualify
    min_induction_pct: float = 60.0             # % of retail trapped before entry


# ─────────────────────────────────────────────────────────────────────
#  CANDLESTICK ANATOMY SCANNER
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class CandleScannerConfig:
    railroad_body_ratio: float = 1.5
    star_wick_multiplier: float = 2.0
    engulfing_overlap_pct: float = 0.75


# ─────────────────────────────────────────────────────────────────────
#  MARKET STRUCTURE
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class MarketStructureConfig:
    swing_lookback: int = 20
    order_block_lookback: int = 50
    atr_period: int = 14
    psych_level_interval: float = 100.0         # NAS100: every 100 points


# ─────────────────────────────────────────────────────────────────────
#  AGGREGATE CONFIG
# ─────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Config:
    apex: ApexAccountConfig = field(default_factory=ApexAccountConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)
    session: SessionConfig = field(default_factory=SessionConfig)
    weekly: WeeklyActConfig = field(default_factory=WeeklyActConfig)
    signature: SignatureTradeConfig = field(default_factory=SignatureTradeConfig)
    candle_scanner: CandleScannerConfig = field(default_factory=CandleScannerConfig)
    market_structure: MarketStructureConfig = field(default_factory=MarketStructureConfig)
    symbol: str = "NAS100"


CONFIG = Config()
