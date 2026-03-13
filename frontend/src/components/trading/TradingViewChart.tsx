"use client";

import { useEffect, useRef, memo } from "react";

interface TradingViewChartProps {
  symbol?: string;
  theme?: "dark" | "light";
  height?: number;
  selectedTf?: string;
  onTimeframeChange?: (tf: string) => void;
}

const TF_MAP: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1H": "60",
  "4H": "240",
  "1D": "D",
};

function TradingViewChartInner({
  symbol = "OANDA:NAS100USD",
  theme = "dark",
  height = 650,
  selectedTf = "5m",
  onTimeframeChange,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interval = TF_MAP[selectedTf] ?? "5";
  const timeframes = ["1m", "5m", "15m", "1H", "4H", "1D"];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget completely
    container.innerHTML = "";

    // Create inner div that TradingView widget targets
    const innerDiv = document.createElement("div");
    innerDiv.className = "tradingview-widget-container__widget";
    innerDiv.style.height = `${height}px`;
    innerDiv.style.width = "100%";
    container.appendChild(innerDiv);

    // Inject the official TradingView Advanced Chart embed script
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";

    // The widget config MUST be set as the script's text content
    script.textContent = JSON.stringify({
      width: "100%",
      height: height,
      symbol: symbol,
      interval: interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      withdateranges: true,
      hide_side_toolbar: false,
      details: true,
      hotlist: false,
      show_popup_button: false,
      studies: [
        "STD;MACD",
        "STD;RSI"
      ],
    });

    container.appendChild(script);

    return () => {
      if (container) container.innerHTML = "";
    };
  }, [symbol, interval, height]);

  return (
    <div className="overflow-hidden rounded-lg border border-[#2a2e39] bg-[#131722]">
      {/* ── Timeframe selector ─────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-[#2a2e39] px-3 py-1.5">
        <span className="mr-2 text-[13px] font-semibold text-[#d1d4dc]">
          MNQ / NQ1!
        </span>
        <span className="mr-2 text-[10px] text-[#787b86]">
          Micro E-mini Nasdaq-100 Futures
        </span>
        <div className="mx-1 h-5 w-px bg-[#2a2e39]" />
        <div className="flex items-center gap-0.5">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange?.(tf)}
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
      </div>

      {/* ── TradingView Advanced Chart Widget ──────────────────── */}
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height, width: "100%" }}
      />
    </div>
  );
}

const TradingViewChart = memo(TradingViewChartInner);
export default TradingViewChart;
