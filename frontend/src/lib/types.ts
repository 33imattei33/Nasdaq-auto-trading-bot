/* ═══════════════════════════════════════════════════════════════════
 *  SMART MONEY BOT — TYPESCRIPT CONTRACTS
 *  Mirrors backend Pydantic schemas exactly
 * ═══════════════════════════════════════════════════════════════════ */

export type SessionPhase =
  | "ASIAN_CONSOLIDATION"
  | "LONDON_INDUCTION"
  | "NY_REVERSAL"
  | "OFF_SESSION";

export type WeeklyAct =
  | "CONNECTOR"
  | "ACCUMULATION"
  | "REVERSAL"
  | "DISTRIBUTION"
  | "EPILOGUE";

export type InductionState =
  | "NO_PATTERN"
  | "WEDGE_FORMING"
  | "TRIANGLE_FORMING"
  | "FALSE_BREAKOUT"
  | "STOP_HUNT_ACTIVE"
  | "EXHAUSTION_DETECTED"
  | "REVERSAL_CONFIRMED";

export type TradeDirection = "BUY" | "SELL";

export type MarketTrend = "BULLISH" | "BEARISH" | "RANGING";

export type VolatilityState = "LOW" | "NORMAL" | "HIGH" | "EXTREME";

export interface LiquidityZone {
  price_low: number;
  price_high: number;
  zone_type: string;
  strength: number;
  tested: boolean;
}

export interface MarketStructureData {
  symbol: string;
  trend: MarketTrend;
  trend_strength: number;
  volatility: VolatilityState;
  atr: number;
  bias_score: number;
  support_levels: number[];
  resistance_levels: number[];
  liquidity_zones: LiquidityZone[];
  psych_levels: number[];
}

export interface TradeRecord {
  trade_id: string;
  symbol: string;
  direction: TradeDirection;
  entry_price: number;
  stop_loss: number;
  take_profit: number | null;
  lot_size: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
  pnl: number;
  signal_type: string;
}

export interface AccountState {
  balance: number;
  equity: number;
  free_margin: number;
  leverage: number;
  open_positions: number;
  daily_pnl: number;
}

export interface ForexiaSignal {
  signal_id: string;
  symbol: string;
  direction: TradeDirection;
  signal_type: string;
  entry: number;
  stop_loss: number;
  take_profit: number;
  lot_size: number;
  confidence: number;
  entry_price: number;
  induction_state: InductionState;
  session_phase: SessionPhase;
  weekly_act: WeeklyAct;
}

export interface DashboardState {
  account: AccountState;
  symbol: string;
  current_price: number;
  session_phase: SessionPhase;
  weekly_act: WeeklyAct;
  induction_state: InductionState;
  induction_meter: number;
  is_killzone: boolean;
  trading_permitted: boolean;
  pending_signals: ForexiaSignal[];
  trade_history: TradeRecord[];
  liquidity_zones: LiquidityZone[];
  market_structure: MarketStructureData | null;
}

/* Legacy compat (old TradingPanel props) */
export type TradingPhase = SessionPhase | "RESET";
export type TradeSide = TradeDirection;

export interface PanelTrade {
  id: string;
  side: TradeSide;
  entry: number;
  stopLoss: number;
  lot: number;
  status: "OPEN" | "CLOSED" | "REJECTED";
  time: string;
}

/* ─── Tradovate Live Types ─── */

export interface HealthInfo {
  status: string;
  broker: "tradovate" | "paper";
  mode: "LIVE" | "DEMO" | "paper";
  session: SessionPhase;
  weekly_act: WeeklyAct;
  uptime_seconds: number;
  auto_trade?: boolean;
  account_spec?: string;
  account_id?: number;
  front_month?: string;
  last_price?: number;
  ws_streams?: number;
  candle_count?: number;
  token_valid?: boolean;
}

export interface LiveQuote {
  source: string;
  symbol?: string;
  last: number;
  bid: number;
  ask: number;
}

export interface TradovatePosition {
  id: number;
  accountId: number;
  contractId: number;
  timestamp: string;
  tradeDate: { year: number; month: number; day: number };
  netPos: number;
  netPrice: number;
  bought: number;
  boughtValue: number;
  sold: number;
  soldValue: number;
  prevPos: number;
  prevPrice: number;
}

export interface TradovateOrder {
  id: number;
  accountId: number;
  contractId: number;
  timestamp: string;
  action: string;
  ordType: string;
  ordStatus: string;
  qty?: number;
  filledQty?: number;
  avgPx?: number;
  price?: number;
  stopPrice?: number;
  text?: string;
}

export interface TradovateFill {
  id: number;
  orderId: number;
  contractId: number;
  timestamp: string;
  action: string;
  qty: number;
  price: number;
  active: boolean;
}

export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradingPanelData {
  symbol: string;
  price: number;
  phase: TradingPhase;
  activeRiskPercent: number;
  equity: number;
  tradeHistory: PanelTrade[];
}
