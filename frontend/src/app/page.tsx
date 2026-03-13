"use client";

import { useSmartMoney } from "@/hooks/useSmartMoney";
import AccountPanel from "@/components/trading/AccountPanel";
import SessionPhasePanel from "@/components/trading/SessionPhasePanel";
import WeeklyActDisplay from "@/components/trading/WeeklyActDisplay";
import InductionMeter from "@/components/trading/InductionMeter";
import MarketStructurePanel from "@/components/trading/MarketStructurePanel";
import LiquidityPanel from "@/components/trading/LiquidityPanel";
import TradeHistory from "@/components/trading/TradeHistory";
import ConnectionStatus from "@/components/trading/ConnectionStatus";
import PositionsPanel from "@/components/trading/PositionsPanel";
import OrderPanel from "@/components/trading/OrderPanel";
import FillsPanel from "@/components/trading/FillsPanel";
import SettingsPanel from "@/components/trading/SettingsPanel";
import NQ100Chart from "@/components/trading/NQ100Chart";

export default function Home() {
  const {
    data,
    health,
    quote,
    positions,
    orders,
    fills,
    candles,
    timeframe,
    error,
    orderStatus,
    triggerScan,
    changeTimeframe,
    placeMarketOrder,
    placeBracketOrder,
    liquidatePosition,
    connectAccount,
    connectWithToken,
    browserLogin,
    disconnectAccount,
    startAutoTrade,
    stopAutoTrade,
    closeAllPositions,
  } = useSmartMoney();

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass-card p-8 text-center">
          <div className="mb-3 text-3xl">⚠</div>
          <h2 className="text-lg font-bold text-slate-100">Connection Lost</h2>
          <p className="mt-2 text-sm text-slate-400">Backend unreachable: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
          <div className="absolute inset-2 animate-pulse rounded-full bg-brand/40" />
          <div className="absolute inset-4 rounded-full bg-brand" />
        </div>
        <p className="text-sm font-medium text-slate-400">
          Connecting to Smart Money engine…
        </p>
      </div>
    );
  }

  const isLive = health?.broker === "tradovate";
  const autoTradeOn = health?.auto_trade ?? false;

  return (
    <div className="min-h-screen">
      {/* ═══ TOP NAVIGATION BAR ═══ */}
      <nav className="sticky top-0 z-40 border-b border-white/[0.06] bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15">
              <svg className="h-5 w-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-50">
                Smart<span className="text-brand">Money</span>
              </h1>
              <p className="text-[10px] text-slate-500">NAS100 Institutional Engine</p>
            </div>
          </div>

          {/* Center: Connection Status */}
          <ConnectionStatus health={health} quote={quote} />

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={triggerScan}
              className="btn-ghost text-xs"
            >
              <span className="mr-1.5">⟳</span> Scan
            </button>
            <SettingsPanel
              isLive={isLive ?? false}
              accountSpec={health?.account_spec}
              mode={health?.mode}
              onConnect={connectAccount}
              onConnectWithToken={connectWithToken}
              onBrowserLogin={browserLogin}
              onDisconnect={disconnectAccount}
            />
          </div>
        </div>
      </nav>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="mx-auto max-w-[1440px] space-y-5 px-6 py-5">

        {/* ═══ CONTROL BAR: Auto-Trade + Close All ═══ */}
        <div className="glass-card flex items-center gap-4 px-5 py-3">
          {/* Auto-Trade Toggle */}
          <div className="flex items-center gap-3">
            <span className="section-title">Auto-Trade</span>
            <button
              onClick={autoTradeOn ? stopAutoTrade : startAutoTrade}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-all duration-300 ${
                autoTradeOn
                  ? "bg-brand/80 shadow-glow-sm"
                  : "bg-surface-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
                  autoTradeOn ? "translate-x-8" : "translate-x-1"
                }`}
              />
            </button>
            {autoTradeOn ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-brand">
                <span className="pulse-dot" />
                Running
              </span>
            ) : (
              <span className="text-xs text-slate-600">Off</span>
            )}
          </div>

          <div className="h-6 w-px bg-white/[0.06]" />

          {/* Close All Positions */}
          <button
            onClick={async () => {
              if (window.confirm("Close ALL positions and cancel ALL orders?")) {
                await closeAllPositions();
              }
            }}
            disabled={!isLive && !(positions && positions.some(p => p.netPos !== 0))}
            className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 hover:border-red-500/40 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ✖ Close All
          </button>

          {/* Order status feedback */}
          {orderStatus && (
            <span className={`ml-auto text-xs font-medium ${
              orderStatus.startsWith("✓") ? "text-brand" :
              orderStatus.startsWith("✗") ? "text-red-400" :
              "text-amber-400 animate-pulse"
            }`}>
              {orderStatus}
            </span>
          )}
        </div>

        {/* ═══ ACCOUNT STATS ROW ═══ */}
        <AccountPanel
          account={data.account}
          symbol={data.symbol}
          price={quote?.last && quote.last > 0 ? quote.last : data.current_price}
        />

        {/* ═══ CHART ═══ */}
        <div className="glass-card overflow-hidden p-0">
          <NQ100Chart
            candles={candles}
            lastPrice={quote?.last && quote.last > 0 ? quote.last : data.current_price}
            bid={quote?.bid}
            ask={quote?.ask}
            symbol={health?.front_month ?? data.symbol}
            selectedTf={timeframe}
            onTimeframeChange={changeTimeframe}
            positions={positions?.map((p) => ({
              netPos: p.netPos,
              netPrice: p.netPrice,
              contractId: p.contractId,
            }))}
            orders={orders
              ?.filter((o) => o.ordStatus === "Working" || o.ordStatus === "Accepted")
              .map((o) => ({
                price: o.stopPrice ?? o.price ?? 0,
                qty: o.qty ?? 0,
                type: o.ordType ?? "Market",
                action: o.action ?? "Buy",
                label: o.text,
              }))}
            pendingSignals={data.pending_signals?.map((s) => ({
              entry_price: s.entry_price,
              stop_loss: s.stop_loss,
              take_profit: s.take_profit,
              direction: s.direction,
              lot_size: s.lot_size,
              confidence: s.confidence,
              signal_type: s.signal_type,
            }))}
            liquidityZones={data.liquidity_zones?.map((z) => ({
              price_low: z.price_low,
              price_high: z.price_high,
              zone_type: z.zone_type,
            }))}
          />
        </div>

        {/* ═══ STRATEGY PANELS — 3 column grid ═══ */}
        <div className="grid gap-4 lg:grid-cols-3">
          <SessionPhasePanel
            phase={data.session_phase}
            isKillzone={data.is_killzone}
            tradingPermitted={data.trading_permitted}
          />
          <InductionMeter
            state={data.induction_state}
            meter={data.induction_meter}
          />
          <MarketStructurePanel data={data.market_structure} />
        </div>

        {/* ═══ WEEKLY STRUCTURE ═══ */}
        <WeeklyActDisplay currentAct={data.weekly_act} />

        {/* ═══ TRADING: Positions + Order Entry ═══ */}
        <div className="grid gap-4 lg:grid-cols-2">
          <PositionsPanel
            positions={positions}
            lastPrice={quote?.last ?? data.current_price}
            onLiquidate={liquidatePosition}
          />
          <OrderPanel
            isLive={isLive ?? false}
            orderStatus={orderStatus}
            onMarket={placeMarketOrder}
            onBracket={placeBracketOrder}
          />
        </div>

        {/* ═══ LIQUIDITY + SIGNALS ═══ */}
        <div className="grid gap-4 lg:grid-cols-2">
          <LiquidityPanel zones={data.liquidity_zones} />
          <div className="glass-card p-5">
            <h3 className="section-title mb-3">Active Signals</h3>
            {data.pending_signals.length === 0 ? (
              <p className="text-xs text-slate-600">No active signals.</p>
            ) : (
              <div className="space-y-2">
                {data.pending_signals.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-surface-100 px-3 py-2 transition hover:bg-surface-200"
                  >
                    <span className="badge-amber">{s.signal_type}</span>
                    <span className="text-xs text-slate-400">
                      Entry {s.entry_price.toFixed(2)} · SL {s.stop_loss.toFixed(2)} · TP{" "}
                      {s.take_profit.toFixed(2)}
                    </span>
                    <span className="text-xs font-semibold text-brand">
                      {(s.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ FILLS + TRADE HISTORY ═══ */}
        <div className="grid gap-4 lg:grid-cols-2">
          <FillsPanel fills={fills} />
          <TradeHistory trades={data.trade_history} />
        </div>

        {/* ═══ FOOTER ═══ */}
        <footer className="border-t border-white/[0.04] py-6 text-center">
          <p className="text-[11px] text-slate-600">
            Smart<span className="text-brand/60">Money</span> NAS100 · Institutional Execution Engine · {new Date().getFullYear()}
          </p>
        </footer>
      </main>
    </div>
  );
}
