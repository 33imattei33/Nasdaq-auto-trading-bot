"""
╔══════════════════════════════════════════════════════════════════════╗
║      AI ADVISORY ENGINE                                              ║
║                                                                      ║
║   Multi-agent LLM pipeline:                                          ║
║                                                                      ║
║   DATA SOURCES                                                       ║
║   [Market] [Social Media] [News] [Fundamentals]                      ║
║       ↓          ↓           ↓         ↓                             ║
║   STAGE 1 — ANALYST TEAM  (4 parallel agents)                       ║
║   Market Analyst | Social Media Analyst | News Analyst | Fund Analyst║
║       ↓ all 4 reports feed into ↓                                    ║
║   STAGE 2 — RESEARCHER TEAM  (debate: N rounds)                     ║
║   Bullish Researcher ⟷ Bearish Researcher                           ║
║   Produces: Buy Evidence + Sell Evidence                             ║
║       ↓                                                              ║
║   STAGE 3 — RESEARCH MANAGER  (synthesise debate)                   ║
║       ↓                                                              ║
║   STAGE 4 — TRADER AGENT  (deep think → transaction proposal)       ║
║       ↓                                                              ║
║   STAGE 5 — RISK MANAGEMENT TEAM  (3-way debate)                    ║
║   Aggressive | Neutral | Conservative                                ║
║       ↓                                                              ║
║   STAGE 6 — PORTFOLIO MANAGER  (final APPROVE / REJECT)             ║
║       ↓                                                              ║
║   EXECUTION                                                          ║
║                                                                      ║
║   Returns an AIAdvisoryResult with the final verdict.                ║
╚══════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from nq_trading_agents.config import CONFIG
from nq_trading_agents.engines.agent_prompts import (
    AGGRESSIVE_RISK_PROMPT,
    BEAR_RESEARCHER_PROMPT,
    BULL_RESEARCHER_PROMPT,
    CONSERVATIVE_RISK_PROMPT,
    FUNDAMENTALS_ANALYST_PROMPT,
    MARKET_ANALYST_PROMPT,
    NEUTRAL_RISK_PROMPT,
    NEWS_ANALYST_PROMPT,
    PORTFOLIO_MANAGER_PROMPT,
    RESEARCH_MANAGER_PROMPT,
    SOCIAL_MEDIA_ANALYST_PROMPT,
    TRADER_AGENT_PROMPT,
)
from nq_trading_agents.engines.data_adapter import NQDataAdapter
from nq_trading_agents.engines.external_data import ExternalDataFetcher
from nq_trading_agents.models.schemas import (
    CandleData,
    TradeSignal,
    InductionState,
    MarketStructureData,
    SessionPhase,
    TradeDirection,
    WeeklyAct,
)

log = logging.getLogger(__name__)


# ── Pipeline Event Bus ────────────────────────────────────────────────
class PipelineEventBus:
    """Broadcasts real-time pipeline events to SSE listeners.

    Each event is a dict with at least: {stage, agent, status, ts}.
    Keeps a sliding window of the last 200 events so new subscribers
    can hydrate the current run.
    """

    def __init__(self, maxlen: int = 200) -> None:
        self._events: deque[dict] = deque(maxlen=maxlen)
        self._subscribers: list[asyncio.Queue] = []
        self._run_id: int = 0

    def new_run(self, signal_id: str) -> int:
        """Start a new pipeline run, return the run_id."""
        self._run_id += 1
        self._emit({
            "type": "run_start",
            "run_id": self._run_id,
            "signal_id": signal_id,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        return self._run_id

    def emit(self, stage: int, agent: str, status: str, content: str = "", **extra: Any) -> None:
        """Emit a pipeline stage event."""
        self._emit({
            "type": "stage",
            "run_id": self._run_id,
            "stage": stage,
            "agent": agent,
            "status": status,          # "running" | "done" | "error"
            "content": content[:500],   # truncated output preview
            "ts": datetime.now(timezone.utc).isoformat(),
            **extra,
        })

    def emit_result(self, approved: bool, action: str, confidence: str) -> None:
        """Emit the final pipeline result."""
        self._emit({
            "type": "run_end",
            "run_id": self._run_id,
            "approved": approved,
            "action": action,
            "confidence": confidence,
            "ts": datetime.now(timezone.utc).isoformat(),
        })

    def _emit(self, event: dict) -> None:
        self._events.append(event)
        stale: list[asyncio.Queue] = []
        for q in self._subscribers:
            try:
                q.put_nowait(event)
            except Exception:
                stale.append(q)
        for q in stale:
            self._subscribers.remove(q)

    def subscribe(self) -> asyncio.Queue:
        """Return a queue that will receive future events. Call unsubscribe when done."""
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        if q in self._subscribers:
            self._subscribers.remove(q)

    def history(self) -> list[dict]:
        """Return recent event history for hydration."""
        return list(self._events)


# Global singleton — importable by server.py
pipeline_events = PipelineEventBus()


# ── Result dataclass ─────────────────────────────────────────────────
@dataclass
class AIAdvisoryResult:
    """Output of the AI advisory pipeline.

    Contains 4 analyst reports, researcher debate (buy/sell evidence),
    trader proposal, risk debate, and portfolio manager decision.
    """
    approved: bool = True
    confidence: str = "low"          # "high", "medium", "low"
    action: str = "HOLD"             # "BUY", "SELL", "HOLD"
    reasoning: str = ""

    # Stage 1 — Analyst Team (4 reports)
    market_report: str = ""          # Market Analyst (technical/price action)
    social_media_report: str = ""    # Social Media Analyst (sentiment)
    news_report: str = ""            # News Analyst (macro/events)
    fundamentals_report: str = ""    # Fundamentals Analyst (valuations)

    # Raw external data (fed into analysts)
    external_news: str = ""
    external_fundamentals: str = ""
    external_social: str = ""

    # Stage 2 — Researcher Team (debate)
    bull_argument: str = ""          # Buy Evidence
    bear_argument: str = ""          # Sell Evidence

    # Stage 3 — Research Manager
    research_verdict: str = ""

    # Stage 4 — Trader Agent
    trader_plan: str = ""            # Transaction Proposal

    # Stage 5 — Risk Management Team
    risk_debate: str = ""

    # Stage 6 — Portfolio Manager
    portfolio_manager_verdict: str = ""

    errors: list[str] = field(default_factory=list)


# ── LLM Client Factory ──────────────────────────────────────────────
def _create_llm(provider: str, model: str):
    """Create a LangChain-compatible LLM client."""
    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model, temperature=0.2)
    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model, temperature=0.2)
    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model, temperature=0.2)
    else:
        # Default to OpenAI-compatible
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model, temperature=0.2)


# ── Single agent call helper ────────────────────────────────────────
def _call_agent(llm, system_prompt: str, user_content: str) -> str:
    """Invoke a single agent with a system prompt and user message."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    try:
        result = llm.invoke(messages)
        return result.content if hasattr(result, "content") else str(result)
    except Exception as e:
        log.warning(f"Agent call failed: {e}")
        return f"[Agent error: {e}]"


# ── Debate helper ────────────────────────────────────────────────────
def _run_debate(
    llm,
    side_a_prompt: str,
    side_b_prompt: str,
    context: str,
    rounds: int = 1,
) -> tuple[str, str]:
    """Run a structured debate between two agents for N rounds."""
    side_a_history = ""
    side_b_history = ""

    for round_num in range(1, rounds + 1):
        # Side A argues
        a_input = (
            f"{context}\n\n"
            f"--- Opponent's previous argument ---\n{side_b_history or '(opening statement)'}\n\n"
            f"This is debate round {round_num} of {rounds}. Present your argument."
        )
        side_a_response = _call_agent(llm, side_a_prompt, a_input)
        side_a_history += f"\n[Round {round_num}] {side_a_response}\n"

        # Side B responds
        b_input = (
            f"{context}\n\n"
            f"--- Opponent's previous argument ---\n{side_a_history}\n\n"
            f"This is debate round {round_num} of {rounds}. Present your counterargument."
        )
        side_b_response = _call_agent(llm, side_b_prompt, b_input)
        side_b_history += f"\n[Round {round_num}] {side_b_response}\n"

    return side_a_history, side_b_history


# ── Main Engine ──────────────────────────────────────────────────────
class AIAdvisoryEngine:
    """Multi-agent LLM advisory engine for trade signal validation.

    Multi-agent LLM advisory for MNQ futures intraday scalping
    with FOREXIA methodology.
    """

    def __init__(self) -> None:
        self._cfg = CONFIG.ai_advisory
        self._llm = None
        self._deep_llm = None

        # External data fetcher (news, fundamentals via yfinance / Alpha Vantage)
        self._data_fetcher = ExternalDataFetcher()

        # Lazy-init: don't create LLM clients until first use
        self._initialised = False

        # Memory: simple list of past trade outcomes for reflection
        self._trade_memory: list[dict[str, Any]] = []

        # Thread pool for non-blocking LLM calls from async contexts
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ai_advisory")

        # Event bus for real-time UI streaming
        self.events = pipeline_events

    def _ensure_init(self) -> None:
        """Lazy-initialise LLM clients on first call."""
        if self._initialised:
            return

        self._llm = _create_llm(self._cfg.llm_provider, self._cfg.quick_think_model)
        self._deep_llm = _create_llm(self._cfg.llm_provider, self._cfg.deep_think_model)
        self._initialised = True
        log.info(
            f"AI Advisory Engine initialised: provider={self._cfg.llm_provider}, "
            f"model={self._cfg.quick_think_model}"
        )

    # ── Main entry point ─────────────────────────────────────────────
    def validate_signal(
        self,
        signal: TradeSignal,
        candles: list[CandleData],
        market_structure: MarketStructureData | None,
        phase: SessionPhase,
        act: WeeklyAct,
        induction: InductionState,
        induction_meter: float,
        is_killzone: bool,
        now: datetime,
    ) -> AIAdvisoryResult:
        """Run the full multi-agent pipeline to validate a trade signal.

        Returns an AIAdvisoryResult with approval status and reasoning.
        """
        result = AIAdvisoryResult()

        if not self._cfg.enabled:
            result.approved = True
            result.reasoning = "AI advisory disabled — signal passes through."
            return result

        try:
            self._ensure_init()
        except Exception as e:
            log.error(f"Failed to initialise AI advisory: {e}")
            result.approved = True
            result.reasoning = f"AI init failed ({e}) — defaulting to approve."
            result.errors.append(str(e))
            return result

        # Build the context string from our internal data
        context = NQDataAdapter.build_full_context(
            candles=candles,
            market_structure=market_structure,
            signal=signal,
            phase=phase,
            act=act,
            induction=induction,
            induction_meter=induction_meter,
            is_killzone=is_killzone,
            now=now,
        )

        # Add memory context if available
        memory_ctx = self._format_memory()
        if memory_ctx:
            context += f"\n---\n\n## Lessons from Past Trades\n{memory_ctx}\n"

        # Fetch external data (news, fundamentals, social) for analyst agents
        external_news = ""
        external_fundamentals = ""
        external_social = ""
        if self._cfg.fetch_external_news or self._cfg.fetch_external_fundamentals:
            log.info("AI Advisory: Fetching external data (news, fundamentals, social)")
            try:
                if self._cfg.fetch_external_news:
                    external_news = self._data_fetcher.fetch_nq_news_report(now)
                if self._cfg.fetch_external_fundamentals:
                    external_fundamentals = self._data_fetcher.fetch_nq_fundamentals_report(now)
                # Social media data (always attempt — it's free yfinance-derived)
                external_social = self._data_fetcher.fetch_nq_social_report(now)
            except Exception as e:
                log.warning(f"External data fetch failed (non-fatal): {e}")
                result.errors.append(f"External data: {e}")

        result.external_news = external_news
        result.external_fundamentals = external_fundamentals
        result.external_social = external_social

        # Guard: cap total context length to avoid exceeding LLM token limits
        _MAX_CONTEXT_CHARS = 12_000
        if len(context) > _MAX_CONTEXT_CHARS:
            context = context[:_MAX_CONTEXT_CHARS] + "\n...[context truncated for token budget]"

        # Start a new run in the event bus
        run_id = self.events.new_run(signal.signal_id)
        self.events.emit(0, "data_fetch", "done", "External data fetched")

        # ══════════════════════════════════════════════════════════════
        #  STAGE 1 — ANALYST TEAM (4 agents)
        #  [Market] [Social Media] [News] [Fundamentals]
        # ══════════════════════════════════════════════════════════════
        log.info("AI Advisory: Stage 1 — Analyst Team (4 agents)")

        # 1a. Market Analyst — gets internal candle/structure data
        self.events.emit(1, "market_analyst", "running")
        result.market_report = _call_agent(
            self._llm, MARKET_ANALYST_PROMPT, context
        )
        self.events.emit(1, "market_analyst", "done", result.market_report)

        # 1b. Social Media Analyst — gets social sentiment data
        social_context = context
        if external_social:
            social_context += f"\n\n## Live Social Media Data\n{external_social}"
        self.events.emit(1, "social_media_analyst", "running")
        result.social_media_report = _call_agent(
            self._llm, SOCIAL_MEDIA_ANALYST_PROMPT, social_context
        )
        self.events.emit(1, "social_media_analyst", "done", result.social_media_report)

        # 1c. News Analyst — gets external news + macro data
        news_context = context
        if external_news:
            news_context += f"\n\n## Live External News\n{external_news}"
        self.events.emit(1, "news_analyst", "running")
        result.news_report = _call_agent(
            self._llm, NEWS_ANALYST_PROMPT, news_context
        )
        self.events.emit(1, "news_analyst", "done", result.news_report)

        # 1d. Fundamentals Analyst — gets financial data + insider txns
        fund_context = context
        if external_fundamentals:
            fund_context += f"\n\n## Live Fundamentals Data\n{external_fundamentals}"
        self.events.emit(1, "fundamentals_analyst", "running")
        result.fundamentals_report = _call_agent(
            self._llm, FUNDAMENTALS_ANALYST_PROMPT, fund_context
        )
        self.events.emit(1, "fundamentals_analyst", "done", result.fundamentals_report)

        # ══════════════════════════════════════════════════════════════
        #  STAGE 2 — RESEARCHER TEAM (Bullish vs Bearish debate)
        #  All 4 analyst reports feed into both researchers
        #  Produces: Buy Evidence + Sell Evidence
        # ══════════════════════════════════════════════════════════════
        log.info("AI Advisory: Stage 2 — Researcher Team (Bull vs Bear debate)")
        self.events.emit(2, "bull_researcher", "running")
        self.events.emit(2, "bear_researcher", "running")

        # Build comprehensive analyst briefing for researchers
        analyst_briefing = (
            f"{context}\n\n"
            f"═══ ANALYST REPORTS ═══\n\n"
            f"--- Market Analyst (Technical/Price Action) ---\n{result.market_report}\n\n"
            f"--- Social Media Analyst (Retail Sentiment) ---\n{result.social_media_report}\n\n"
            f"--- News Analyst (Macro/Events) ---\n{result.news_report}\n\n"
            f"--- Fundamentals Analyst (Valuations/Earnings) ---\n{result.fundamentals_report}\n"
        )

        result.bull_argument, result.bear_argument = _run_debate(
            self._llm,
            BULL_RESEARCHER_PROMPT,
            BEAR_RESEARCHER_PROMPT,
            analyst_briefing,
            rounds=self._cfg.max_debate_rounds,
        )
        self.events.emit(2, "bull_researcher", "done", result.bull_argument)
        self.events.emit(2, "bear_researcher", "done", result.bear_argument)

        # ══════════════════════════════════════════════════════════════
        #  STAGE 3 — RESEARCH MANAGER (synthesise debate verdict)
        # ══════════════════════════════════════════════════════════════
        log.info("AI Advisory: Stage 3 — Research Manager verdict")

        research_input = (
            f"{analyst_briefing}\n\n"
            f"═══ RESEARCHER DEBATE ═══\n\n"
            f"--- BUY EVIDENCE (Bullish Researcher) ---\n{result.bull_argument}\n\n"
            f"--- SELL EVIDENCE (Bearish Researcher) ---\n{result.bear_argument}\n"
        )
        self.events.emit(3, "research_manager", "running")
        result.research_verdict = _call_agent(
            self._deep_llm, RESEARCH_MANAGER_PROMPT, research_input
        )
        self.events.emit(3, "research_manager", "done", result.research_verdict)

        # ══════════════════════════════════════════════════════════════
        #  STAGE 4 — TRADER AGENT (deep think → transaction proposal)
        # ══════════════════════════════════════════════════════════════
        log.info("AI Advisory: Stage 4 — Trader Agent (transaction proposal)")

        trader_input = (
            f"{analyst_briefing}\n\n"
            f"═══ RESEARCH VERDICT ═══\n{result.research_verdict}\n"
        )
        self.events.emit(4, "trader_agent", "running")
        result.trader_plan = _call_agent(
            self._deep_llm, TRADER_AGENT_PROMPT, trader_input
        )
        self.events.emit(4, "trader_agent", "done", result.trader_plan)

        # ══════════════════════════════════════════════════════════════
        #  STAGE 5 — RISK MANAGEMENT TEAM (3-way debate)
        #  Aggressive | Neutral | Conservative
        # ══════════════════════════════════════════════════════════════
        log.info("AI Advisory: Stage 5 — Risk Management Team")

        risk_context = (
            f"{trader_input}\n\n"
            f"═══ TRADER'S TRANSACTION PROPOSAL ═══\n{result.trader_plan}\n"
        )

        self.events.emit(5, "aggressive_risk", "running")
        aggressive = _call_agent(self._llm, AGGRESSIVE_RISK_PROMPT, risk_context)
        self.events.emit(5, "aggressive_risk", "done", aggressive)

        self.events.emit(5, "conservative_risk", "running")
        conservative = _call_agent(self._llm, CONSERVATIVE_RISK_PROMPT, risk_context)
        self.events.emit(5, "conservative_risk", "done", conservative)

        self.events.emit(5, "neutral_risk", "running")
        neutral = _call_agent(self._llm, NEUTRAL_RISK_PROMPT, risk_context)
        self.events.emit(5, "neutral_risk", "done", neutral)

        result.risk_debate = (
            f"AGGRESSIVE:\n{aggressive}\n\n"
            f"CONSERVATIVE:\n{conservative}\n\n"
            f"NEUTRAL:\n{neutral}"
        )

        # ══════════════════════════════════════════════════════════════
        #  STAGE 6 — PORTFOLIO MANAGER (final APPROVE / REJECT)
        # ══════════════════════════════════════════════════════════════
        log.info("AI Advisory: Stage 6 — Portfolio Manager (final decision)")

        pm_input = (
            f"{risk_context}\n\n"
            f"═══ RISK MANAGEMENT TEAM DEBATE ═══\n{result.risk_debate}\n"
        )
        self.events.emit(6, "portfolio_manager", "running")
        result.portfolio_manager_verdict = _call_agent(
            self._deep_llm, PORTFOLIO_MANAGER_PROMPT, pm_input
        )
        self.events.emit(6, "portfolio_manager", "done", result.portfolio_manager_verdict)

        # ── Parse final decision ────────────────────────────────────
        verdict_upper = result.portfolio_manager_verdict.upper()

        if "REJECT" in verdict_upper:
            result.approved = False
            result.action = "HOLD"
        elif "APPROVE" in verdict_upper:
            result.approved = True
            # Determine action from trader plan
            trader_upper = result.trader_plan.upper()
            if "**BUY**" in trader_upper or "PROPOSAL: **BUY" in trader_upper:
                result.action = "BUY"
            elif "**SELL**" in trader_upper or "PROPOSAL: **SELL" in trader_upper:
                result.action = "SELL"
            else:
                result.action = signal.direction.value
        else:
            # Ambiguous — default to reject for safety
            result.approved = False
            result.action = "HOLD"

        # Confidence from research verdict
        if "HIGH" in result.research_verdict.upper():
            result.confidence = "high"
        elif "MEDIUM" in result.research_verdict.upper():
            result.confidence = "medium"
        else:
            result.confidence = "low"

        result.reasoning = (
            f"Research: {result.research_verdict[:200]}... "
            f"Portfolio Manager: {result.portfolio_manager_verdict[:200]}..."
        )

        # Emit final result to event bus
        self.events.emit_result(result.approved, result.action, result.confidence)

        log.info(
            f"AI Advisory RESULT: approved={result.approved}, "
            f"action={result.action}, confidence={result.confidence}"
        )
        return result

    # ── Memory / Reflection ──────────────────────────────────────────
    def record_outcome(self, signal_id: str, direction: str, pnl: float, notes: str = "") -> None:
        """Record a trade outcome for future reflection."""
        self._trade_memory.append({
            "signal_id": signal_id,
            "direction": direction,
            "pnl": pnl,
            "outcome": "win" if pnl > 0 else "loss",
            "notes": notes,
        })
        # Keep last 50 trades in memory
        if len(self._trade_memory) > 50:
            self._trade_memory = self._trade_memory[-50:]

    def _format_memory(self) -> str:
        """Format recent trade memory for LLM context injection."""
        if not self._trade_memory:
            return ""

        recent = self._trade_memory[-10:]
        wins = sum(1 for t in recent if t["pnl"] > 0)
        losses = len(recent) - wins
        total_pnl = sum(t["pnl"] for t in recent)

        lines = [
            f"Recent trades: {wins}W / {losses}L, net P&L: ${total_pnl:,.2f}",
        ]
        for t in recent[-5:]:
            lines.append(
                f"  • {t['signal_id']}: {t['direction']} → {t['outcome']} "
                f"(${t['pnl']:+,.2f}) {t['notes']}"
            )
        return "\n".join(lines)

    # ── Async wrapper ────────────────────────────────────────────────
    async def validate_signal_async(
        self,
        signal: TradeSignal,
        candles: list[CandleData],
        market_structure: MarketStructureData | None,
        phase: SessionPhase,
        act: WeeklyAct,
        induction: InductionState,
        induction_meter: float,
        is_killzone: bool,
        now: datetime,
    ) -> AIAdvisoryResult:
        """Non-blocking async wrapper — runs the full pipeline in a thread.

        Use this from async contexts (server, auto-trade loop) to avoid
        blocking the event loop during LLM calls.
        """
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor,
            self.validate_signal,
            signal,
            candles,
            market_structure,
            phase,
            act,
            induction,
            induction_meter,
            is_killzone,
            now,
        )
