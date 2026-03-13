"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { CandleBar } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════
 *  NQ100 Candlestick Chart — TradingView-style (v3 bulletproof)
 *
 *  Uses module-level caching of the lightweight-charts import to
 *  eliminate async race conditions. Chart init is as synchronous as
 *  possible — the only async part is the initial module load.
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

// ── Module-level cache so we only import once across all renders ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lcModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lcPromise: Promise<any> | null = null;

function getLightweightCharts() {
  if (lcModule) return Promise.resolve(lcModule);
  if (!lcPromise) {
    lcPromise = import("lightweight-charts").then((mod) => {
      lcModule = mod;
      console.log(
        "[Chart] lightweight-charts loaded OK, version:",
        mod.version ?? "unknown"
      );
      return mod;
    });
  }
  return lcPromise;
}

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
  const positionLinesRef = useRef<any[]>([]);
  const liqZoneLinesRef = useRef<any[]>([]);
  const roRef = useRef<ResizeObserver | null>(null);
  const prevCandleCountRef = useRef<number>(0);
  const initialFitDone = useRef(false);
  const lastChartTimeRef = useRef<number>(0);
  const lastDataKeyRef = useRef<string>("");
  const inflightHighRef = useRef<number>(0);
  const inflightLowRef = useRef<number>(Infinity);
  const inflightTimeRef = useRef<number>(0);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const [ready, setReady] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [clock, setClock] = useState("");
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
    const live = lastPrice && lastPrice > 0 ? lastPrice : last.close;
    return {
      open: last.open,
      high: Math.max(last.high, live),
      low: Math.min(last.low, live),
      close: live,
      time: last.time,
    };
  }, [crosshairData, candles, lastPrice]);

  const change = ohlc ? ohlc.close - ohlc.open : 0;
  const changePct = ohlc && ohlc.open > 0 ? (change / ohlc.open) * 100 : 0;
  const isUp = change >= 0;
  const spread =
    bid && ask && bid > 0 && ask > 0 && ask !== bid
      ? (ask - bid).toFixed(2)
      : null;

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

  // ── Create chart once on mount ─────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      console.error("[Chart] containerRef is null — cannot init");
      return;
    }

    // Guard: if chart already exists on this container, skip
    if (chartRef.current) {
      console.log("[Chart] chart already exists, skipping init");
      return;
    }

    let disposed = false;

    console.log("[Chart] useEffect firing, loading lightweight-charts…");

    getLightweightCharts()
      .then((lc) => {
        if (disposed) {
          console.log("[Chart] disposed before init completed — aborting");
          return;
        }
        // Double-check: another effect run may have already created it
        if (chartRef.current) {
          console.log("[Chart] chart created by another effect — skipping");
          return;
        }

        const w = container.clientWidth;
        const h = 560;
        console.log("[Chart] Container dimensions:", w, "x", h);

        const chart = lc.createChart(container, {
          width: Math.max(w, 200),
          height: h,
          layout: {
            background: { type: lc.ColorType.Solid, color: "#131722" },
            textColor: "#787b86",
            fontSize: 11,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
          },
          grid: {
            vertLines: { color: "rgba(42, 46, 57, 0.6)" },
            horzLines: { color: "rgba(42, 46, 57, 0.6)" },
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
            scaleMargins: { top: 0.05, bottom: 0.15 },
            textColor: "#787b86",
          },
          timeScale: {
            borderColor: "#2a2e39",
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 12,
            barSpacing: 7,
            fixLeftEdge: false,
            fixRightEdge: false,
            minBarSpacing: 2,
          },
        });

        console.log("[Chart] createChart() returned:", !!chart);

        const candleSeries = chart.addSeries(lc.CandlestickSeries, {
          upColor: "#26a69a",
          downColor: "#ef5350",
          borderUpColor: "#26a69a",
          borderDownColor: "#ef5350",
          wickUpColor: "#26a69a",
          wickDownColor: "#ef5350",
        });

        const volumeSeries = chart.addSeries(lc.HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
        });

        chart.priceScale("volume").applyOptions({
          scaleMargins: { top: 0.85, bottom: 0 },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

        // Add watermark like TradingView
        chart.applyOptions({
          watermark: {
            visible: true,
            fontSize: 48,
            horzAlign: "center",
            vertAlign: "center",
            color: "rgba(120, 123, 134, 0.08)",
            text: "Smart Money Bot",
          },
        });

        // Responsive resize
        const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (chartRef.current) {
              chartRef.current.applyOptions({
                width: entry.contentRect.width,
              });
            }
          }
        });
        ro.observe(container);
        roRef.current = ro;

        console.log("[Chart] ✓ Fully initialized, setting ready=true");
        setReady(true);
        setChartError(null);
      })
      .catch((err) => {
        console.error("[Chart] INIT FAILED:", err);
        setChartError(
          err instanceof Error ? err.message : "Failed to load chart library"
        );
      });

    return () => {
      console.log("[Chart] Cleanup running");
      disposed = true;
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch {
          /* already removed */
        }
        chartRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
        markersRef.current = null;
        positionLinesRef.current = [];
        liqZoneLinesRef.current = [];
        setReady(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset chart state when timeframe changes ───────────────────
  useEffect(() => {
    prevCandleCountRef.current = 0;
    lastChartTimeRef.current = 0;
    lastDataKeyRef.current = "";
    initialFitDone.current = false;
    inflightHighRef.current = 0;
    inflightLowRef.current = Infinity;
    inflightTimeRef.current = 0;
  }, [selectedTf]);

  // ── Feed candle data into chart ────────────────────────────────
  useEffect(() => {
    if (!ready || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    if (uniqueCandles.length === 0) {
      console.log("[Chart] ready but no candles yet");
      return;
    }

    const last = uniqueCandles[uniqueCandles.length - 1];
    const first = uniqueCandles[0];
    // Build a key from boundaries to detect when the dataset has truly changed
    const dataKey = `${first.time}:${last.time}:${uniqueCandles.length}`;
    const prevCount = prevCandleCountRef.current;
    const newCount = uniqueCandles.length;
    const needsFullReload =
      prevCount === 0 ||
      Math.abs(newCount - prevCount) > 50 ||
      last.time < lastChartTimeRef.current - 120 ||
      lastDataKeyRef.current === "";

    try {
      if (needsFullReload) {
        // Save current scroll position if chart was already showing data
        const timeScale = chartRef.current?.timeScale();
        const savedRange = prevCount > 0 && timeScale
          ? timeScale.getVisibleLogicalRange()
          : null;

        // Full reload: first load, big data change, or time went backwards
        candleSeriesRef.current.setData(
          uniqueCandles.map((c) => ({
            time: c.time as number,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );

        volumeSeriesRef.current.setData(
          uniqueCandles.map((c) => ({
            time: c.time as number,
            value: c.volume ?? 0,
            color:
              c.close >= c.open
                ? "rgba(38,166,154,0.35)"
                : "rgba(239,83,80,0.35)",
          }))
        );

        // On very first load, show last ~150 bars at a readable zoom
        if (!initialFitDone.current && timeScale) {
          const total = uniqueCandles.length;
          const barsToShow = Math.min(150, total);
          timeScale.setVisibleLogicalRange({
            from: total - barsToShow,
            to: total + 10,
          });
          initialFitDone.current = true;
        } else if (savedRange && timeScale) {
          // Restore scroll position after full reload (e.g. yfinance refresh)
          timeScale.setVisibleLogicalRange(savedRange);
        }
      } else if (last.time >= lastChartTimeRef.current) {
        // Incremental update — only if time is >= last known chart time
        candleSeriesRef.current.update({
          time: last.time as number,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
        });
        volumeSeriesRef.current.update({
          time: last.time as number,
          value: last.volume ?? 0,
          color:
            last.close >= last.open
              ? "rgba(38,166,154,0.35)"
              : "rgba(239,83,80,0.35)",
        });
      }

      lastChartTimeRef.current = last.time;
      lastDataKeyRef.current = dataKey;
      prevCandleCountRef.current = newCount;
    } catch (err) {
      console.error("[Chart] setData error:", err);
      // Recovery: force full reload on next cycle
      prevCandleCountRef.current = 0;
      lastChartTimeRef.current = 0;
      lastDataKeyRef.current = "";
    }
  }, [uniqueCandles, ready]);

  // ── Live price update ──────────────────────────────────────────
  useEffect(() => {
    if (!ready || !candleSeriesRef.current || !lastPrice || lastPrice <= 0)
      return;
    if (uniqueCandles.length === 0) return;

    const last = uniqueCandles[uniqueCandles.length - 1];
    if (!last) return;
    // Only update if this bar's time is >= the last time we set in the chart
    if (last.time < lastChartTimeRef.current) return;

    try {
      // Track in-flight extremes so wicks never shrink mid-bar
      if (last.time !== inflightTimeRef.current) {
        inflightHighRef.current = last.high;
        inflightLowRef.current = last.low;
        inflightTimeRef.current = last.time as number;
      }
      inflightHighRef.current = Math.max(inflightHighRef.current, last.high, lastPrice);
      inflightLowRef.current = Math.min(inflightLowRef.current, last.low, lastPrice);

      candleSeriesRef.current.update({
        time: last.time as number,
        open: last.open,
        high: inflightHighRef.current,
        low: inflightLowRef.current,
        close: lastPrice,
      });
      lastChartTimeRef.current = last.time;
    } catch (err) {
      console.error("[Chart] update error:", err);
    }
  }, [lastPrice, uniqueCandles, ready]);

  // ── Position markers ───────────────────────────────────────────
  useEffect(() => {
    if (!ready || !candleSeriesRef.current) return;

    try {
      const openPos = positions?.filter((p) => p.netPos !== 0) ?? [];

      if (openPos.length > 0 && uniqueCandles.length > 0) {
        const lastTime = uniqueCandles[uniqueCandles.length - 1]?.time;
        if (lastTime) {
          const markers = openPos.map((p) => ({
            time: lastTime as number,
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
            getLightweightCharts()
              .then(({ createSeriesMarkers }) => {
                if (candleSeriesRef.current) {
                  markersRef.current = createSeriesMarkers(
                    candleSeriesRef.current,
                    markers
                  );
                }
              })
              .catch(() => {
                /* markers non-critical */
              });
          }
        }
      } else {
        if (markersRef.current) markersRef.current.setMarkers([]);
      }
    } catch (err) {
      console.error("[Chart] Markers error:", err);
    }
  }, [positions, uniqueCandles, ready]);

  // ── Position entry price lines (persistent horizontal lines) ──
  useEffect(() => {
    if (!ready || !candleSeriesRef.current) return;

    // Remove old lines
    for (const line of positionLinesRef.current) {
      try { candleSeriesRef.current.removePriceLine(line); } catch { /* ok */ }
    }
    positionLinesRef.current = [];

    const openPos = positions?.filter((p) => p.netPos !== 0) ?? [];
    for (const p of openPos) {
      try {
        const isLong = p.netPos > 0;
        const line = candleSeriesRef.current.createPriceLine({
          price: p.netPrice,
          color: isLong ? "#26a69a" : "#ef5350",
          lineWidth: 2,
          lineStyle: 0, // Solid
          axisLabelVisible: true,
          title: `${isLong ? "LONG" : "SHORT"} Entry`,
          lineVisible: true,
          axisLabelColor: isLong ? "#26a69a" : "#ef5350",
          axisLabelTextColor: "#ffffff",
        });
        positionLinesRef.current.push(line);
      } catch { /* non-critical */ }
    }
  }, [positions, ready]);

  // ── Liquidity zone price lines (support/resistance bands) ─────
  useEffect(() => {
    if (!ready || !candleSeriesRef.current) return;

    // Remove old zone lines
    for (const line of liqZoneLinesRef.current) {
      try { candleSeriesRef.current.removePriceLine(line); } catch { /* ok */ }
    }
    liqZoneLinesRef.current = [];

    const zones = liquidityZones ?? [];
    for (const z of zones.slice(0, 8)) {
      try {
        const isBuy = z.zone_type === "buy_side";
        // Draw high and low of each zone
        const lineHigh = candleSeriesRef.current.createPriceLine({
          price: z.price_high,
          color: isBuy ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)",
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: false,
          title: "",
          lineVisible: true,
        });
        const lineLow = candleSeriesRef.current.createPriceLine({
          price: z.price_low,
          color: isBuy ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)",
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: isBuy ? "BSL" : "SSL",
          lineVisible: true,
          axisLabelColor: isBuy ? "rgba(38,166,154,0.7)" : "rgba(239,83,80,0.7)",
          axisLabelTextColor: "#ffffff",
        });
        liqZoneLinesRef.current.push(lineHigh, lineLow);
      } catch { /* non-critical */ }
    }
  }, [liquidityZones, ready]);

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

  // ── Chart navigation ──────────────────────────────────────────
  const scrollToStart = useCallback(() => {
    const ts = chartRef.current?.timeScale();
    if (!ts || uniqueCandles.length === 0) return;
    const barsToShow = Math.min(150, uniqueCandles.length);
    ts.setVisibleLogicalRange({ from: -10, to: barsToShow });
  }, [uniqueCandles]);

  const scrollToEnd = useCallback(() => {
    const ts = chartRef.current?.timeScale();
    if (!ts || uniqueCandles.length === 0) return;
    const total = uniqueCandles.length;
    const barsToShow = Math.min(150, total);
    ts.setVisibleLogicalRange({ from: total - barsToShow, to: total + 10 });
  }, [uniqueCandles]);

  const fitAll = useCallback(() => {
    chartRef.current?.timeScale()?.fitContent();
  }, []);

  // ── Date range of loaded data ─────────────────────────────────
  const dateRange = useMemo(() => {
    if (uniqueCandles.length < 2) return null;
    const first = new Date(uniqueCandles[0].time * 1000);
    const last = new Date(uniqueCandles[uniqueCandles.length - 1].time * 1000);
    const fmtDate = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmtDate(first)} – ${fmtDate(last)}`;
  }, [uniqueCandles]);

  // ── Volume label for last bar ───────────────────────────────────
  const lastVolume = useMemo(() => {
    if (candles.length === 0) return null;
    const last = candles[candles.length - 1];
    return last.volume ?? 0;
  }, [candles]);

  const fmtVol = (v: number) => {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
    return v.toString();
  };

  // ── Live UTC clock ────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Day change (from today's first candle open vs last close) ──
  const dayChange = useMemo(() => {
    if (uniqueCandles.length < 2) return null;
    // Find today's first candle (UTC day start)
    const nowUtc = new Date();
    const todayStart = Date.UTC(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth(),
      nowUtc.getUTCDate()
    ) / 1000;
    const todayFirstCandle = uniqueCandles.find((c) => c.time >= todayStart);
    const firstOpen = todayFirstCandle
      ? todayFirstCandle.open
      : uniqueCandles[uniqueCandles.length - 1].open; // fallback
    const currentClose = lastPrice && lastPrice > 0
      ? lastPrice
      : uniqueCandles[uniqueCandles.length - 1].close;
    const pts = currentClose - firstOpen;
    const pct = firstOpen > 0 ? (pts / firstOpen) * 100 : 0;
    return { pts, pct, up: pts >= 0 };
  }, [uniqueCandles, lastPrice]);

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="overflow-hidden rounded-lg border border-[#2a2e39] bg-[#131722]">
      {/* ── Symbol header + OHLC (TradingView style) ────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#2a2e39]">
        {/* Symbol name */}
        <span className="text-[13px] font-bold text-[#d1d4dc] tracking-wide">
          {symbol}
        </span>
        <span className="text-[11px] text-[#787b86]">
          NASDAQ 100 E-mini Futures
        </span>

        <div className="mx-0.5 h-4 w-px bg-[#363a45]" />

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

        <div className="mx-0.5 h-4 w-px bg-[#363a45]" />

        <span className="text-[10px] text-[#787b86]">
          {candles.length} bars
        </span>
        {dateRange && (
          <span className="text-[10px] text-[#363a45]">
            {dateRange}
          </span>
        )}

        {/* Chart navigation */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={scrollToStart}
            title="Scroll to oldest data"
            className="rounded px-1.5 py-0.5 text-[10px] text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors"
          >
            ⏮
          </button>
          <button
            onClick={fitAll}
            title="Fit all data"
            className="rounded px-1.5 py-0.5 text-[10px] text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors"
          >
            ⊞
          </button>
          <button
            onClick={scrollToEnd}
            title="Scroll to latest"
            className="rounded px-1.5 py-0.5 text-[10px] text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors"
          >
            ⏭
          </button>
        </div>

        {/* Positions badges (right side) */}
        {positions &&
          positions.filter((p) => p.netPos !== 0).length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              {positions
                .filter((p) => p.netPos !== 0)
                .map((p, i) => (
                  <span
                    key={i}
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      p.netPos > 0
                        ? "bg-[#26a69a]/20 text-[#26a69a]"
                        : "bg-[#ef5350]/20 text-[#ef5350]"
                    }`}
                  >
                    {p.netPos > 0 ? "LONG" : "SHORT"} {Math.abs(p.netPos)} @{" "}
                    {fmt(p.netPrice)}
                  </span>
                ))}
            </div>
          )}
      </div>

      {/* ── OHLC + Volume overlay row ────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-0.5 text-[11px]">
        {ohlc ? (
          <>
            <span className="font-semibold text-[#d1d4dc]">O</span>
            <span className={isUp ? "text-[#26a69a]" : "text-[#ef5350]"}>
              {fmt(ohlc.open)}
            </span>
            <span className="font-semibold text-[#d1d4dc]">H</span>
            <span className={isUp ? "text-[#26a69a]" : "text-[#ef5350]"}>
              {fmt(ohlc.high)}
            </span>
            <span className="font-semibold text-[#d1d4dc]">L</span>
            <span className={isUp ? "text-[#26a69a]" : "text-[#ef5350]"}>
              {fmt(ohlc.low)}
            </span>
            <span className="font-semibold text-[#d1d4dc]">C</span>
            <span className={isUp ? "text-[#26a69a]" : "text-[#ef5350]"}>
              {fmt(ohlc.close)}
            </span>
            <span className={`ml-2 font-medium ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
              {change >= 0 ? "+" : ""}
              {fmt(change)}
            </span>
            <span className={`text-[10px] ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
              ({changePct >= 0 ? "+" : ""}
              {changePct.toFixed(2)}%)
            </span>
          </>
        ) : (
          <span className="text-[#787b86]">Waiting for data…</span>
        )}

        {lastVolume !== null && (
          <span className="ml-4 text-[10px] text-[#787b86]">
            Vol <span className={isUp ? "text-[#26a69a]" : "text-[#ef5350]"}>{fmtVol(lastVolume)}</span>
          </span>
        )}

        {/* Bid / Ask badges */}
        <div className="ml-auto flex items-center gap-1">
          {bid && bid > 0 && (
            <span className="rounded bg-[#ef5350]/90 px-2 py-0.5 text-[10px] font-bold text-white">
              {fmt(bid)}
            </span>
          )}
          {spread && (
            <span className="px-0.5 text-[9px] text-[#787b86]">{spread}</span>
          )}
          {ask && ask > 0 && (
            <span className="rounded bg-[#26a69a]/90 px-2 py-0.5 text-[10px] font-bold text-white">
              {fmt(ask)}
            </span>
          )}
        </div>
      </div>

      {/* ── Chart canvas ────────────────────────────────────────── */}
      <div
        ref={containerRef}
        id="nq-chart-container"
        className="relative w-full"
        style={{ height: 560, minHeight: 560 }}
      >
        {!ready && !chartError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-[#787b86] animate-pulse">
            Loading chart…
          </div>
        )}
        {chartError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-[#ef5350]">
            <span className="text-sm font-medium">Chart Error</span>
            <span className="text-xs text-[#787b86]">{chartError}</span>
          </div>
        )}
      </div>

      {/* ── Bottom bar — liquidity zones + day change + clock ────── */}
      <div className="flex items-center justify-between border-t border-[#2a2e39] px-3 py-1">
        {liquidityZones && liquidityZones.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {liquidityZones.slice(0, 6).map((z, i) => (
              <span
                key={i}
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                  z.zone_type === "buy_side"
                    ? "bg-[#26a69a]/15 text-[#26a69a]"
                    : "bg-[#ef5350]/15 text-[#ef5350]"
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

        <div className="flex items-center gap-3">
          {dayChange && (
            <span className={`text-[10px] font-medium ${dayChange.up ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
              Day: {dayChange.up ? "+" : ""}{fmt(dayChange.pts)} ({dayChange.up ? "+" : ""}{dayChange.pct.toFixed(2)}%)
            </span>
          )}
          <span className="text-[10px] text-[#787b86] font-mono">
            {clock} UTC
          </span>
          <span className="text-[10px] text-[#363a45]">
            {selectedTf}
          </span>
        </div>
      </div>
    </div>
  );
}
