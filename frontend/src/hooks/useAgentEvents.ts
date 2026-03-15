/* ═══════════════════════════════════════════════════════════════════
 *  useAgentEvents — SSE hook for real-time agent pipeline streaming
 *
 *  Subscribes to /api/agents/events (Server-Sent Events) and
 *  maintains the live state of all pipeline agent nodes.
 * ═══════════════════════════════════════════════════════════════════ */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Event types coming from the backend SSE stream ────────────────
export interface PipelineEvent {
  type: "run_start" | "stage" | "run_end";
  run_id: number;
  ts: string;
  // stage events
  stage?: number;
  agent?: string;
  status?: "running" | "done" | "error";
  content?: string;
  // run_end events
  approved?: boolean;
  action?: string;
  confidence?: string;
  // run_start
  signal_id?: string;
}

// ── Per-agent node state (for rendering) ──────────────────────────
export type AgentStatus = "idle" | "running" | "done" | "error";

export interface AgentNode {
  id: string;           // e.g. "market_analyst"
  label: string;        // e.g. "Market Analyst"
  stage: number;
  status: AgentStatus;
  content: string;      // truncated output preview
  updatedAt: string;    // ISO timestamp
}

export interface PipelineRun {
  runId: number;
  signalId: string;
  startedAt: string;
  approved: boolean | null;
  action: string;
  confidence: string;
}

// ── Agent registry (defines the visual graph) ─────────────────────
const AGENT_DEFS: { id: string; label: string; stage: number }[] = [
  // Stage 0: Data fetch
  { id: "data_fetch",           label: "Data Sources",         stage: 0 },
  // Stage 1: Analyst Team
  { id: "market_analyst",       label: "Market Analyst",       stage: 1 },
  { id: "social_media_analyst", label: "Social Media Analyst", stage: 1 },
  { id: "news_analyst",         label: "News Analyst",         stage: 1 },
  { id: "fundamentals_analyst", label: "Fundamentals Analyst", stage: 1 },
  // Stage 2: Researcher Team
  { id: "bull_researcher",      label: "Bullish Researcher",   stage: 2 },
  { id: "bear_researcher",      label: "Bearish Researcher",   stage: 2 },
  // Stage 3: Research Manager
  { id: "research_manager",     label: "Research Manager",     stage: 3 },
  // Stage 4: Trader Agent
  { id: "trader_agent",         label: "Trader Agent",         stage: 4 },
  // Stage 5: Risk Team
  { id: "aggressive_risk",      label: "Aggressive Risk",      stage: 5 },
  { id: "neutral_risk",         label: "Neutral Risk",         stage: 5 },
  { id: "conservative_risk",    label: "Conservative Risk",    stage: 5 },
  // Stage 6: Portfolio Manager
  { id: "portfolio_manager",    label: "Portfolio Manager",    stage: 6 },
];

function buildInitialNodes(): Map<string, AgentNode> {
  const map = new Map<string, AgentNode>();
  for (const def of AGENT_DEFS) {
    map.set(def.id, {
      id: def.id,
      label: def.label,
      stage: def.stage,
      status: "idle",
      content: "",
      updatedAt: "",
    });
  }
  return map;
}

// ── Hook ──────────────────────────────────────────────────────────
export function useAgentEvents() {
  const [nodes, setNodes] = useState<Map<string, AgentNode>>(buildInitialNodes);
  const [currentRun, setCurrentRun] = useState<PipelineRun | null>(null);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const processEvent = useCallback((evt: PipelineEvent) => {
    setEvents((prev) => [...prev.slice(-200), evt]);

    if (evt.type === "run_start") {
      // Reset all nodes to idle for a new run
      setNodes(buildInitialNodes());
      setCurrentRun({
        runId: evt.run_id,
        signalId: evt.signal_id || "",
        startedAt: evt.ts,
        approved: null,
        action: "",
        confidence: "",
      });
      return;
    }

    if (evt.type === "run_end") {
      setCurrentRun((prev) =>
        prev
          ? {
              ...prev,
              approved: evt.approved ?? null,
              action: evt.action || "",
              confidence: evt.confidence || "",
            }
          : prev
      );
      return;
    }

    // Stage event — update the specific agent node
    if (evt.type === "stage" && evt.agent) {
      setNodes((prev) => {
        const next = new Map(prev);
        const existing = next.get(evt.agent!);
        if (existing) {
          next.set(evt.agent!, {
            ...existing,
            status: (evt.status as AgentStatus) || "idle",
            content: evt.content || existing.content,
            updatedAt: evt.ts,
          });
        }
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const url = `${API}/api/agents/events`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (msg) => {
      try {
        const evt: PipelineEvent = JSON.parse(msg.data);
        processEvent(evt);
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [processEvent]);

  // Helper: get nodes grouped by stage
  const stages = Array.from({ length: 7 }, (_, i) =>
    Array.from(nodes.values()).filter((n) => n.stage === i)
  );

  return { nodes, stages, currentRun, events, connected };
}
