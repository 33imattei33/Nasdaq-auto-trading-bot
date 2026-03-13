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
      <div className="flex min-h-screen items-center justify-center text-red-400">
        Backend unreachable: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400 animate-pulse">
        Connecting to Smart Money engine…
      </div>
    );
  }

  const isLive = health?.broker === "tradovate";
  const autoTradeOn = health?.auto_trade ?? false;

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      {/* Connection Status Bar */}
      <ConnectionStatus health={health} quote={quote} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">
            Smart Money Bot
          </h1>
          <p className="text-xs text-slate-500">
            NAS100 Institutional Strategy — Forexia Signature Engine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={triggerScan}
            className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/30"
          >
            Manual Scan
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

      {/* ═══ CONTROL BAR: Auto-Trade + Close All ═══ */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3">
        {/* Auto-Trade Toggle */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Auto-Trade
          </span>
          <button
            onClick={autoTradeOn ? stopAutoTrade : startAutoTrade}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
              autoTradeOn
                ? "bg-emerald-500/80"
                : "bg-slate-700"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                autoTradeOn ? "translate-x-8" : "translate-x-1"
              }`}
            />
          </button>
          {autoTradeOn && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Running
            </span>
          )}
          {!autoTradeOn && (
            <span className="text-xs text-slate-600">Off</span>
          )}
        </div>

        <div className="mx-2 h-6 w-px bg-slate-700" />

        {/* Close All Positions */}
        <button
          onClick={async () => {
            if (window.confirm("Close ALL positions and cancel ALL orders?")) {
              await closeAllPositions();
            }
          }}
          disabled={!isLive && !(positions && positions.some(p => p.netPos !== 0))}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ✖ Close All Positions
        </button>

        {/* Order status feedback */}
        {orderStatus && (
          <span className={`ml-auto text-xs ${
            orderStatus.startsWith("✓") ? "text-emerald-400" :
            orderStatus.startsWith("✗") ? "text-red-400" :
            "text-amber-300 animate-pulse"
          }`}>
            {orderStatus}
          </span>
        )}
      </div>

      {/* ═══ BOT SIGNAL CHART (internal candles + overlays) ═══ */}
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

      {/* Account row */}
      <AccountPanel
        account={data.account}
        symbol={data.symbol}
        price={quote?.last && quote.last > 0 ? quote.last : data.current_price}
      />

      {/* Strategy panels — 3 column grid */}
      <div className="grid gap-4 md:grid-cols-3">
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

      {/* Weekly act — full width */}
      <WeeklyActDisplay currentAct={data.weekly_act} />

      {/* Trading: Positions + Orders side by side */}
      <div className="grid gap-4 md:grid-cols-2">
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

      {/* Liquidity + Signals */}
      <div className="grid gap-4 md:grid-cols-2">
        <LiquidityPanel zones={data.liquidity_zones} />
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
            Active Signals
          </h3>
          {data.pending_signals.length === 0 ? (
            <p className="text-[10px] text-slate-600">No active signals.</p>
          ) : (
            <div className="space-y-1 text-[10px]">
              {data.pending_signals.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded bg-slate-800/50 px-2 py-1"
                >
                  <span className="text-amber-300">{s.signal_type}</span>
                  <span className="text-slate-400">
                    Entry {s.entry_price.toFixed(2)} | SL {s.stop_loss.toFixed(2)} | TP{" "}
                    {s.take_profit.toFixed(2)}
                  </span>
                  <span className="text-slate-500">
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fills + Trade History */}
      <div className="grid gap-4 md:grid-cols-2">
        <FillsPanel fills={fills} />
        <TradeHistory trades={data.trade_history} />
      </div>
    </main>
  );
}
