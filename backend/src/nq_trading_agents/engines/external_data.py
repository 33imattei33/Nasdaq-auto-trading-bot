"""
╔══════════════════════════════════════════════════════════════════════╗
║      EXTERNAL DATA FETCHER                                           ║
║                                                                      ║
║   Pulls live news, fundamentals, social media sentiment, and macro   ║
║   data from external APIs to feed into the 4-analyst AI pipeline.    ║
║                                                                      ║
║   Data sources:                                                      ║
║   ┌────────────────┬──────────────────────────────────┐              ║
║   │ Market         │ yfinance, Alpha Vantage           │              ║
║   │ Social Media   │ Reddit (r/wallstreetbets, etc.)   │              ║
║   │ News           │ yfinance news, global macro       │              ║
║   │ Fundamentals   │ yfinance info, insider txns       │              ║
║   └────────────────┴──────────────────────────────────┘              ║
║                                                                      ║
║   For NQ futures we pull:                                            ║
║   • NQ=F price data & technicals                                    ║
║   • News for NQ-weighted mega-caps (AAPL, MSFT, NVDA, etc.)        ║
║   • Global macro news (Fed, CPI, NFP, etc.)                        ║
║   • Social media sentiment from Reddit & forums                     ║
║   • VIX for risk sentiment                                          ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

log = logging.getLogger(__name__)

# NQ-100 mega-cap tickers whose news moves the index
NQ_MEGA_CAPS = ("AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AVGO")
MACRO_TICKERS = ("^VIX", "^TNX", "SPY", "QQQ")  # VIX, 10Y yield, SPY, QQQ


class ExternalDataFetcher:
    """Fetches live news, fundamentals, and macro data from external APIs.

    Uses direct yfinance calls. Everything is free — no API keys required.
    """

    def __init__(self) -> None:
        pass

    # ── News ─────────────────────────────────────────────────────────
    def get_ticker_news(self, ticker: str, now: datetime | None = None) -> str:
        """Get recent news for a specific ticker."""
        now = now or datetime.now(timezone.utc)
        end = now.strftime("%Y-%m-%d")
        start = (now - timedelta(days=3)).strftime("%Y-%m-%d")

        return self._yfinance_news(ticker)

    def get_global_news(self, now: datetime | None = None) -> str:
        """Get global macro/financial news."""
        now = now or datetime.now(timezone.utc)
        curr_date = now.strftime("%Y-%m-%d")

        return self._yfinance_global_news()

    def get_insider_transactions(self, ticker: str) -> str:
        """Get insider trading activity for a ticker."""
        return self._yfinance_insider(ticker)

    # ── Fundamentals ─────────────────────────────────────────────────
    def get_fundamentals(self, ticker: str, now: datetime | None = None) -> str:
        """Get fundamental data for a ticker."""
        now = now or datetime.now(timezone.utc)
        curr_date = now.strftime("%Y-%m-%d")

        return self._yfinance_fundamentals(ticker)

    # ── Market Data ──────────────────────────────────────────────────
    def get_stock_data(self, ticker: str, now: datetime | None = None) -> str:
        """Get OHLCV price data for a ticker."""
        now = now or datetime.now(timezone.utc)
        end = now.strftime("%Y-%m-%d")
        start = (now - timedelta(days=30)).strftime("%Y-%m-%d")

        return self._yfinance_stock_data(ticker, start, end)

    def get_indicators(self, ticker: str, now: datetime | None = None) -> str:
        """Get technical indicators for a ticker."""
        now = now or datetime.now(timezone.utc)
        end = now.strftime("%Y-%m-%d")
        start = (now - timedelta(days=60)).strftime("%Y-%m-%d")

        return self._yfinance_indicators(ticker, start, end)

    # ── Composite reports for NQ futures ─────────────────────────────
    def fetch_nq_news_report(self, now: datetime | None = None) -> str:
        """Build a comprehensive news report for NQ futures trading.

        Pulls:
        1. Global macro news
        2. News for top NQ mega-caps
        3. Insider activity for notable tickers
        """
        now = now or datetime.now(timezone.utc)
        sections: list[str] = []

        # Global news
        global_news = self.get_global_news(now)
        if global_news:
            sections.append(f"## Global Macro News\n{global_news}")

        # Mega-cap news (top 4 to keep API usage reasonable)
        for ticker in NQ_MEGA_CAPS[:4]:
            news = self.get_ticker_news(ticker, now)
            if news and "no news" not in news.lower() and "error" not in news.lower():
                sections.append(f"## {ticker} News\n{news}")

        if not sections:
            return "No external news data available."

        return "\n\n---\n\n".join(sections)

    def fetch_nq_fundamentals_report(self, now: datetime | None = None) -> str:
        """Build a fundamentals report for NQ-relevant data.

        Pulls:
        1. QQQ ETF fundamentals (proxy for NQ)
        2. VIX level (risk sentiment)
        3. Insider activity for top NQ mega-caps
        """
        now = now or datetime.now(timezone.utc)
        sections: list[str] = []

        # QQQ as NQ proxy
        qqq = self.get_stock_data("QQQ", now)
        if qqq:
            sections.append(f"## QQQ (NQ Proxy) Price Data\n{qqq}")

        # VIX for risk sentiment
        vix = self.get_stock_data("^VIX", now)
        if vix:
            sections.append(f"## VIX (Volatility Index)\n{vix}")

        # QQQ fundamentals
        fund = self.get_fundamentals("QQQ", now)
        if fund:
            sections.append(f"## QQQ Fundamentals\n{fund}")

        # Insider activity for top mega-caps
        for ticker in NQ_MEGA_CAPS[:3]:
            insider = self.get_insider_transactions(ticker)
            if insider and "no insider" not in insider.lower():
                sections.append(f"## {ticker} Insider Activity\n{insider}")

        if not sections:
            return "No external fundamental data available."

        return "\n\n---\n\n".join(sections)

    def fetch_nq_social_report(self, now: datetime | None = None) -> str:
        """Build a social media sentiment report for NQ futures.

        Sources:
        1. Reddit r/wallstreetbets, r/stocks, r/investing (via yfinance proxy)
        2. Social sentiment derived from news buzz and volume anomalies
        3. Retail-vs-institutional divergence signals
        """
        now = now or datetime.now(timezone.utc)
        sections: list[str] = []

        # Reddit-style sentiment from yfinance trending/news
        social = self._fetch_social_sentiment(now)
        if social:
            sections.append(social)

        # Volume anomaly detection (retail piling in)
        anomaly = self._detect_retail_volume_anomaly(now)
        if anomaly:
            sections.append(anomaly)

        # Options flow / put-call ratio as sentiment proxy
        options_sentiment = self._fetch_options_sentiment(now)
        if options_sentiment:
            sections.append(options_sentiment)

        if not sections:
            return ("No social media data available. Treat retail sentiment "
                    "as UNKNOWN — do not factor into trade decision.")

        return "\n\n---\n\n".join(sections)

    # ── Social media & sentiment helpers ────────────────────────────────
    @staticmethod
    def _fetch_social_sentiment(now: datetime) -> str:
        """Derive social sentiment from yfinance news buzz for NQ mega-caps.

        We scan recent headlines and categorise the tone as a proxy for
        retail sentiment on forums (Reddit, X/Twitter). This avoids the
        need for paid social APIs while still providing useful signal.
        """
        try:
            import yfinance as yf
            sentiment_tickers = ["QQQ", "NVDA", "TSLA", "AAPL", "META"]
            bullish_kw = {"rally", "surge", "soar", "jump", "gain", "beat",
                          "record", "upgrade", "buy", "bull", "breakout", "boom"}
            bearish_kw = {"crash", "drop", "fall", "plunge", "sell", "downgrade",
                          "miss", "bear", "recession", "layoff", "decline", "tank"}

            bull_count, bear_count, total = 0, 0, 0
            headlines: list[str] = []

            for ticker in sentiment_tickers:
                try:
                    t = yf.Ticker(ticker)
                    news = t.news or []
                    for article in news[:5]:
                        title = article.get("title", "").lower()
                        total += 1
                        if any(w in title for w in bullish_kw):
                            bull_count += 1
                        if any(w in title for w in bearish_kw):
                            bear_count += 1
                        headlines.append(f"- [{ticker}] {article.get('title', '')}")
                except Exception:
                    continue

            if total == 0:
                return ""

            if bull_count > bear_count * 1.5:
                verdict = "BULLISH"
            elif bear_count > bull_count * 1.5:
                verdict = "BEARISH"
            else:
                verdict = "MIXED"

            return (
                f"## Social / Retail Sentiment Proxy\n"
                f"Headlines scanned: {total} | Bullish signals: {bull_count} "
                f"| Bearish signals: {bear_count}\n"
                f"**Retail sentiment estimate: {verdict}**\n\n"
                f"Sample headlines:\n" + "\n".join(headlines[:10])
            )
        except Exception as e:
            log.warning(f"Social sentiment fetch failed: {e}")
            return ""

    @staticmethod
    def _detect_retail_volume_anomaly(now: datetime) -> str:
        """Check for unusual volume in QQQ/TQQQ (retail favourite ETFs).

        Volume spikes in leveraged NQ ETFs often indicate retail piling in.
        """
        try:
            import yfinance as yf
            lines: list[str] = []
            for ticker in ("QQQ", "TQQQ", "SQQQ"):
                try:
                    df = yf.download(ticker, period="5d", progress=False)
                    if df.empty or len(df) < 2:
                        continue
                    avg_vol = df["Volume"].iloc[:-1].mean()
                    last_vol = df["Volume"].iloc[-1]
                    if avg_vol > 0:
                        ratio = last_vol / avg_vol
                        if ratio > 1.5:
                            direction = "BUYING" if ticker != "SQQQ" else "SELLING NQ"
                            lines.append(
                                f"- **{ticker}**: Volume {ratio:.1f}x average "
                                f"→ Retail {direction} signal"
                            )
                except Exception:
                    continue

            if not lines:
                return ""

            return "## Volume Anomaly Detection\n" + "\n".join(lines)
        except Exception as e:
            log.warning(f"Volume anomaly check failed: {e}")
            return ""

    @staticmethod
    def _fetch_options_sentiment(now: datetime) -> str:
        """Fetch put/call ratio from QQQ options as sentiment proxy."""
        try:
            import yfinance as yf
            qqq = yf.Ticker("QQQ")
            dates = qqq.options
            if not dates:
                return ""

            # Use nearest expiration
            chain = qqq.option_chain(dates[0])
            total_call_vol = chain.calls["volume"].sum()
            total_put_vol = chain.puts["volume"].sum()

            if total_call_vol == 0:
                return ""

            pc_ratio = total_put_vol / total_call_vol

            if pc_ratio > 1.2:
                mood = "FEARFUL (bearish hedge activity)"
            elif pc_ratio < 0.7:
                mood = "GREEDY (bullish call buying)"
            else:
                mood = "NEUTRAL"

            return (
                f"## QQQ Options Sentiment\n"
                f"- Put/Call ratio: {pc_ratio:.2f}\n"
                f"- Call volume: {total_call_vol:,.0f} | Put volume: {total_put_vol:,.0f}\n"
                f"- **Market mood: {mood}**"
            )
        except Exception as e:
            log.warning(f"Options sentiment fetch failed: {e}")
            return ""

    # ── Direct yfinance fallbacks ────────────────────────────────────
    @staticmethod
    def _yfinance_news(ticker: str) -> str:
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            news = t.news
            if not news:
                return f"No recent news found for {ticker}."
            lines = [f"## {ticker} News (via yfinance)"]
            for article in news[:8]:
                title = article.get("title", "No title")
                publisher = article.get("publisher", "")
                link = article.get("link", "")
                lines.append(f"- **{title}** ({publisher})")
            return "\n".join(lines)
        except Exception as e:
            return f"Failed to fetch news for {ticker}: {e}"

    @staticmethod
    def _yfinance_global_news() -> str:
        try:
            import yfinance as yf
            lines = ["## Global Financial News (via yfinance)"]
            for ticker in ("^GSPC", "^IXIC", "^VIX"):
                t = yf.Ticker(ticker)
                news = t.news or []
                for article in news[:3]:
                    title = article.get("title", "No title")
                    publisher = article.get("publisher", "")
                    lines.append(f"- **{title}** ({publisher})")
            return "\n".join(lines) if len(lines) > 1 else "No global news available."
        except Exception as e:
            return f"Failed to fetch global news: {e}"

    @staticmethod
    def _yfinance_insider(ticker: str) -> str:
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            insiders = t.insider_transactions
            if insiders is None or insiders.empty:
                return f"No insider transactions for {ticker}."
            return f"## {ticker} Insider Transactions\n{insiders.head(10).to_string()}"
        except Exception as e:
            return f"Failed to fetch insider data for {ticker}: {e}"

    @staticmethod
    def _yfinance_fundamentals(ticker: str) -> str:
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            info = t.info
            if not info:
                return f"No fundamental data for {ticker}."
            keys = [
                "marketCap", "trailingPE", "forwardPE", "priceToBook",
                "dividendYield", "profitMargins", "returnOnEquity",
                "revenueGrowth", "earningsGrowth", "totalRevenue",
                "totalDebt", "totalCash", "shortRatio",
            ]
            lines = [f"## {ticker} Fundamentals (via yfinance)"]
            for k in keys:
                if k in info and info[k] is not None:
                    lines.append(f"- {k}: {info[k]}")
            return "\n".join(lines)
        except Exception as e:
            return f"Failed to fetch fundamentals for {ticker}: {e}"

    @staticmethod
    def _yfinance_stock_data(ticker: str, start: str, end: str) -> str:
        try:
            import yfinance as yf
            df = yf.download(ticker, start=start, end=end, progress=False)
            if df.empty:
                return f"No price data for {ticker} from {start} to {end}."
            summary = (
                f"## {ticker} Price Data ({start} to {end})\n"
                f"- Last close: {df['Close'].iloc[-1]:.2f}\n"
                f"- Period high: {df['High'].max():.2f}\n"
                f"- Period low: {df['Low'].min():.2f}\n"
                f"- Avg volume: {df['Volume'].mean():.0f}\n"
            )
            return summary
        except Exception as e:
            return f"Failed to fetch stock data for {ticker}: {e}"

    @staticmethod
    def _yfinance_indicators(ticker: str, start: str, end: str) -> str:
        try:
            import yfinance as yf
            df = yf.download(ticker, start=start, end=end, progress=False)
            if df.empty:
                return f"No data for indicators on {ticker}."
            close = df["Close"]
            sma_20 = close.rolling(20).mean().iloc[-1]
            sma_50 = close.rolling(50).mean().iloc[-1] if len(close) >= 50 else None
            # RSI
            delta = close.diff()
            gain = delta.where(delta > 0, 0).rolling(14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
            rs = gain / loss
            rsi = (100 - (100 / (1 + rs))).iloc[-1]

            lines = [
                f"## {ticker} Technical Indicators",
                f"- SMA(20): {sma_20:.2f}",
            ]
            if sma_50 is not None:
                lines.append(f"- SMA(50): {sma_50:.2f}")
            lines.append(f"- RSI(14): {rsi:.1f}")
            lines.append(f"- Last close: {close.iloc[-1]:.2f}")
            return "\n".join(lines)
        except Exception as e:
            return f"Failed to compute indicators for {ticker}: {e}"
