#!/usr/bin/env python3
"""
Test orchestrator pipeline with synthetic market data.
Simulates: Wedge → Stop Hunt → Exhaustion → Reversal
"""
import sys
sys.path.insert(0, "backend/src")

import random
from datetime import datetime, timezone
from smart_money_bot.models.schemas import CandleData, InductionState
from smart_money_bot.engines.signature_trade import SignatureTradeDetector
from smart_money_bot.orchestrator import Orchestrator
from smart_money_bot.infrastructure.brokers.paper_broker import PaperBroker
from smart_money_bot.config import CONFIG

random.seed(42)

def make_candle(t, o, h, l, c, v=100.0):
    dt = datetime.fromtimestamp(t, tz=timezone.utc)
    return CandleData(timestamp=dt, open=o, high=h, low=l, close=c, volume=v)

# Build synthetic candle series
base_time = int(datetime(2026, 3, 12, 14, 0, tzinfo=timezone.utc).timestamp())
base_price = 24800.0
candles = []

# Phase 1: 30 candles with shrinking range (wedge/consolidation)
for i in range(30):
    t = base_time + i * 60
    r = max(2.0, 15.0 - i * 0.4)
    o = base_price + random.uniform(-r, r)
    c = o + random.uniform(-r, r)
    h = max(o, c) + random.uniform(0.5, r * 0.5)
    l = min(o, c) - random.uniform(0.5, r * 0.5)
    candles.append(make_candle(t, round(o, 2), round(h, 2), round(l, 2), round(c, 2)))

# Phase 2: Stop hunt candle — big wick below recent lows
zone_low = min(c.low for c in candles[-20:])
candles.append(make_candle(
    base_time + 30 * 60,
    base_price - 1.0,
    base_price + 2.0,
    zone_low - 15.0,
    base_price + 1.5,
    500.0,
))

# Phase 3: Exhaustion candle (tiny body, big range, BEARISH)
candles.append(make_candle(
    base_time + 31 * 60,
    base_price + 2.0,
    base_price + 10.0,
    base_price - 8.0,
    base_price - 0.5,
    300.0,
))

# Phase 4: Reversal candle (BULLISH — opposite of prev bearish)
candles.append(make_candle(
    base_time + 32 * 60,
    base_price - 0.5,
    base_price + 12.0,
    base_price - 1.0,
    base_price + 10.0,
    400.0,
))

print(f"Generated {len(candles)} synthetic candles")
print(f"\nSignature config:")
print(f"  min_consolidation_candles = {CONFIG.signature.min_consolidation_candles}")
print(f"  wedge_slope_threshold     = {CONFIG.signature.wedge_slope_threshold}")
print(f"  stop_hunt_wick_multiplier = {CONFIG.signature.stop_hunt_wick_multiplier}")
print(f"  exhaustion_body_ratio     = {CONFIG.signature.exhaustion_body_ratio}")

# ─── Test individual components ───
detector = SignatureTradeDetector()

print("\n--- Component tests ---")
wedge = detector._detect_wedge(candles)
print(f"1. Wedge: {wedge}")

hunt = detector._detect_stop_hunt(candles)
print(f"2. Stop hunt: {hunt}")

last = candles[-1]
body = abs(last.close - last.open)
total = last.high - last.low
ratio = body / total if total > 0 else 999
print(f"3. Last candle: body={body:.2f} range={total:.2f} ratio={ratio:.3f} exhaustion={detector._is_exhaustion(last)}")

# Full evaluate
state = detector.evaluate(candles)
print(f"4. Full evaluate: {state}")

# ─── If it didn't trigger, trace where it fails ───
if state != InductionState.REVERSAL_CONFIRMED:
    print("\n--- Tracing failure ---")
    d = SignatureTradeDetector()
    w = d._detect_wedge(candles)
    if not w:
        seg = candles[-CONFIG.signature.min_consolidation_candles:]
        highs = [c.high for c in seg]
        lows = [c.low for c in seg]
        n = len(highs)
        xm = (n - 1) / 2
        us = sum((i - xm) * (h - sum(highs)/n) for i, h in enumerate(highs)) / max(1, sum((i - xm)**2 for i in range(n)))
        ls = sum((i - xm) * (l - sum(lows)/n) for i, l in enumerate(lows)) / max(1, sum((i - xm)**2 for i in range(n)))
        cont = (us < 0 and ls > 0) or abs(us - ls) < CONFIG.signature.wedge_slope_threshold
        print(f"FAILED AT: Wedge — upper_slope={us:.6f}, lower_slope={ls:.6f}, contracting={cont}")
    else:
        print(f"Wedge: OK ({w})")
        h = d._detect_stop_hunt(candles)
        if not h:
            zone = candles[-21:-1]
            zh = max(c.high for c in zone)
            zl = min(c.low for c in zone)
            cur = candles[-1]
            uw = cur.high - max(cur.open, cur.close)
            lw = min(cur.open, cur.close) - cur.low
            bd = abs(cur.close - cur.open)
            print(f"FAILED AT: Stop hunt")
            print(f"  zone_high={zh:.2f}, zone_low={zl:.2f}")
            print(f"  cur: H={cur.high}, L={cur.low}, upper_wick={uw:.2f}, lower_wick={lw:.2f}, body={bd:.2f}")
            print(f"  Need: cur.high>{zh} AND wick>{bd*CONFIG.signature.stop_hunt_wick_multiplier:.2f}")
            print(f"  OR:   cur.low<{zl} AND wick>{bd*CONFIG.signature.stop_hunt_wick_multiplier:.2f}")
        else:
            print(f"Stop hunt: OK ({h})")
            cur = candles[-1]
            if not d._is_exhaustion(cur):
                bd = abs(cur.close - cur.open)
                tt = cur.high - cur.low
                print(f"FAILED AT: Exhaustion — ratio={bd/tt:.3f} >= threshold {CONFIG.signature.exhaustion_body_ratio}")
            else:
                print(f"Exhaustion: OK")
                prev = candles[-2]
                rev = ((cur.close > cur.open and prev.close < prev.open) or
                       (cur.close < cur.open and prev.close > prev.open))
                print(f"Reversal: {'OK' if rev else 'FAILED'}")
                print(f"  prev: {'bull' if prev.close>prev.open else 'bear'}, cur: {'bull' if cur.close>cur.open else 'bear'}")

# ─── Scan all windows ───
print("\n--- Scanning all windows ---")
states = {}
for i in range(25, len(candles)):
    d = SignatureTradeDetector()
    s = d.evaluate(candles[:i+1])
    name = s.value
    states[name] = states.get(name, 0) + 1
    if name != "NO_PATTERN":
        print(f"  idx={i}: {name}")

print(f"\nState distribution: {states}")

# ─── Test full orchestrator ───
print("\n" + "=" * 60)
print("FULL ORCHESTRATOR TEST")
print("=" * 60)

paper = PaperBroker()
orch = Orchestrator(broker=paper)
orch._account.equity = 100000.0
orch._account.balance = 100000.0
orch.feed_candles(candles)
# Use a timestamp within trading hours (14:00 UTC = 9 AM ET)
test_now = datetime(2026, 3, 12, 14, 33, tzinfo=timezone.utc)
signal = orch.scan(now=test_now, force=True)

if signal:
    print(f"\n✓ SIGNAL: {signal.signal_id}")
    print(f"  {signal.direction.value} @ {signal.entry_price} SL={signal.stop_loss} TP={signal.take_profit}")
    print(f"  Contracts: {signal.lot_size}, Confidence: {signal.confidence}")
else:
    print("\n✗ NO SIGNAL from orchestrator.scan(force=True)")

# ─── Test trade execution through PaperBroker ───
print("\n" + "=" * 60)
print("TRADE EXECUTION TEST")
print("=" * 60)

if signal:
    from smart_money_bot.domain.entities.trade import Trade, TradeSide, TradeStatus

    # Convert signal to Trade entity (mimics what server.py does)
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

    print(f"\n1. Trade before execution: status={trade.status.value}")
    assert trade.status == TradeStatus.PENDING, "Trade should start as PENDING"

    # Execute through PaperBroker
    order_id = paper.place_trade(trade)
    print(f"2. PaperBroker.place_trade() → order_id={order_id}")
    print(f"   Trade after execution: status={trade.status.value}")
    assert trade.status == TradeStatus.OPEN, "Trade should be OPEN after place_trade"
    assert len(paper.placed_trades) == 1, "Broker should have 1 placed trade"

    # Record execution in orchestrator
    orch.record_execution(signal.signal_id, success=True)
    matching = [t for t in orch._trade_history if t.trade_id == signal.signal_id]
    print(f"3. Orchestrator trade record: status={matching[0].status.value}")
    assert matching[0].status.value == "OPEN", "Orchestrator trade should be OPEN"
    assert orch._account.open_positions == 1, "Should have 1 open position"
    print(f"   Open positions: {orch._account.open_positions}")

    # Verify risk accounting
    print(f"4. Daily trade count: {len(orch._trade_timestamps)}")
    assert len(orch._trade_timestamps) == 1, "Should have 1 trade timestamp"

    # Verify the trade details match the signal
    placed = paper.placed_trades[0]
    print(f"5. Broker trade details:")
    print(f"   Symbol: {placed.symbol}")
    print(f"   Side:   {placed.side.value}")
    print(f"   Entry:  {placed.entry_price}")
    print(f"   SL:     {placed.stop_loss}")
    print(f"   TP:     {placed.take_profit}")
    print(f"   Lots:   {placed.lot_size}")
    assert placed.symbol == signal.symbol
    assert placed.entry_price == signal.entry_price
    assert placed.stop_loss == signal.stop_loss

    # Test daily limit gate — fill timestamps to hit limit, scan WITHOUT force
    original_limit = CONFIG.risk.max_trades_per_day  # 3
    for _ in range(original_limit - len(orch._trade_timestamps)):
        orch._trade_timestamps.append(test_now)  # fill up to limit
    assert len(orch._trade_timestamps) == original_limit
    # Scan without force at 14:33 UTC (in NY killzone)
    signal2 = orch.scan(now=test_now)
    print(f"\n6. Scan with daily limit reached ({original_limit} trades, no force): signal={'YES' if signal2 else 'BLOCKED (correct)'}")
    assert signal2 is None, "Should be blocked by daily limit"

    print("\n" + "=" * 60)
    print("✓ ALL TRADE EXECUTION TESTS PASSED")
    print("=" * 60)
else:
    print("\n✗ Cannot test execution — no signal was generated")

print("\nDONE")
