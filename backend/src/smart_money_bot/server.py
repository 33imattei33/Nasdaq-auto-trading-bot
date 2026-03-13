"""
╔══════════════════════════════════════════════════════════════════════╗
║      SMART MONEY BOT — FASTAPI SERVER                                ║
║                                                                      ║
║   Connects DIRECTLY to Tradovate (https://trader.tradovate.com/)     ║
║   • REST auth → access token                                        ║
║   • WebSocket streams for real-time quotes + chart candles           ║
║   • WebSocket user sync for positions, orders, fills                 ║
║   • Live account data (balance, equity, P&L)                         ║
║   • Bracket orders with SL + TP                                      ║
║   • Falls back to paper broker if credentials are missing            ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yfinance as yf

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load .env from backend/ directory
_env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_env_path)

from smart_money_bot.models.schemas import DashboardState, SessionPhase, CandleData
from smart_money_bot.config import CONFIG
from smart_money_bot.orchestrator import Orchestrator
from smart_money_bot.infrastructure.brokers.paper_broker import PaperBroker
from smart_money_bot.infrastructure.brokers.tradovate_broker import (
    TradovateBroker,
    TradovateConfig,
)

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ═══════════════════════════════════════════════════════════════════════
#  BROKER BOOTSTRAP
# ═══════════════════════════════════════════════════════════════════════

_cfg = TradovateConfig.from_env()
_tradovate_ready = bool(
    _cfg.username and _cfg.password and _cfg.cid and _cfg.sec
)

broker: TradovateBroker | PaperBroker
_is_live = False

if _tradovate_ready:
    try:
        _tv = TradovateBroker(_cfg)
        _tv.authenticate()
        broker = _tv
        _is_live = True
        print("✓ Tradovate broker authenticated")
        print(f"  Account: {_tv._account_spec} (id={_tv._account_id})")
        print(f"  Mode: {'LIVE' if _cfg.live else 'DEMO'}")
    except Exception as e:
        print(f"⚠ Tradovate auth failed ({e}) — falling back to paper broker")
        broker = PaperBroker()
else:
    broker = PaperBroker()
    if _cfg.username and _cfg.password and not (_cfg.cid and _cfg.sec):
        print("⚠ Tradovate credentials found but CID/SEC missing — paper mode")
        print("  To enable API login: set TRADOVATE_CID and TRADOVATE_SEC (or TRADOVATE_SECRET) in .env")
        print("  Or use Browser Login from the dashboard Settings panel")
    else:
        print("⚠ No Tradovate credentials – running paper broker")
    print("  Connect from the dashboard → Settings (gear icon) → Browser Login")

# Orchestrator
orchestrator = Orchestrator(broker=broker)

# Background task handle
_feed_task: asyncio.Task | None = None

# Auto-trade state
_auto_trade_on = False
_auto_trade_task: asyncio.Task | None = None
_auto_trade_stats: dict = {"trades_placed": 0, "scans": 0, "last_signal": None, "started_at": None}

# yfinance history caches (used in BOTH live and paper mode for extended history)
_yf_history: list[CandleData] = []       # 1m bars (~7 days)
_yf_hourly: list[CandleData] = []        # 1h bars (~60 days)
_yf_daily: list[CandleData] = []         # 1d bars (~1 year)
_yf_last_fetch: float = 0
_yf_hourly_last_fetch: float = 0
_yf_daily_last_fetch: float = 0
_YF_HISTORY_INTERVAL = 300       # refresh 1m yfinance every 5 minutes
_YF_HOURLY_INTERVAL = 600       # refresh hourly every 10 minutes
_YF_DAILY_INTERVAL = 1800       # refresh daily every 30 minutes


# ═══════════════════════════════════════════════════════════════════════
#  BACKGROUND FEED LOOP
# ═══════════════════════════════════════════════════════════════════════

async def _candle_feed_loop() -> None:
    """
    Every 10 seconds:
    - Tradovate mode: Pull live candles from WS/REST and feed into orchestrator
    - Paper mode: Generate synthetic candles so the orchestrator can scan
    """
    _rest_fetch_done = False          # only attempt REST once per session

    # ── Paper mode: real NQ futures data via yfinance ──
    _paper_candles: list[CandleData] = []
    _last_fetch_time: float = 0  # epoch seconds of last yfinance fetch
    _YF_TICKER = "NQ=F"  # E-mini Nasdaq-100 Futures
    _YF_REFRESH_SECS = 60  # re-fetch every 60 seconds

    def _fetch_nq_candles() -> list[CandleData]:
        """Fetch real NQ=F 1-min candles from Yahoo Finance."""
        try:
            ticker = yf.Ticker(_YF_TICKER)
            df = ticker.history(period="7d", interval="1m")
            if df.empty:
                log.warning("yfinance returned empty data for NQ=F")
                return []
            candles: list[CandleData] = []
            for ts, row in df.iterrows():
                candles.append(CandleData(
                    timestamp=ts.to_pydatetime().astimezone(timezone.utc),
                    open=round(float(row["Open"]), 2),
                    high=round(float(row["High"]), 2),
                    low=round(float(row["Low"]), 2),
                    close=round(float(row["Close"]), 2),
                    volume=float(row["Volume"]),
                ))
            log.info(f"yfinance: fetched {len(candles)} real NQ=F candles")
            return candles
        except Exception as e:
            log.error(f"yfinance fetch failed: {e}")
            return []

    def _fetch_nq_hourly() -> list[CandleData]:
        """Fetch NQ=F 1-hour candles (60 days) for 1H/4H charts."""
        try:
            ticker = yf.Ticker(_YF_TICKER)
            df = ticker.history(period="60d", interval="1h")
            if df.empty:
                return []
            candles: list[CandleData] = []
            for ts, row in df.iterrows():
                candles.append(CandleData(
                    timestamp=ts.to_pydatetime().astimezone(timezone.utc),
                    open=round(float(row["Open"]), 2),
                    high=round(float(row["High"]), 2),
                    low=round(float(row["Low"]), 2),
                    close=round(float(row["Close"]), 2),
                    volume=float(row["Volume"]),
                ))
            log.info(f"yfinance hourly: fetched {len(candles)} NQ=F 1h bars")
            return candles
        except Exception as e:
            log.error(f"yfinance hourly fetch failed: {e}")
            return []

    def _fetch_nq_daily() -> list[CandleData]:
        """Fetch NQ=F daily candles (1 year) for 1D charts."""
        try:
            ticker = yf.Ticker(_YF_TICKER)
            df = ticker.history(period="1y", interval="1d")
            if df.empty:
                return []
            candles: list[CandleData] = []
            for ts, row in df.iterrows():
                candles.append(CandleData(
                    timestamp=ts.to_pydatetime().astimezone(timezone.utc),
                    open=round(float(row["Open"]), 2),
                    high=round(float(row["High"]), 2),
                    low=round(float(row["Low"]), 2),
                    close=round(float(row["Close"]), 2),
                    volume=float(row["Volume"]),
                ))
            log.info(f"yfinance daily: fetched {len(candles)} NQ=F 1d bars")
            return candles
        except Exception as e:
            log.error(f"yfinance daily fetch failed: {e}")
            return []

    while True:
        try:
            import time as _time
            now_epoch = _time.time()
            global _yf_history, _yf_last_fetch
            global _yf_hourly, _yf_hourly_last_fetch
            global _yf_daily, _yf_daily_last_fetch

            if _is_live and isinstance(broker, TradovateBroker):
                candles = broker.candles

                # ── Fallback: request chart data when WS buffer is empty ──
                if (not candles or len(candles) == 0) and not _rest_fetch_done:
                    log.info("Candle buffer empty — requesting chart via REST fallback")
                    try:
                        candles = await broker.fetch_candles_rest(count=2000)
                        if candles:
                            log.info(f"REST fallback returned {len(candles)} bars")
                        _rest_fetch_done = True
                    except Exception as e:
                        log.warning(f"REST candle fallback failed: {e}")
                        _rest_fetch_done = True

                # ── Feed candles into engines ──
                if candles and len(candles) >= 5:
                    orchestrator.feed_candles(candles)

                # ── Account state update ──
                try:
                    account_state = await broker.get_account_state()
                    orchestrator._account = account_state
                except Exception as e:
                    log.warning(f"Account state update failed: {e}")

                # Update price from live quote
                if broker.last_price > 0:
                    pass  # orchestrator picks it up via candle cache

                # ── Supplement: fetch yfinance history for extended chart ──
                if (now_epoch - _yf_last_fetch) >= _YF_HISTORY_INTERVAL:
                    try:
                        fresh = await asyncio.to_thread(_fetch_nq_candles)
                        if fresh:
                            _yf_history = fresh
                            log.info(f"yfinance history refreshed: {len(fresh)} bars")
                    except Exception as e:
                        log.warning(f"yfinance history fetch failed: {e}")
                    _yf_last_fetch = now_epoch
                if (now_epoch - _yf_hourly_last_fetch) >= _YF_HOURLY_INTERVAL:
                    try:
                        fresh = await asyncio.to_thread(_fetch_nq_hourly)
                        if fresh:
                            _yf_hourly = fresh
                    except Exception as e:
                        log.warning(f"yfinance hourly fetch failed: {e}")
                    _yf_hourly_last_fetch = now_epoch
                if (now_epoch - _yf_daily_last_fetch) >= _YF_DAILY_INTERVAL:
                    try:
                        fresh = await asyncio.to_thread(_fetch_nq_daily)
                        if fresh:
                            _yf_daily = fresh
                    except Exception as e:
                        log.warning(f"yfinance daily fetch failed: {e}")
                    _yf_daily_last_fetch = now_epoch

            else:
                # ── Paper mode: real NQ futures data from Yahoo Finance ──

                # Fetch/refresh real candles periodically
                if not _paper_candles or (now_epoch - _last_fetch_time) >= _YF_REFRESH_SECS:
                    fresh = await asyncio.to_thread(_fetch_nq_candles)
                    if fresh:
                        _paper_candles = fresh
                    _last_fetch_time = now_epoch

                # Also fetch hourly/daily caches for extended TF charts
                if (now_epoch - _yf_hourly_last_fetch) >= _YF_HOURLY_INTERVAL:
                    try:
                        fresh = await asyncio.to_thread(_fetch_nq_hourly)
                        if fresh:
                            _yf_hourly = fresh
                    except Exception as e:
                        log.warning(f"yfinance hourly fetch failed: {e}")
                    _yf_hourly_last_fetch = now_epoch
                if (now_epoch - _yf_daily_last_fetch) >= _YF_DAILY_INTERVAL:
                    try:
                        fresh = await asyncio.to_thread(_fetch_nq_daily)
                        if fresh:
                            _yf_daily = fresh
                    except Exception as e:
                        log.warning(f"yfinance daily fetch failed: {e}")
                    _yf_daily_last_fetch = now_epoch

                # Feed into orchestrator
                if len(_paper_candles) >= 25:
                    orchestrator.feed_candles(_paper_candles)

        except asyncio.CancelledError:
            return
        except Exception as e:
            log.error(f"Feed loop error: {e}")

        await asyncio.sleep(5)


# ═══════════════════════════════════════════════════════════════════════
#  LIFESPAN — START/STOP STREAMS
# ═══════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start WebSocket streams on boot, stop on shutdown."""
    global _feed_task

    if _is_live and isinstance(broker, TradovateBroker):
        try:
            # Discover front-month contract
            symbol = await broker.get_front_month_nq(micro=True)
            print(f"✓ Front-month contract: {symbol}")

            # Start WebSocket streams
            await broker.start_all_streams(symbol)
            print("✓ WebSocket streams started (RT + Market Data)")

        except Exception as e:
            print(f"⚠ Stream start failed: {e} — running without live data")

    # Start background candle feed
    _feed_task = asyncio.create_task(_candle_feed_loop())

    yield  # ← Server is running

    # Shutdown
    if _feed_task:
        _feed_task.cancel()
    if _is_live and isinstance(broker, TradovateBroker):
        await broker.close()


# ═══════════════════════════════════════════════════════════════════════
#  FASTAPI APP
# ═══════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Smart Money NAS100 API",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════════════
#  CORE DASHBOARD
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/dashboard", response_model=DashboardState)
async def get_dashboard():
    """Full dashboard state — merges engine analysis + live Tradovate data."""
    state = await orchestrator.get_dashboard_state()

    # Overlay live market price from Tradovate
    if _is_live and isinstance(broker, TradovateBroker) and broker.last_price > 0:
        state.current_price = broker.last_price

    return state


# ═══════════════════════════════════════════════════════════════════════
#  TRADOVATE ACCOUNT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/account")
async def get_account():
    """Live account data from Tradovate."""
    if _is_live and isinstance(broker, TradovateBroker):
        try:
            acct_state = await broker.get_account_state()
            return {
                "source": "tradovate",
                "account_spec": broker._account_spec,
                "account_id": broker._account_id,
                **acct_state.model_dump(),
            }
        except Exception as e:
            return {"source": "tradovate", "error": str(e)}
    return {"source": "paper", **orchestrator._account.model_dump()}


@app.get("/api/account/raw")
async def get_account_raw():
    """Raw Tradovate account + cash balance data."""
    if not (_is_live and isinstance(broker, TradovateBroker)):
        raise HTTPException(400, "Not connected to Tradovate")
    accounts = await broker.get_accounts()
    balances = await broker.get_cash_balance()
    return {"accounts": accounts, "cashBalances": balances}


@app.get("/api/positions")
async def get_positions():
    """Live positions from Tradovate, or paper trades with OPEN status."""
    if _is_live and isinstance(broker, TradovateBroker):
        positions = await broker.get_positions()
        return {"source": "tradovate", "positions": positions}

    # Paper mode: convert orchestrator's OPEN trades to position-like objects
    open_trades = [
        t for t in orchestrator._trade_history if t.status.value == "OPEN"
    ]
    paper_positions = []
    for i, t in enumerate(open_trades):
        net_pos = int(t.lot_size) if t.direction.value == "BUY" else -int(t.lot_size)
        paper_positions.append({
            "id": i + 1,
            "accountId": 0,
            "contractId": i + 1,
            "timestamp": t.opened_at.isoformat() if t.opened_at else "",
            "tradeDate": {
                "year": t.opened_at.year if t.opened_at else 2026,
                "month": t.opened_at.month if t.opened_at else 1,
                "day": t.opened_at.day if t.opened_at else 1,
            },
            "netPos": net_pos,
            "netPrice": t.entry_price,
            "bought": int(t.lot_size) if t.direction.value == "BUY" else 0,
            "boughtValue": t.entry_price * int(t.lot_size) if t.direction.value == "BUY" else 0,
            "sold": int(t.lot_size) if t.direction.value == "SELL" else 0,
            "soldValue": t.entry_price * int(t.lot_size) if t.direction.value == "SELL" else 0,
            "prevPos": 0,
            "prevPrice": 0,
            # Extra fields for paper trade info
            "trade_id": t.trade_id,
            "stop_loss": t.stop_loss,
            "take_profit": t.take_profit,
        })
    return {"source": "paper", "positions": paper_positions}


@app.get("/api/orders")
async def get_orders():
    """Order history from Tradovate."""
    if _is_live and isinstance(broker, TradovateBroker):
        orders = await broker.get_orders()
        return {"source": "tradovate", "orders": orders}
    return {"source": "paper", "orders": []}


@app.get("/api/fills")
async def get_fills():
    """Fill history from Tradovate."""
    if _is_live and isinstance(broker, TradovateBroker):
        fills = await broker.get_fills()
        return {"source": "tradovate", "fills": fills}
    return {"source": "paper", "fills": []}


# ═══════════════════════════════════════════════════════════════════════
#  MARKET DATA
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/quote")
async def get_quote():
    """Live quote from Tradovate WebSocket."""
    if _is_live and isinstance(broker, TradovateBroker):
        q = dict(broker._last_quote)  # copy
        # Always ensure last/bid/ask keys exist with fallbacks
        if not q.get("last") and broker.candles:
            q["last"] = broker.candles[-1].close
        if not q.get("bid"):
            q["bid"] = q.get("last", 0)
        if not q.get("ask"):
            q["ask"] = q.get("last", 0)
        return {
            "source": "tradovate_ws",
            "symbol": broker._front_month_nq,
            **q,
        }
    # Paper mode: derive from candle cache
    if orchestrator._candle_cache:
        price = orchestrator._candle_cache[-1].close
        return {"source": "candle_cache", "last": price, "bid": price, "ask": price}
    return {"source": "none", "last": 0, "bid": 0, "ask": 0}


# ── Timeframe mapping ────────────────────────────────────────────
_TIMEFRAME_MAP: dict[str, tuple[str, int]] = {
    "1m":  ("MinuteBar", 1),
    "5m":  ("MinuteBar", 5),
    "15m": ("MinuteBar", 15),
    "1H":  ("MinuteBar", 60),
    "4H":  ("MinuteBar", 240),
    "1D":  ("DailyBar",  1),
}

# Minutes per timeframe (for aggregation)
_TF_MINUTES: dict[str, int] = {
    "1m": 1, "5m": 5, "15m": 15, "1H": 60, "4H": 240, "1D": 1440,
}

# Current selected timeframe (server-side state)
_current_tf: str = "1m"


def _merge_yf_and_live(yf_candles: list[CandleData], live_candles: list[CandleData]) -> list[CandleData]:
    """Merge yfinance historical candles with live broker candles.

    Live candles take priority for overlapping timestamps.
    Result is sorted by timestamp, deduplicated by minute.
    """
    by_minute: dict[int, CandleData] = {}
    # yfinance first (lower priority)
    for c in yf_candles:
        ts = int(c.timestamp.timestamp())
        key = ts - (ts % 60)
        by_minute[key] = c
    # Live broker candles overwrite (higher priority — real-time)
    for c in live_candles:
        ts = int(c.timestamp.timestamp())
        key = ts - (ts % 60)
        by_minute[key] = c
    return [by_minute[k] for k in sorted(by_minute)]


def _aggregate_candles(candles_1m: list[CandleData], tf_minutes: int) -> list[CandleData]:
    """Aggregate 1-minute candles into higher timeframes."""
    if tf_minutes <= 1 or not candles_1m:
        return candles_1m

    buckets: dict[int, list[CandleData]] = {}
    for c in candles_1m:
        ts = int(c.timestamp.timestamp())
        bucket = ts - (ts % (tf_minutes * 60))
        buckets.setdefault(bucket, []).append(c)

    result: list[CandleData] = []
    for bucket_ts in sorted(buckets):
        group = buckets[bucket_ts]
        result.append(CandleData(
            timestamp=group[0].timestamp.replace(
                minute=(group[0].timestamp.minute // tf_minutes) * tf_minutes
                if tf_minutes < 60 else 0,
                second=0,
            ) if tf_minutes < 1440 else group[0].timestamp.replace(
                hour=0, minute=0, second=0
            ),
            open=group[0].open,
            high=max(g.high for g in group),
            low=min(g.low for g in group),
            close=group[-1].close,
            volume=sum(g.volume for g in group),
        ))
    return result


def _get_best_bars_for_tf(tf_min: int) -> tuple[list[CandleData], str]:
    """Pick the best data source for a given timeframe.

    Returns (bars, source_label).
    - 1D → use _yf_daily (1 year of daily bars, no aggregation needed)
    - 4H → use _yf_hourly aggregated to 4h (60 days)
    - 1H → use _yf_hourly directly (60 days)
    - <1H → use _yf_history 1m aggregated (7 days)
    """
    if tf_min >= 1440 and _yf_daily:
        return _yf_daily, "yf_daily"
    if tf_min >= 60 and _yf_hourly:
        return _yf_hourly, "yf_hourly"
    return [], ""


class TimeframeRequest(BaseModel):
    timeframe: str  # "1m", "5m", "15m", "1H", "4H", "1D"


@app.post("/api/timeframe")
async def change_timeframe(req: TimeframeRequest):
    """Switch the chart subscription to a different timeframe."""
    global _current_tf
    tf = req.timeframe
    if tf not in _TIMEFRAME_MAP:
        return {
            "ok": False,
            "error": f"Unknown timeframe '{tf}'",
            "valid": list(_TIMEFRAME_MAP.keys()),
        }

    _current_tf = tf

    # Live mode: keep broker on 1m base feed, aggregate server-side
    if _is_live and isinstance(broker, TradovateBroker):
        return {
            "ok": True,
            "timeframe": tf,
            "mode": "server_aggregated",
        }

    # Paper mode — aggregation happens in /api/candles
    return {"ok": True, "timeframe": tf, "mode": "aggregated"}


@app.get("/api/candles")
async def get_candles(limit: int = 10000, tf: str | None = None):
    """OHLCV candle data for charting. ?tf=5m for aggregated timeframes."""
    active_tf = tf or _current_tf
    tf_min = _TF_MINUTES.get(active_tf, 1)

    if _is_live and isinstance(broker, TradovateBroker):
        # For higher TFs, prefer dedicated yfinance caches (more history)
        ht_bars, ht_source = _get_best_bars_for_tf(tf_min)
        if ht_bars:
            bars = list(ht_bars)
            # Aggregate hourly→4H if needed (240 min = 4 hours)
            if tf_min == 240 and ht_source == "yf_hourly":
                bars = _aggregate_candles(bars, 240)
            bars = bars[-limit:]
            return {
                "source": ht_source,
                "symbol": broker._front_month_nq if hasattr(broker, '_front_month_nq') else "NQ=F",
                "timeframe": active_tf,
                "count": len(bars),
                "candles": [
                    {
                        "time": int(c.timestamp.timestamp()),
                        "open": c.open,
                        "high": c.high,
                        "low": c.low,
                        "close": c.close,
                        "volume": c.volume,
                    }
                    for c in bars
                ],
            }

        bars = broker.candles if broker.candles else []

        # If WS buffer is empty, try REST/WS request for chart data
        if not bars:
            log.info("/api/candles: buffer empty, requesting chart data")
            try:
                bars = await broker.fetch_candles_rest(count=limit)
            except Exception as e:
                log.warning(f"/api/candles REST fallback: {e}")
                bars = []

        # Merge with yfinance history for extended chart depth
        if _yf_history:
            bars = _merge_yf_and_live(_yf_history, bars)

        if bars:
            # Aggregate to requested timeframe (broker always feeds 1m)
            if tf_min > 1:
                bars = _aggregate_candles(bars, tf_min)
            bars = bars[-limit:]
            return {
                "source": "tradovate_ws",
                "symbol": broker._front_month_nq,
                "timeframe": active_tf,
                "count": len(bars),
                "candles": [
                    {
                        "time": int(c.timestamp.timestamp()),
                        "open": c.open,
                        "high": c.high,
                        "low": c.low,
                        "close": c.close,
                        "volume": c.volume,
                    }
                    for c in bars
                ],
            }
    # Fallback: use orchestrator candle cache (1m base data)
    # For higher TFs, prefer dedicated yfinance caches (more history)
    ht_bars, ht_source = _get_best_bars_for_tf(tf_min)
    if ht_bars:
        bars = list(ht_bars)
        # Aggregate hourly→4H if needed (240 min = 4 hours)
        if tf_min == 240 and ht_source == "yf_hourly":
            bars = _aggregate_candles(bars, 240)
        bars = bars[-limit:]
        return {
            "source": ht_source,
            "symbol": "NAS100",
            "timeframe": active_tf,
            "count": len(bars),
            "candles": [
                {
                    "time": int(c.timestamp.timestamp()),
                    "open": c.open,
                    "high": c.high,
                    "low": c.low,
                    "close": c.close,
                    "volume": c.volume,
                }
                for c in bars
            ],
        }
    if orchestrator._candle_cache:
        base_bars = orchestrator._candle_cache
        # Aggregate if timeframe > 1m
        if tf_min > 1:
            bars = _aggregate_candles(base_bars, tf_min)[-limit:]
        else:
            bars = base_bars[-limit:]
        return {
            "source": "engine_cache",
            "symbol": "NAS100",
            "timeframe": active_tf,
            "count": len(bars),
            "candles": [
                {
                    "time": int(c.timestamp.timestamp()),
                    "open": c.open,
                    "high": c.high,
                    "low": c.low,
                    "close": c.close,
                    "volume": c.volume,
                }
                for c in bars
            ],
        }
    return {"source": "none", "symbol": "NAS100", "count": 0, "candles": []}


@app.get("/api/contract")
async def get_contract():
    """Current front-month contract info."""
    if _is_live and isinstance(broker, TradovateBroker):
        sym = await broker.get_front_month_nq()
        contract = await broker.find_contract(sym)
        return {
            "symbol": sym,
            "contract_id": broker._front_month_contract_id,
            "details": contract,
        }
    return {"symbol": "NAS100", "contract_id": None, "details": None}


@app.get("/api/contracts/suggest")
async def suggest_contracts(q: str = "NQ"):
    """Search contracts by name."""
    if not (_is_live and isinstance(broker, TradovateBroker)):
        raise HTTPException(400, "Not connected to Tradovate")
    results = await broker.suggest_contracts(q, limit=10)
    return results


# ═══════════════════════════════════════════════════════════════════════
#  ENGINE ANALYSIS
# ═══════════════════════════════════════════════════════════════════════

@app.get("/api/session")
async def get_session():
    """Current Hegelian session phase + kill zone status."""
    now = datetime.now(timezone.utc)
    return {
        "phase": orchestrator.dialectic.get_current_phase(now).value,
        "is_killzone": orchestrator.dialectic.is_killzone(now),
        "trading_permitted": orchestrator.dialectic.is_trading_permitted(now),
        "utc_hour": now.hour,
    }


@app.get("/api/weekly-act")
async def get_weekly_act():
    """Current weekly act in the 5-act structure."""
    now = datetime.now(timezone.utc)
    return {
        "act": orchestrator.weekly.get_current_act(now).value,
        "is_high_probability": orchestrator.weekly.is_high_probability_day(now),
        "should_reduce_risk": orchestrator.weekly.should_reduce_risk(now),
        "weekday": now.strftime("%A"),
    }


@app.get("/api/signals")
async def get_signals():
    """Active trading signals from engine analysis."""
    return [s.model_dump() for s in orchestrator._active_signals[-20:]]


@app.get("/api/liquidity")
async def get_liquidity():
    """Mapped liquidity zones."""
    return [z.model_dump() for z in orchestrator._liquidity_zones[:20]]


@app.get("/api/market-structure")
async def get_market_structure():
    """Computed market structure analysis."""
    if orchestrator._market_structure:
        return orchestrator._market_structure.model_dump()
    return {"symbol": "NAS100", "trend": "RANGING", "message": "No data yet"}


@app.get("/api/bot/diagnostics")
async def bot_diagnostics():
    """Deep diagnostic view of every orchestrator gate and engine state."""
    now = datetime.now(timezone.utc)
    phase = orchestrator.dialectic.get_current_phase(now)
    act = orchestrator.weekly.get_current_act(now)
    is_kz = orchestrator.dialectic.is_killzone(now)
    candle_count = len(orchestrator._candle_cache)
    induction = orchestrator.signature.induction_state

    # Run signature evaluation without side-effects on a copy
    sig_state = None
    wedge = None
    stop_hunt = None
    exhaustion = None
    if candle_count >= 25:
        sig_state = orchestrator.signature.evaluate(orchestrator._candle_cache)
        wedge = orchestrator.signature._detect_wedge(orchestrator._candle_cache)
        stop_hunt = orchestrator.signature._detect_stop_hunt(orchestrator._candle_cache)
        last_c = orchestrator._candle_cache[-1]
        exhaustion = orchestrator.signature._is_exhaustion(last_c)

    gates = {
        "session_phase": phase.value,
        "session_ok": phase in (SessionPhase.NY_REVERSAL, SessionPhase.LONDON_INDUCTION),
        "killzone": is_kz,
        "weekly_act": act.value,
        "friday_skip": orchestrator.weekly.should_reduce_risk(now),
        "daily_limit_reached": orchestrator._is_daily_limit_reached(now),
        "candles_available": candle_count,
        "candles_ok": candle_count >= 25,
    }

    engines = {
        "induction_state": sig_state.value if sig_state else induction.value,
        "wedge_detected": wedge is not None,
        "wedge": {
            "upper_slope": wedge.upper_slope,
            "lower_slope": wedge.lower_slope,
            "contracting": wedge.is_contracting,
        } if wedge else None,
        "stop_hunt_detected": stop_hunt is not None,
        "stop_hunt": {
            "direction": stop_hunt.direction,
            "wick_size": round(stop_hunt.wick_size, 2),
            "zone_breached": round(stop_hunt.zone_breached, 2),
        } if stop_hunt else None,
        "exhaustion_detected": exhaustion,
    }

    return {
        "utc_now": now.isoformat(),
        "gates": gates,
        "engines": engines,
        "account": orchestrator._account.model_dump(),
        "active_signals": len(orchestrator._active_signals),
        "trade_history_count": len(orchestrator._trade_history),
        "config": {
            "apex_account_size": CONFIG.apex.account_size,
            "apex_trailing_drawdown": CONFIG.apex.trailing_drawdown,
            "apex_max_contracts_mnq": CONFIG.apex.max_contracts_mnq,
            "apex_intraday_close_utc": f"{CONFIG.apex.intraday_close_hour_utc}:00 UTC",
            "max_risk_per_trade_pct": f"{CONFIG.risk.max_risk_per_trade_pct:.0%}",
            "max_risk_per_trade_usd": f"${CONFIG.risk.max_risk_per_trade_usd:.0f}",
            "max_sl_points": CONFIG.risk.max_sl_points,
            "max_contracts": CONFIG.risk.max_contracts,
            "max_trades_per_day": CONFIG.risk.max_trades_per_day,
            "max_daily_loss": f"${CONFIG.risk.max_daily_loss_usd:.0f}",
            "default_sl_ticks": CONFIG.risk.default_sl_ticks,
            "default_tp_ticks": CONFIG.risk.default_tp_ticks,
            "tick_value": f"${CONFIG.risk.tick_value}",
            "point_value": f"${CONFIG.risk.point_value}",
            "ny_killzone": f"{CONFIG.session.ny_killzone_start}-{CONFIG.session.ny_killzone_end} UTC",
            "london_killzone": f"{CONFIG.session.london_killzone_start}-{CONFIG.session.london_killzone_end} UTC",
        },
    }


# ═══════════════════════════════════════════════════════════════════════
#  APEX SAFETY LAYER + TRADING — ORDER EXECUTION
# ═══════════════════════════════════════════════════════════════════════

def _apex_safety_check(signal) -> tuple[bool, str, int, int, int]:
    """Final safety gate before ANY order execution.

    Returns (ok, reason, qty, sl_ticks, tp_ticks).
    Enforces:
    - SL dollar cap ($300)
    - Max contracts (4)
    - SL tick bounds (min 16, max 240)
    - Dollar risk recalculation with actual tick values
    """
    risk = CONFIG.risk

    tick_size = risk.tick_size       # 0.25
    tick_value = risk.tick_value     # $0.50

    sl_distance = abs(signal.entry_price - signal.stop_loss)
    tp_distance = abs(signal.take_profit - signal.entry_price)

    sl_ticks = max(risk.min_sl_ticks, int(sl_distance / tick_size))
    tp_ticks = max(risk.min_sl_ticks, int(tp_distance / tick_size))

    # Cap SL ticks
    if sl_ticks > risk.max_sl_ticks:
        return False, f"SL {sl_ticks} ticks > max {risk.max_sl_ticks}", 0, 0, 0

    # Calculate dollar risk and cap contracts
    qty = max(1, int(signal.lot_size))
    dollar_risk = sl_ticks * tick_value * qty

    # If dollar risk exceeds $300, reduce contracts
    if dollar_risk > risk.max_risk_per_trade_usd:
        max_qty = int(risk.max_risk_per_trade_usd / (sl_ticks * tick_value))
        qty = max(1, min(max_qty, risk.max_contracts))
        dollar_risk = sl_ticks * tick_value * qty

    # Final hard check — if even 1 contract exceeds cap, BLOCK
    if dollar_risk > risk.max_risk_per_trade_usd:
        return False, (
            f"BLOCKED: ${dollar_risk:.0f} risk > ${risk.max_risk_per_trade_usd:.0f} cap "
            f"({qty}x @ {sl_ticks} ticks)"
        ), 0, 0, 0

    # Cap at max contracts
    if qty > risk.max_contracts:
        qty = risk.max_contracts

    log.info(
        f"APEX Safety OK: {qty} contracts, SL={sl_ticks}t (${sl_ticks * tick_value * qty:.0f}), "
        f"TP={tp_ticks}t, R:R=1:{tp_ticks/sl_ticks:.1f}"
    )
    return True, "OK", qty, sl_ticks, tp_ticks


@app.get("/api/trades")
async def get_trades():
    """Bot trade history."""
    return [t.model_dump() for t in orchestrator._trade_history[-20:]]


@app.get("/api/bot/scan-diagnostic")
async def scan_diagnostic():
    """Detailed scan diagnostic — shows every gate's result without executing."""
    now = datetime.now(timezone.utc)
    candles = orchestrator._candle_cache
    phase = orchestrator.dialectic.get_current_phase(now)
    act = orchestrator.weekly.get_current_act(now)
    is_kz = orchestrator.dialectic.is_killzone(now)

    diag = {
        "time_utc": now.isoformat(),
        "broker": "tradovate" if _is_live else "paper",
        "candle_count": len(candles),
        "session_phase": phase.value,
        "weekly_act": act.value,
        "is_killzone": is_kz,
        "daily_limit_reached": orchestrator._is_daily_limit_reached(now),
        "daily_loss_exceeded": orchestrator._is_daily_loss_exceeded(),
        "past_intraday_close": orchestrator._is_intraday_close_time(now),
        "induction_state": "N/A",
        "would_generate_signal": False,
        "last_5_candles": [],
    }

    if len(candles) >= 5:
        diag["last_5_candles"] = [
            {"time": c.timestamp.isoformat(), "O": c.open, "H": c.high,
             "L": c.low, "C": c.close}
            for c in candles[-5:]
        ]

    if len(candles) >= 25:
        state = orchestrator.signature.evaluate(candles)
        diag["induction_state"] = state.value
        diag["would_generate_signal"] = state.value == "REVERSAL_CONFIRMED"

        # Show wedge/hunt details for last few candles
        sig = orchestrator.signature
        hunt_checks = {}
        for offset in [1, 2, 3]:
            idx = len(candles) - offset
            hunt = sig._detect_stop_hunt(candles, at_idx=idx)
            wedge = sig._detect_wedge(candles, end_idx=idx)
            hunt_checks[f"candle_-{offset}"] = {
                "stop_hunt": hunt.direction if hunt else None,
                "wedge_before": bool(wedge),
            }
        diag["hunt_checks"] = hunt_checks

    return diag


@app.post("/api/bot/scan")
async def trigger_scan(force: bool = False):
    """Trigger a manual scan cycle.  ?force=true bypasses session gates."""
    signal = orchestrator.scan(force=force)
    if signal:
        # If connected to Tradovate, execute the signal
        executed = False
        if _is_live and isinstance(broker, TradovateBroker):
            try:
                symbol = broker._front_month_nq
                if symbol:
                    # ── APEX safety gate ──
                    safe, reason, qty, sl_ticks, tp_ticks = _apex_safety_check(signal)
                    if not safe:
                        orchestrator.record_execution(signal.signal_id, False)
                        log.warning(f"APEX Safety BLOCKED manual trade: {reason}")
                        return {
                            "status": "blocked",
                            "reason": reason,
                            "signal": signal.model_dump(),
                        }

                    action = "Buy" if signal.direction.value == "BUY" else "Sell"
                    result = await broker.place_bracket_order(
                        symbol=symbol,
                        action=action,
                        qty=qty,
                        profit_target_ticks=tp_ticks,
                        stop_loss_ticks=sl_ticks,
                    )
                    orchestrator.record_execution(signal.signal_id, True)
                    executed = True
                    log.info(f"✓ Manual scan executed: {action} {qty}x {symbol} SL={sl_ticks}t TP={tp_ticks}t")
            except Exception as e:
                orchestrator.record_execution(signal.signal_id, False)
                log.error(f"Manual scan execution failed: {e}")

        return {
            "status": "signal_generated",
            "executed": executed,
            "signal": signal.model_dump(),
        }
    return {"status": "no_signal", "reason": "Conditions not met"}


# ═══════════════════════════════════════════════════════════════════════
#  AUTO-TRADE ENGINE
# ═══════════════════════════════════════════════════════════════════════

async def _auto_trade_loop() -> None:
    """Continuous scan → execute loop. Runs every ~10 seconds for scalping."""
    global _auto_trade_stats
    log.info("▶ Auto-trade loop STARTED (scalping mode, 10s interval)")
    _last_trade_time: datetime | None = None
    _TRADE_COOLDOWN_SECONDS = 120  # 2-minute cooldown between trades
    while True:
        try:
            _auto_trade_stats["scans"] += 1

            # Cooldown check — skip if last trade was too recent
            now = datetime.now(timezone.utc)
            if _last_trade_time and (now - _last_trade_time).total_seconds() < _TRADE_COOLDOWN_SECONDS:
                await asyncio.sleep(10)
                continue

            # Only trade if connected to Tradovate
            if _is_live and isinstance(broker, TradovateBroker):
                signal = orchestrator.scan()  # signal-only, no execution inside
                if signal:
                    _auto_trade_stats["trades_placed"] += 1
                    _auto_trade_stats["last_signal"] = {
                        "id": signal.signal_id,
                        "type": signal.signal_type,
                        "direction": signal.direction.value,
                        "entry": signal.entry_price,
                        "sl": signal.stop_loss,
                        "tp": signal.take_profit,
                        "time": datetime.now(timezone.utc).isoformat(),
                    }
                    log.info(f"Auto-trade signal: {signal.signal_id} {signal.direction.value} @ {signal.entry_price}")

                    # Execute via bracket order on Tradovate (single execution point)
                    try:
                        symbol = broker._front_month_nq
                        if symbol:
                            # ── APEX safety gate ──
                            safe, reason, qty, sl_ticks, tp_ticks = _apex_safety_check(signal)
                            if not safe:
                                orchestrator.record_execution(signal.signal_id, False)
                                log.warning(f"APEX Safety BLOCKED auto-trade: {reason}")
                            else:
                                action = "Buy" if signal.direction.value == "BUY" else "Sell"
                                await broker.place_bracket_order(
                                    symbol=symbol,
                                    action=action,
                                    qty=qty,
                                    profit_target_ticks=tp_ticks,
                                    stop_loss_ticks=sl_ticks,
                                )
                                orchestrator.record_execution(signal.signal_id, True)
                                _last_trade_time = datetime.now(timezone.utc)
                                log.info(
                                    f"✓ Auto-trade executed: {action} {qty}x {symbol} "
                                    f"SL={sl_ticks}t (${sl_ticks * CONFIG.risk.tick_value * qty:.0f}) "
                                    f"TP={tp_ticks}t"
                                )
                    except Exception as e:
                        orchestrator.record_execution(signal.signal_id, False)
                        log.error(f"Auto-trade execution failed: {e}")
                else:
                    if _auto_trade_stats["scans"] % 10 == 0:
                        log.debug(
                            f"Auto-trade: {_auto_trade_stats['scans']} scans, "
                            f"{_auto_trade_stats['trades_placed']} trades"
                        )
            else:
                # Paper mode — scan with force to bypass killzone check for testing
                signal = orchestrator.scan(force=True)
                if signal:
                    # Execute through PaperBroker
                    from smart_money_bot.domain.entities.trade import Trade, TradeSide
                    side = TradeSide.BUY if signal.direction.value == "BUY" else TradeSide.SELL
                    trade = Trade(
                        trade_id=signal.signal_id,
                        symbol=signal.symbol,
                        side=side,
                        entry_price=signal.entry_price,
                        stop_loss=signal.stop_loss,
                        take_profit=signal.take_profit,
                        lot_size=signal.lot_size,
                        opened_at=datetime.now(timezone.utc),
                    )
                    broker.place_trade(trade)
                    orchestrator.record_execution(signal.signal_id, True)
                    _last_trade_time = datetime.now(timezone.utc)

                    _auto_trade_stats["trades_placed"] += 1
                    _auto_trade_stats["last_signal"] = {
                        "id": signal.signal_id,
                        "type": signal.signal_type,
                        "direction": signal.direction.value,
                        "entry": signal.entry_price,
                        "sl": signal.stop_loss,
                        "tp": signal.take_profit,
                        "time": datetime.now(timezone.utc).isoformat(),
                        "mode": "paper",
                        "status": "executed",
                    }
                    log.info(
                        f"✓ Paper auto-trade EXECUTED: {signal.signal_id} "
                        f"{signal.direction.value} {signal.lot_size}x @ {signal.entry_price} "
                        f"SL={signal.stop_loss} TP={signal.take_profit}"
                    )

        except asyncio.CancelledError:
            log.info("■ Auto-trade loop STOPPED")
            return
        except Exception as e:
            log.error(f"Auto-trade loop error: {e}")

        await asyncio.sleep(10)


@app.post("/api/bot/auto-trade/start")
async def start_auto_trade():
    """Start the auto-trade loop."""
    global _auto_trade_on, _auto_trade_task, _auto_trade_stats

    if _auto_trade_on and _auto_trade_task and not _auto_trade_task.done():
        return {"status": "already_running", "stats": _auto_trade_stats}

    _auto_trade_on = True
    _auto_trade_stats = {
        "trades_placed": 0,
        "scans": 0,
        "last_signal": None,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    _auto_trade_task = asyncio.create_task(_auto_trade_loop())
    return {"status": "started", "stats": _auto_trade_stats}


@app.post("/api/bot/auto-trade/stop")
async def stop_auto_trade():
    """Stop the auto-trade loop."""
    global _auto_trade_on, _auto_trade_task

    _auto_trade_on = False
    if _auto_trade_task and not _auto_trade_task.done():
        _auto_trade_task.cancel()
        try:
            await _auto_trade_task
        except asyncio.CancelledError:
            pass
    _auto_trade_task = None
    return {"status": "stopped", "stats": _auto_trade_stats}


@app.get("/api/bot/auto-trade/status")
async def auto_trade_status():
    """Check auto-trade status."""
    running = _auto_trade_on and _auto_trade_task is not None and not _auto_trade_task.done()
    return {"running": running, "stats": _auto_trade_stats}


@app.post("/api/bot/test-execution")
async def test_execution():
    """Inject synthetic candles that trigger a REVERSAL_CONFIRMED signal,
    then execute through PaperBroker. For testing the full pipeline."""
    import random as _rnd
    _rnd.seed(42)

    base_time = int(datetime(2026, 3, 12, 14, 0, tzinfo=timezone.utc).timestamp())
    base_price = orchestrator._candle_cache[-1].close if orchestrator._candle_cache else 24800.0
    candles: list[CandleData] = []

    # Phase 1: 30 candles — shrinking range (wedge)
    for i in range(30):
        t = base_time + i * 60
        r = max(2.0, 15.0 - i * 0.4)
        o = base_price + _rnd.uniform(-r, r)
        c = o + _rnd.uniform(-r, r)
        h = max(o, c) + _rnd.uniform(0.5, r * 0.5)
        l = min(o, c) - _rnd.uniform(0.5, r * 0.5)
        dt = datetime.fromtimestamp(t, tz=timezone.utc)
        candles.append(CandleData(timestamp=dt, open=round(o,2), high=round(h,2),
                                  low=round(l,2), close=round(c,2), volume=100.0))

    # Phase 2: Stop hunt wick below recent lows
    zone_low = min(c.low for c in candles[-20:])
    dt2 = datetime.fromtimestamp(base_time + 30*60, tz=timezone.utc)
    candles.append(CandleData(timestamp=dt2, open=base_price-1, high=base_price+2,
                              low=zone_low-15, close=base_price+1.5, volume=500.0))

    # Phase 3: Exhaustion (tiny body, big range, bearish)
    dt3 = datetime.fromtimestamp(base_time + 31*60, tz=timezone.utc)
    candles.append(CandleData(timestamp=dt3, open=base_price+2, high=base_price+10,
                              low=base_price-8, close=base_price-0.5, volume=300.0))

    # Phase 4: Reversal (bullish opposite)
    dt4 = datetime.fromtimestamp(base_time + 32*60, tz=timezone.utc)
    candles.append(CandleData(timestamp=dt4, open=base_price-0.5, high=base_price+12,
                              low=base_price-1, close=base_price+10, volume=400.0))

    # Save real candle cache before injecting synthetic data
    saved_candles = list(orchestrator._candle_cache)

    # Feed & scan
    orchestrator.feed_candles(candles)
    signal = orchestrator.scan(force=True)

    result: dict = {
        "candles_fed": len(candles),
        "signal_generated": signal is not None,
    }

    if signal:
        # Execute through broker
        if isinstance(broker, PaperBroker):
            from smart_money_bot.domain.entities.trade import Trade, TradeSide
            side = TradeSide.BUY if signal.direction.value == "BUY" else TradeSide.SELL
            trade = Trade(
                trade_id=signal.signal_id, symbol=signal.symbol,
                side=side, entry_price=signal.entry_price,
                stop_loss=signal.stop_loss, take_profit=signal.take_profit,
                lot_size=signal.lot_size, opened_at=datetime.now(timezone.utc),
            )
            order_id = broker.place_trade(trade)
            orchestrator.record_execution(signal.signal_id, True)
            result["execution"] = {
                "order_id": order_id,
                "trade_status": trade.status.value,
                "broker_trades": len(broker.placed_trades),
                "open_positions": orchestrator._account.open_positions,
            }
        result["signal"] = {
            "id": signal.signal_id,
            "direction": signal.direction.value,
            "entry": signal.entry_price,
            "sl": signal.stop_loss,
            "tp": signal.take_profit,
            "contracts": signal.lot_size,
        }

    # Restore real candles so the dashboard isn't affected
    if saved_candles:
        orchestrator.feed_candles(saved_candles)

    return result


@app.post("/api/bot/test-trade")
async def test_trade():
    """Inject a fake OPEN trade directly into the orchestrator for UI testing."""
    import uuid as _uuid
    price = orchestrator._candle_cache[-1].close if orchestrator._candle_cache else 24650.0
    tid = f"SM-TEST-{_uuid.uuid4().hex[:6].upper()}"
    from smart_money_bot.models.schemas import TradeRecord, TradeStatus, TradeDirection, SignalType
    trade = TradeRecord(
        trade_id=tid,
        symbol="NAS100",
        direction=TradeDirection.BUY,
        entry_price=price,
        stop_loss=round(price - 10, 2),
        take_profit=round(price + 20, 2),
        lot_size=2.0,
        status=TradeStatus.OPEN,
        signal_type="SIGNATURE_TRADE",
    )
    orchestrator._trade_history.append(trade)
    orchestrator._trade_timestamps.append(datetime.now(timezone.utc))
    orchestrator._account.open_positions += 1

    # Also place in PaperBroker
    if isinstance(broker, PaperBroker):
        from smart_money_bot.domain.entities.trade import Trade, TradeSide
        t = Trade(
            trade_id=tid, symbol="NAS100",
            side=TradeSide.BUY, entry_price=price,
            stop_loss=round(price - 10, 2), take_profit=round(price + 20, 2),
            lot_size=2.0, opened_at=datetime.now(timezone.utc),
        )
        broker.place_trade(t)

    return {
        "ok": True,
        "trade_id": tid,
        "direction": "BUY",
        "entry": price,
        "sl": round(price - 10, 2),
        "tp": round(price + 20, 2),
        "qty": 2,
    }


# ═══════════════════════════════════════════════════════════════════════
#  CLOSE ALL POSITIONS
# ═══════════════════════════════════════════════════════════════════════

@app.post("/api/order/close-all")
async def close_all_positions():
    """Liquidate ALL open positions and cancel ALL working orders."""

    # ── Paper mode: close orchestrator's OPEN trades ──
    if not (_is_live and isinstance(broker, TradovateBroker)):
        from smart_money_bot.models.schemas import TradeStatus
        closed_count = 0
        last_price = 0.0
        if orchestrator._candle_cache:
            last_price = orchestrator._candle_cache[-1].close
        for trade in orchestrator._trade_log:
            if trade.status == TradeStatus.OPEN:
                trade.status = TradeStatus.CLOSED
                if last_price > 0:
                    direction_mult = 1.0 if trade.direction.value == "BUY" else -1.0
                    trade.pnl = (last_price - trade.entry_price) * direction_mult * trade.lot_size * CONFIG.risk.point_value
                closed_count += 1
        if closed_count > 0:
            orchestrator._account.open_positions = max(0, orchestrator._account.open_positions - closed_count)
        return {
            "positions_closed": closed_count,
            "orders_cancelled": 0,
            "errors": [],
            "summary": f"Closed {closed_count} paper positions",
        }

    results = {"positions_closed": 0, "orders_cancelled": 0, "errors": []}

    # 1. Cancel all working orders first
    try:
        orders = await broker.get_orders()
        working = [o for o in orders if o.get("ordStatus") in ("Working", "Accepted")]
        for order in working:
            try:
                await broker.cancel_order(order["id"])
                results["orders_cancelled"] += 1
            except Exception as e:
                results["errors"].append(f"Cancel order {order['id']}: {e}")
    except Exception as e:
        results["errors"].append(f"Fetch orders: {e}")

    # 2. Liquidate all open positions
    try:
        positions = await broker.get_positions()
        open_pos = [p for p in positions if p.get("netPos", 0) != 0]
        for pos in open_pos:
            try:
                contract_id = pos.get("contractId")
                if contract_id:
                    await broker.liquidate_position(contract_id)
                    results["positions_closed"] += 1
            except Exception as e:
                results["errors"].append(f"Liquidate {pos.get('contractId')}: {e}")
    except Exception as e:
        results["errors"].append(f"Fetch positions: {e}")

    total = results["positions_closed"] + results["orders_cancelled"]
    results["summary"] = (
        f"Closed {results['positions_closed']} positions, "
        f"cancelled {results['orders_cancelled']} orders"
    )
    log.info(f"Close-all: {results['summary']}")
    return results


# ═══════════════════════════════════════════════════════════════════════
#  SETTINGS — CONNECT / DISCONNECT
# ═══════════════════════════════════════════════════════════════════════


@app.get("/api/settings/saved-credentials")
async def get_saved_credentials():
    """Return the username from .env so the frontend can pre-fill the login form.
    Never exposes the password."""
    return {
        "username": _cfg.username or "",
        "has_password": bool(_cfg.password),
    }

class ConnectRequest(BaseModel):
    username: str
    password: str
    app_id: str = "SmartMoneyBot"
    app_version: str = "1.0"
    cid: int | None = None
    sec: str | None = None
    live: bool = False


@app.post("/api/settings/connect")
async def connect_account(req: ConnectRequest):
    """Hot-swap broker to Tradovate with provided credentials."""
    global broker, orchestrator, _is_live, _feed_task

    # Require CID + SEC for API key auth
    if not req.cid or not req.sec:
        return {
            "connected": False,
            "error": (
                "API Keys login requires a Client ID (CID) and Secret. "
                "Register your app at Tradovate → Settings → API Access, "
                "then enter the CID and Secret here. "
                "Or use Browser Login instead (recommended)."
            ),
        }

    # Tear down existing live streams
    if _is_live and isinstance(broker, TradovateBroker):
        try:
            await broker.close()
        except Exception:
            pass

    cfg = TradovateConfig(
        username=req.username,
        password=req.password,
        app_id=req.app_id,
        app_version=req.app_version,
        cid=req.cid,
        sec=req.sec,
        live=req.live,
    )

    try:
        tv = TradovateBroker(cfg)
        tv.authenticate()  # sync — handles p-ticket
    except Exception as e:
        return {
            "connected": False,
            "error": str(e),
            "hint": (
                "If you see a CAPTCHA error: log into "
                "https://trader.tradovate.com/ in your browser first, "
                "then retry. Or use Browser Login from the Settings panel."
            ),
        }

    # Swap broker
    broker = tv
    _is_live = True
    orchestrator = Orchestrator(broker=broker)

    # Start WS streams
    try:
        symbol = await tv.get_front_month_nq(micro=True)
        await tv.start_all_streams(symbol)
        log.info(f"✓ Connected to Tradovate: {tv._account_spec} | {symbol}")
    except Exception as e:
        log.warning(f"WS streams failed: {e}")

    # Restart feed loop
    if _feed_task:
        _feed_task.cancel()
    _feed_task = asyncio.create_task(_candle_feed_loop())

    return {
        "connected": True,
        "account_spec": tv._account_spec,
        "account_id": tv._account_id,
        "mode": "LIVE" if cfg.live else "DEMO",
        "front_month": tv._front_month_nq,
    }


class BrowserLoginRequest(BaseModel):
    username: str = ""
    password: str = ""
    live: bool = False
    use_saved: bool = True  # use .env credentials if form fields are empty


@app.post("/api/settings/browser-login")
async def browser_login(req: BrowserLoginRequest):
    """Open a real browser window for Tradovate login (bypasses CAPTCHA)."""
    global broker, orchestrator, _is_live, _feed_task

    from smart_money_bot.infrastructure.brokers.browser_auth import (
        browser_login_tradovate,
    )

    # Use .env credentials as fallback when form fields are empty
    login_user = req.username or (_cfg.username if req.use_saved else "")
    login_pass = req.password or (_cfg.password if req.use_saved else "")

    result = await browser_login_tradovate(
        username=login_user,
        password=login_pass,
        live=req.live,
        timeout_seconds=180,
    )

    if not result.get("success"):
        return {"connected": False, "error": result.get("error", "Login failed")}

    # Tear down existing
    if _is_live and isinstance(broker, TradovateBroker):
        try:
            await broker.close()
        except Exception:
            pass

    cfg = TradovateConfig(
        username="browser-auth",
        password="",
        live=req.live,
    )

    try:
        tv = TradovateBroker(cfg)
        tv.authenticate_with_token(
            access_token=result["access_token"],
            md_access_token=result.get("md_access_token"),
        )
    except Exception as e:
        return {"connected": False, "error": str(e)}

    broker = tv
    _is_live = True
    orchestrator = Orchestrator(broker=broker)

    try:
        symbol = await tv.get_front_month_nq(micro=True)
        await tv.start_all_streams(symbol)
        log.info(f"✓ Browser-login connected: {tv._account_spec} | {symbol}")
    except Exception as e:
        log.warning(f"WS streams failed: {e}")

    if _feed_task:
        _feed_task.cancel()
    _feed_task = asyncio.create_task(_candle_feed_loop())

    return {
        "connected": True,
        "account_spec": tv._account_spec,
        "account_id": tv._account_id,
        "mode": "LIVE" if cfg.live else "DEMO",
        "front_month": tv._front_month_nq,
    }


class TokenConnectRequest(BaseModel):
    access_token: str
    md_access_token: str | None = None
    live: bool = False


@app.post("/api/settings/connect-token")
async def connect_with_token(req: TokenConnectRequest):
    """Connect using a token copied from browser DevTools."""
    global broker, orchestrator, _is_live, _feed_task

    # Tear down existing
    if _is_live and isinstance(broker, TradovateBroker):
        try:
            await broker.close()
        except Exception:
            pass

    cfg = TradovateConfig(
        username="token-auth",
        password="",
        live=req.live,
    )

    try:
        tv = TradovateBroker(cfg)
        tv.authenticate_with_token(
            access_token=req.access_token,
            md_access_token=req.md_access_token,
        )
    except Exception as e:
        return {
            "connected": False,
            "error": str(e),
        }

    broker = tv
    _is_live = True
    orchestrator = Orchestrator(broker=broker)

    try:
        symbol = await tv.get_front_month_nq(micro=True)
        await tv.start_all_streams(symbol)
        log.info(f"✓ Token-connected to Tradovate: {tv._account_spec} | {symbol}")
    except Exception as e:
        log.warning(f"WS streams failed: {e}")

    if _feed_task:
        _feed_task.cancel()
    _feed_task = asyncio.create_task(_candle_feed_loop())

    return {
        "connected": True,
        "account_spec": tv._account_spec,
        "account_id": tv._account_id,
        "mode": "LIVE" if cfg.live else "DEMO",
        "front_month": tv._front_month_nq,
    }


@app.post("/api/settings/disconnect")
async def disconnect_account():
    """Disconnect Tradovate and switch to paper broker."""
    global broker, orchestrator, _is_live, _feed_task

    if _is_live and isinstance(broker, TradovateBroker):
        try:
            await broker.close()
        except Exception:
            pass

    broker = PaperBroker()
    _is_live = False
    orchestrator = Orchestrator(broker=broker)

    if _feed_task:
        _feed_task.cancel()
    _feed_task = asyncio.create_task(_candle_feed_loop())

    return {"connected": False, "broker": "paper"}


# ═══════════════════════════════════════════════════════════════════════
#  TRADING — ORDER EXECUTION
# ═══════════════════════════════════════════════════════════════════════

class MarketOrderRequest(BaseModel):
    action: str = "Buy"  # "Buy" or "Sell"
    qty: int = 1
    symbol: str | None = None


@app.post("/api/order/market")
async def place_market_order(req: MarketOrderRequest):
    """Place a market order directly on Tradovate."""
    if not (_is_live and isinstance(broker, TradovateBroker)):
        raise HTTPException(400, "Not connected to Tradovate — use paper mode")
    symbol = req.symbol or broker._front_month_nq
    if not symbol:
        raise HTTPException(400, "No symbol resolved")
    # APEX safety: cap contracts
    qty = min(req.qty, CONFIG.risk.max_contracts)
    log.warning(f"Market order (NO SL): {req.action} {qty}x {symbol} — ENSURE MANUAL SL")
    result = await broker.place_market_order(symbol, req.action, qty)
    return {"status": "placed", "result": result}


class BracketOrderRequest(BaseModel):
    action: str = "Buy"
    qty: int = 1
    profit_target_ticks: int = 80
    stop_loss_ticks: int = 20
    trailing_stop: bool = False
    symbol: str | None = None


@app.post("/api/order/bracket")
async def place_bracket_order(req: BracketOrderRequest):
    """Place a bracket order (entry + SL + TP) on Tradovate.

    APEX safety: enforces max $300 SL, max 4 contracts, SL tick bounds.
    """
    if not (_is_live and isinstance(broker, TradovateBroker)):
        raise HTTPException(400, "Not connected to Tradovate — use paper mode")
    symbol = req.symbol or broker._front_month_nq
    if not symbol:
        raise HTTPException(400, "No symbol resolved")

    risk = CONFIG.risk

    # ── APEX safety checks on manual bracket orders ──
    sl_ticks = min(req.stop_loss_ticks, risk.max_sl_ticks)
    qty = min(req.qty, risk.max_contracts)
    dollar_risk = sl_ticks * risk.tick_value * qty

    if dollar_risk > risk.max_risk_per_trade_usd:
        max_qty = int(risk.max_risk_per_trade_usd / (sl_ticks * risk.tick_value))
        qty = max(1, min(max_qty, risk.max_contracts))
        dollar_risk = sl_ticks * risk.tick_value * qty
        if dollar_risk > risk.max_risk_per_trade_usd:
            raise HTTPException(
                400,
                f"APEX Safety: ${dollar_risk:.0f} risk exceeds "
                f"${risk.max_risk_per_trade_usd:.0f} cap even with 1 contract"
            )

    result = await broker.place_bracket_order(
        symbol=symbol,
        action=req.action,
        qty=qty,
        profit_target_ticks=req.profit_target_ticks,
        stop_loss_ticks=sl_ticks,
        trailing_stop=req.trailing_stop,
    )
    return {"status": "placed", "result": result}


class CancelOrderRequest(BaseModel):
    order_id: int


@app.post("/api/order/cancel")
async def cancel_order(req: CancelOrderRequest):
    """Cancel a working order on Tradovate."""
    if not (_is_live and isinstance(broker, TradovateBroker)):
        raise HTTPException(400, "Not connected to Tradovate")
    result = await broker.cancel_order(req.order_id)
    return {"status": "cancelled", "result": result}


class LiquidateRequest(BaseModel):
    contract_id: int


@app.post("/api/order/liquidate")
async def liquidate_position(req: LiquidateRequest):
    """Liquidate an open position on Tradovate."""
    if not (_is_live and isinstance(broker, TradovateBroker)):
        raise HTTPException(400, "Not connected to Tradovate")
    result = await broker.liquidate_position(req.contract_id)
    return {"status": "liquidated", "result": result}


# ═══════════════════════════════════════════════════════════════════════
#  HEALTH & STATUS
# ═══════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    """System health check."""
    now = datetime.now(timezone.utc)
    info: dict = {
        "status": "ok",
        "broker": "tradovate" if _is_live else "paper",
        "mode": "LIVE" if _cfg.live else "DEMO" if _is_live else "paper",
        "session": orchestrator.dialectic.get_current_phase(now).value,
        "weekly_act": orchestrator.weekly.get_current_act(now).value,
        "uptime_seconds": (now - orchestrator._start_time).total_seconds(),
        "auto_trade": _auto_trade_on and _auto_trade_task is not None and not _auto_trade_task.done(),
    }
    if _is_live and isinstance(broker, TradovateBroker):
        info["account_spec"] = broker._account_spec
        info["account_id"] = broker._account_id
        info["front_month"] = broker._front_month_nq
        info["last_price"] = broker.last_price
        info["ws_streams"] = len(broker._ws_tasks)
        info["candle_count"] = len(broker.candles)
        info["token_valid"] = broker.is_authenticated
    return info


@app.get("/api/status")
async def get_status_compat():
    """Legacy status endpoint — maps to dashboard."""
    state = await orchestrator.get_dashboard_state()
    if _is_live and isinstance(broker, TradovateBroker) and broker.last_price > 0:
        state.current_price = broker.last_price

    trades = []
    for t in state.trade_history:
        trades.append(
            {
                "id": t.trade_id,
                "side": t.direction.value,
                "entry": t.entry_price,
                "stopLoss": t.stop_loss,
                "lot": t.lot_size,
                "status": t.status.value,
                "time": t.opened_at.strftime("%Y-%m-%d %H:%M UTC"),
            }
        )

    return {
        "symbol": state.symbol,
        "price": state.current_price,
        "phase": state.session_phase.value,
        "activeRiskPercent": 0.0,
        "equity": state.account.equity,
        "tradeHistory": trades,
    }
