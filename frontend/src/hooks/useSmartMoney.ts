/**
 * ═══════════════════════════════════════════════════════════════════
 *  NQ-TRADING AGENTS — useSmartMoney HOOK
 *  Polls backend for dashboard + Tradovate live data
 * ═══════════════════════════════════════════════════════════════════
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type {
  DashboardState,
  HealthInfo,
  LiveQuote,
  TradovatePosition,
  TradovateOrder,
  TradovateFill,
  CandleBar,
} from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useSmartMoney() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [positions, setPositions] = useState<TradovatePosition[]>([]);
  const [orders, setOrders] = useState<TradovateOrder[]>([]);
  const [fills, setFills] = useState<TradovateFill[]>([]);
  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [timeframe, setTimeframe] = useState<string>("1m");
  const timeframeRef = useRef<string>("1m");
  const [error, setError] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const mounted = useRef(true);
  const failCount = useRef(0);
  const FAIL_THRESHOLD = 3; // show error only after 3 consecutive failures

  /* ── Primary poll (dashboard + health) ── */
  const poll = useCallback(async () => {
    try {
      const [dashRes, healthRes] = await Promise.all([
        fetch(`${API}/api/dashboard`),
        fetch(`${API}/health`),
      ]);
      if (!dashRes.ok) throw new Error(`HTTP ${dashRes.status}`);
      const json: DashboardState = await dashRes.json();
      if (mounted.current) {
        setData(json);
        setError(null);
        failCount.current = 0;
      }
      if (healthRes.ok) {
        const h: HealthInfo = await healthRes.json();
        if (mounted.current) setHealth(h);
      }
    } catch (err: unknown) {
      if (mounted.current) {
        failCount.current += 1;
        if (failCount.current >= FAIL_THRESHOLD) {
          setError(
            `Backend unreachable: ${
              err instanceof Error ? err.message : "Failed to fetch"
            }`
          );
        }
      }
    }
  }, []);

  /* ── Live data poll (quote, positions, orders, fills) ── */
  const pollLive = useCallback(async () => {
    try {
      const [qRes, pRes, oRes, fRes] = await Promise.all([
        fetch(`${API}/api/quote`),
        fetch(`${API}/api/positions`),
        fetch(`${API}/api/orders`),
        fetch(`${API}/api/fills`),
      ]);
      if (qRes.ok) {
        const q = await qRes.json();
        if (mounted.current) setQuote(q);
      }
      if (pRes.ok) {
        const p = await pRes.json();
        if (mounted.current) setPositions(p.positions ?? []);
      }
      if (oRes.ok) {
        const o = await oRes.json();
        if (mounted.current) setOrders(o.orders ?? []);
      }
      if (fRes.ok) {
        const f = await fRes.json();
        if (mounted.current) setFills(f.fills ?? []);
      }
      // Candles for chart
      try {
        const cRes = await fetch(`${API}/api/candles?limit=10000&tf=${timeframeRef.current}`);
        if (cRes.ok) {
          const c = await cRes.json();
          if (mounted.current) setCandles(c.candles ?? []);
        }
      } catch { /* chart data failure is non-fatal */ }
    } catch {
      /* live data failure is non-fatal */
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    poll();
    pollLive();
    const id1 = setInterval(poll, 5000);
    const id2 = setInterval(pollLive, 5000);
    return () => {
      mounted.current = false;
      clearInterval(id1);
      clearInterval(id2);
    };
  }, [poll, pollLive]);

  /* ── Actions ── */

  const triggerScan = useCallback(async () => {
    try {
      await fetch(`${API}/api/bot/scan`, { method: "POST" });
      await poll();
    } catch {
      /* swallow */
    }
  }, [poll]);

  const changeTimeframe = useCallback(
    async (tf: string) => {
      setTimeframe(tf);
      timeframeRef.current = tf;
      // Clear candles immediately so chart resets
      setCandles([]);
      try {
        await fetch(`${API}/api/timeframe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeframe: tf }),
        });
        // Fetch new candles with the new timeframe
        const cRes = await fetch(`${API}/api/candles?limit=10000&tf=${tf}`);
        if (cRes.ok) {
          const c = await cRes.json();
          if (mounted.current) setCandles(c.candles ?? []);
        }
      } catch {
        /* swallow */
      }
    },
    []
  );

  const placeMarketOrder = useCallback(
    async (action: "Buy" | "Sell", qty: number = 1) => {
      setOrderStatus("placing…");
      try {
        const res = await fetch(`${API}/api/order/market`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, qty }),
        });
        const json = await res.json();
        setOrderStatus(res.ok ? `✓ ${json.status}` : `✗ ${json.detail ?? "error"}`);
        pollLive();
      } catch (e: unknown) {
        setOrderStatus(`✗ ${e instanceof Error ? e.message : "failed"}`);
      }
      setTimeout(() => setOrderStatus(null), 4000);
    },
    [pollLive],
  );

  const placeBracketOrder = useCallback(
    async (
      action: "Buy" | "Sell",
      qty: number = 1,
      profitTicks: number = 80,
      stopTicks: number = 20,
    ) => {
      setOrderStatus("placing bracket…");
      try {
        const res = await fetch(`${API}/api/order/bracket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            qty,
            profit_target_ticks: profitTicks,
            stop_loss_ticks: stopTicks,
          }),
        });
        const json = await res.json();
        setOrderStatus(res.ok ? `✓ ${json.status}` : `✗ ${json.detail ?? "error"}`);
        pollLive();
      } catch (e: unknown) {
        setOrderStatus(`✗ ${e instanceof Error ? e.message : "failed"}`);
      }
      setTimeout(() => setOrderStatus(null), 4000);
    },
    [pollLive],
  );

  const cancelOrder = useCallback(
    async (orderId: number) => {
      try {
        await fetch(`${API}/api/order/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId }),
        });
        pollLive();
      } catch {
        /* swallow */
      }
    },
    [pollLive],
  );

  const liquidatePosition = useCallback(
    async (contractId: number) => {
      try {
        await fetch(`${API}/api/order/liquidate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contract_id: contractId }),
        });
        pollLive();
      } catch {
        /* swallow */
      }
    },
    [pollLive],
  );

  const connectAccount = useCallback(
    async (creds: {
      username: string;
      password: string;
      live: boolean;
      cid?: number;
      sec?: string;
    }) => {
      const res = await fetch(`${API}/api/settings/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const json = await res.json();
      // Refresh health immediately if connected
      if (json.connected) {
        await poll();
        await pollLive();
      }
      return json as {
        connected: boolean;
        error?: string;
        hint?: string;
        account_spec?: string;
      };
    },
    [poll, pollLive],
  );

  const connectWithToken = useCallback(
    async (payload: {
      access_token: string;
      md_access_token?: string;
      live: boolean;
    }) => {
      const res = await fetch(`${API}/api/settings/connect-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.connected) {
        await poll();
        await pollLive();
      }
      return json as {
        connected: boolean;
        error?: string;
        account_spec?: string;
      };
    },
    [poll, pollLive],
  );

  const browserLogin = useCallback(
    async (payload: {
      username: string;
      password: string;
      live: boolean;
    }) => {
      // Long timeout — user needs to complete login in the browser
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 200_000);
      try {
        const res = await fetch(`${API}/api/settings/browser-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const json = await res.json();
        if (json.connected) {
          await poll();
          await pollLive();
        }
        return json as {
          connected: boolean;
          error?: string;
          account_spec?: string;
        };
      } finally {
        clearTimeout(timer);
      }
    },
    [poll, pollLive],
  );

  const disconnectAccount = useCallback(async () => {
    await fetch(`${API}/api/settings/disconnect`, { method: "POST" });
    await poll();
  }, [poll]);

  const startAutoTrade = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/bot/auto-trade/start`, { method: "POST" });
      const json = await res.json();
      await poll();
      return json as { status: string; stats: Record<string, unknown> };
    } catch {
      return { status: "error", stats: {} };
    }
  }, [poll]);

  const stopAutoTrade = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/bot/auto-trade/stop`, { method: "POST" });
      const json = await res.json();
      await poll();
      return json as { status: string; stats: Record<string, unknown> };
    } catch {
      return { status: "error", stats: {} };
    }
  }, [poll]);

  const closeAllPositions = useCallback(async () => {
    setOrderStatus("Closing all positions…");
    try {
      const res = await fetch(`${API}/api/order/close-all`, { method: "POST" });
      const json = await res.json();
      setOrderStatus(`✓ ${json.summary ?? "Done"}`);
      await pollLive();
      return json;
    } catch (e: unknown) {
      setOrderStatus(`✗ ${e instanceof Error ? e.message : "failed"}`);
    }
    setTimeout(() => setOrderStatus(null), 5000);
  }, [pollLive]);

  return {
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
    cancelOrder,
    liquidatePosition,
    connectAccount,
    connectWithToken,
    browserLogin,
    disconnectAccount,
    startAutoTrade,
    stopAutoTrade,
    closeAllPositions,
  };
}
