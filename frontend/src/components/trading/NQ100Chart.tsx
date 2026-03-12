"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { CandleBar } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════
 *  NQ100 Candlestick Chart — TradingView-style
 *
 *  Features:
 *  - OHLC info bar with live price change
 *  - Bid / Ask DOM-style buttons
 *  - Timeframe selector
 *  - Position markers
 *  - Responsive dark theme matching TradingView
 * ═══════════════════════════════════════════════════════════════════ */

interface NQ100ChartProps {
  candles: CandleBar[];
  lastPrice?: number;
  bid?: number;
  ask?: number;
  symbol?: string;
  selectedTf?: string;
  onTimeframeChange?: (tf: string) => void;
  positions?: { netPos: number; netPrice: number; contractId: number }[];
  liquidityZones?: {
    price_low: number;
    price_high: number;
    zone_type: string;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────
const fmt = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

export default function NQ100Chart({
  candles,
  lastPrice,
  bid,
  ask,
  symbol = "NQ100",
  selectedTf = "1m",
  onTimeframeChange,
  positions,
  liquidityZones,
}: NQ100ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const [ready, setReady] = useState(false);
  const [crosshairData, setCrosshairData] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    time: number;
  } | null>(null);

  // ── Derived OHLC (crosshair or last bar) ───────────────────────
  const ohlc = useMemo(() => {
    if (crosshairData) return crosshairData;
    if (candles.length === 0) return null;
    const last = candles[candles.length - 1];
    return {
      open: last.open,
      high: last.high,
      low: last.low,
      close: lastPrice && lastPrice > 0 ? lastPrice : last.close,
      time: last.time,
    };
  }, [crosshairData, candles, lastPrice]);

  // Price change from open
  const change = ohlc ? ohlc.close - ohlc.open : 0;
  const changePct = ohlc && ohlc.open > 0 ? (change / ohlc.open) * 100 : 0;
  const isUp = change >= 0;

  // Spread
  const spread =
    bid && ask && bid > 0 && ask > 0 ? (ask - bid).toFixed(2) : null;

  // ── Prepare unique sorted candles ──────────────────────────────
  const uniqueCandles = useMemo(() => {
    if (candles.length === 0) return [];
    const seen = new Set<number>();
    const arr = candles.filter((c) => {
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    });
    arr.sort((a, b) => a.time - b.time);
    return arr;
  }, [candles]);

  // ── Create chart once ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    (async () => {
      const lc = await import("lightweight-charts");
      if (destroyed || !containerRef.current) return;

      const chart = lc.createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 560,
        layout: {
          background: { type: lc.ColorType.Solid, color: "#131722" },
          textColor: "#787b86",
          fontSize: 11,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        },
        grid: {
          vertLines: { color: "#1e222d" },
          horzLines: { color: "#1e222d" },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: {
            color: "#758696",
            width: 1,
            style: lc.LineStyle.Dashed,
            labelBackgroundColor: "#2a2e39",
          },
          horzLine: {
            color: "#758696",
            width: 1,
            style: lc.LineStyle.Dashed,
            labelBackgroundColor: "#2a2e39",
          },
        },
        rightPriceScale: {
          borderColor: "#2a2e39",
          scaleMargins: { top: 0.06, bottom: 0.1 },
        },
        timeScale: {
          borderColor: "#2a2e39",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 8,
          barSpacing: 6,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
      });

      // Candlestick series — TradingView default colors
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderUpColor: "#26a69a",
        borderDownColor: "#ef5350",
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      });

      // Volume histogram — subtle at bottom
      const volumeSeries = chart.addSeries(lc.HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });

      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.88, bottom: 0 },
      });

      // Crosshair move handler for OHLC info bar
      chart.subscribeCrosshairMove((param: any) => {
        if (!param || !param.time) {
          setCrosshairData(null);
          return;
        }
        const data = param.seriesData?.get(candleSeries);
        if (data && "open" in data) {
          setCrosshairData({
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            time: typeof param.time === "number" ? param.time : 0,
          });
        }
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volumeSeries;

      // Responsive resize
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      ro.observe(containerRef.current);

      setReady(true);

      return () => {
        ro.disconnect();
        chart.remove();
      };
    })();

    return () => {
      destroyed = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // ── Feed candle data ───────────────────────────────────────────
  useEffect(() => {
    if (!ready || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    if (uniqueCandles.length === 0) return;

    candleSeriesRef.current.setData(
      uniqueCandles.map((c) => ({
        time: c.time as import("lightweight-charts").UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    volumeSeriesRef.current.setData(
      uniqueCandles.map((c) => ({
        time: c.time as import("lightweight-charts").UTCTimestamp,
        value: c.volume,
        color:
          c.close >= c.open
            ? "rgba(38,166,154,0.15)"
            : "rgba(239,83,80,0.15)",
      }))
    );
  }, [uniqueCandles, ready]);

  // ── Live price update ──────────────────────────────────────────
  useEffect(() => {
    if (!ready || !candleSeriesRef.current || !lastPrice || lastPrice <= 0)
      return;
    if (uniqueCandles.length === 0) return;

    const last = uniqueCandles[uniqueCandles.length - 1];
    if (!last) return;

    candleSeriesRef.current.update({
      time: last.time as import("lightweight-charts").UTCTimestamp,
      open: last.open,
      high: Math.max(last.high, lastPrice),
      low: Math.min(last.low, lastPrice),
      close: lastPrice,
    });
  }, [lastPrice, uniqueCandles, ready]);

  // ── Position markers ───────────────────────────────────────────
  useEffect(() => {
    if (!ready || !candleSeriesRef.current) return;

    const openPos = positions?.filter((p) => p.netPos !== 0) ?? [];

    if (openPos.length > 0 && uniqueCandles.length > 0) {
      const lastTime = uniqueCandles[uniqueCandles.length - 1]?.time;
      if (lastTime) {
        const markers = openPos.map((p) => ({
          time: lastTime as import("lightweight-charts").UTCTimestamp,
          position: (p.netPos > 0 ? "belowBar" : "aboveBar") as
            | "belowBar"
            | "aboveBar",
          color: p.netPos > 0 ? "#26a69a" : "#ef5350",
          shape: (p.netPos > 0 ? "arrowUp" : "arrowDown") as
            | "arrowUp"
            | "arrowDown",
          text: `${p.netPos > 0 ? "LONG" : "SHORT"} @ ${fmt(p.netPrice)}`,
        }));

        if (markersRef.current) {
          markersRef.current.setMarkers(markers);
        } else {
          (async () => {
            const { createSeriesMarkers } = await import("lightweight-charts");
            if (candleSeriesRef.current) {
              markersRef.current = createSeriesMarkers(
                candleSeriesRef.current,
                markers
              );
            }
          })();
        }
      }
    } else {
      if (markersRef.current) markersRef.current.setMarkers([]);
    }
  }, [positions, uniqueCandles, ready]);

  // ── Price line style ───────────────────────────────────────────
  useEffect(() => {
    if (!ready || !candleSeriesRef.current || !lastPrice || lastPrice <= 0)
      return;

    candleSeriesRef.current.applyOptions({
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineColor: isUp ? "#26a69a" : "#ef5350",
      priceLineStyle: 0,
    });
  }, [lastPrice, isUp, ready]);

  // ── Timeframe buttons ──────────────────────────────────────────
  const timeframes = ["1m", "5m", "15m", "1H", "4H", "1D"];

  const handleTfClick = useCallback(
    (tf: string) => {
      if (onTimeframeChange) onTimeframeChange(tf);
    },
    [onTimeframeChange]
  );

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="overflow-hidden rounded-lg border border-[#2a2e39] bg-[#131722]">
      {/* ── Top toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-[#2a2e39] px-3 py-1.5">
        {/* Symbol chip */}
        <div className="mr-2 flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-[#d1d4dc]">
            {symbol}
          </span>
          <span className="text-[10px] text-[#787b86]">
            NASDAQ 100 E-mini Futures
          </span>
        </div>

        {/* Separator */}
        <div className="mx-1 h-5 w-px bg-[#2a2e39]" />

        {/* Timeframe selector */}
        <div className="flex items-center gap-0.5">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => handleTfClick(tf)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                selectedTf === tf
                  ? "bg-[#2962ff] text-white"
                  : "text-[#787b86] hover:text-[#d1d4dc]"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="mx-1 h-5 w-px bg-[#2a2e39]" />

        {/* Candle count */}
        <span className="text-[10px] text-[#787b86]">
          {candles.length} bars
        </span>

        {/* Right side: Bid / Ask badges */}
        <div className="ml-auto flex items-center gap-1">
          {bid && bid > 0 && (
            <span className="rounded bg-[#ef5350] px-2.5 py-1 text-[11px] font-bold text-white">
              {fmt(bid)}
              <span className="ml-1 text-[9px] font-normal opacity-80">
                SELL
              </span>
            </span>
          )}
          {spread && (
            <span className="px-1 text-[10px] text-[#787b86]">{spread}</span>
          )}
          {ask && ask > 0 && (
            <span className="rounded bg-[#2962ff] px-2.5 py-1 text-[11px] font-bold text-white">
              {fmt(ask)}
              <span className="ml-1 text-[9px] font-normal opacity-80">
                BUY
              </span>
            </span>
          )}
        </div>
      </div>

      {/* ── OHLC info bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1 text-[11px]">
        {ohlc ? (
          <>
            <span className="text-[#787b86]">O</span>
            <span className={isUp ? "text-[#26a69a]" : "text-[#ef5350]"}>
              {fmt(ohlc.open)}
            </span>
            <span className="text-[#787b86]">H</span>
            <span className={isUp ? "text-[#26a69a]" : "text-[#ef5350]"}>
              {fmt(ohlc.high)}
            </span>
            <span className="text-[#787b86]">L</span>
            <span className={isUp ? "text-[#26a69a]" : "text-[#ef5350]"}>
              {fmt(ohlc.low)}
            </span>
            <span className="text-[#787b86]">C</span>
            <span className={isUp ? "text-[#26a69a]" : "text-[#ef5350]"}>
              {fmt(ohlc.close)}
            </span>
            <span className="ml-1.5 text-[#787b86]">
              {change >= 0 ? "+" : ""}
              {fmt(change)} ({changePct >= 0 ? "+" : ""}
              {changePct.toFixed(2)}%)
            </span>
          </>
        ) : (
          <span className="text-[#787b86]">Waiting for data…</span>
        )}

        {/* Position badges */}
        {positions &&
          positions.filter((p) => p.netPos !== 0).length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              {positions
                .filter((p) => p.netPos !== 0)
                .map((p, i) => (
                  <span
                    key={i}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                      p.netPos > 0
                        ? "bg-[#26a69a]/15 text-[#26a69a]"
                        : "bg-[#ef5350]/15 text-[#ef5350]"
                    }`}
                  >
                    {p.netPos > 0 ? "LONG" : "SHORT"} {Math.abs(p.netPos)} @{" "}
                    {fmt(p.netPrice)}
                  </span>
                ))}
            </div>
          )}
      </div>

      {/* ── Chart canvas ────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ minHeight: 560 }}
      >
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-[#787b86] animate-pulse">
            Loading chart…
          </div>
        )}
      </div>

      {/* ── Bottom bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-[#2a2e39] px-3 py-1">
        {/* Liquidity zones */}
        {liquidityZones && liquidityZones.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {liquidityZones.slice(0, 5).map((z, i) => (
              <span
                key={i}
                className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                  z.zone_type === "buy_side"
                    ? "bg-[#26a69a]/10 text-[#26a69a]"
                    : "bg-[#ef5350]/10 text-[#ef5350]"
                }`}
              >
                {z.zone_type === "buy_side" ? "▲ BSL" : "▼ SSL"}{" "}
                {fmt(z.price_low)} – {fmt(z.price_high)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-[#363a45]">
            No liquidity zones
          </span>
        )}

        {/* UTC clock */}
        <span className="text-[10px] text-[#363a45]">
          UTC · {selectedTf}
        </span>
      </div>
    </div>
  );
}
