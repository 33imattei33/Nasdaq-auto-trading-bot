"use client";
/* ═══════════════════════════════════════════════════════════════════
 *  AGENTS OFFICE — Real-time AI pipeline workflow visualisation
 *
 *  Shows the 6-stage AI pipeline as an interactive
 *  node graph. Each agent lights up in real-time as it processes
 *  a trade signal.                         /agents-office
 * ═══════════════════════════════════════════════════════════════════ */

import { useAgentEvents, AgentNode, AgentStatus } from "@/hooks/useAgentEvents";
import Link from "next/link";
import { useState } from "react";

/* ─── Stage metadata ────────────────────────────────────────────── */
const STAGE_META: Record<number, { label: string; color: string; icon: string }> = {
  0: { label: "Data Sources",       color: "from-blue-500/20 to-blue-500/5",     icon: "📡" },
  1: { label: "Analyst Team",       color: "from-cyan-500/20 to-cyan-500/5",     icon: "📊" },
  2: { label: "Researcher Team",    color: "from-purple-500/20 to-purple-500/5", icon: "⚖️" },
  3: { label: "Research Manager",   color: "from-indigo-500/20 to-indigo-500/5", icon: "🎯" },
  4: { label: "Trader Agent",       color: "from-amber-500/20 to-amber-500/5",   icon: "💹" },
  5: { label: "Risk Management",    color: "from-red-500/20 to-red-500/5",       icon: "🛡️" },
  6: { label: "Portfolio Manager",  color: "from-brand/20 to-brand/5",           icon: "👔" },
};

/* ─── Status styling ────────────────────────────────────────────── */
function statusStyles(status: AgentStatus) {
  switch (status) {
    case "running":
      return "border-amber-400/60 bg-amber-500/10 shadow-[0_0_20px_rgba(251,191,36,0.15)]";
    case "done":
      return "border-brand/50 bg-brand/10 shadow-[0_0_15px_rgba(0,230,138,0.1)]";
    case "error":
      return "border-red-400/60 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.15)]";
    default:
      return "border-white/[0.06] bg-surface-50";
  }
}

function statusDot(status: AgentStatus) {
  switch (status) {
    case "running":
      return (
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
        </span>
      );
    case "done":
      return <span className="h-2.5 w-2.5 rounded-full bg-brand" />;
    case "error":
      return <span className="h-2.5 w-2.5 rounded-full bg-red-400" />;
    default:
      return <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />;
  }
}

/* ─── Agent Node Card ───────────────────────────────────────────── */
function AgentNodeCard({
  node,
  onClick,
}: {
  node: AgentNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-300 ${statusStyles(
        node.status
      )} hover:border-brand/30 cursor-pointer`}
    >
      <div className="flex-shrink-0">{statusDot(node.status)}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
          {node.label}
        </div>
        {node.status === "running" && (
          <div className="mt-1 text-[10px] text-amber-400/80 animate-pulse">
            Processing...
          </div>
        )}
        {node.status === "done" && node.content && (
          <div className="mt-1 truncate text-[10px] text-slate-500">
            {node.content.slice(0, 80)}...
          </div>
        )}
      </div>
      {node.status === "running" && (
        <div className="absolute -right-1 -top-1 h-3 w-3">
          <svg className="animate-spin text-amber-400" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      )}
    </button>
  );
}

/* ─── Flow Arrow ────────────────────────────────────────────────── */
function FlowArrow({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center py-1">
      <div className="flex flex-col items-center">
        <div
          className={`h-6 w-0.5 transition-colors duration-500 ${
            active ? "bg-brand/60" : "bg-white/10"
          }`}
        />
        <svg
          width="12"
          height="8"
          viewBox="0 0 12 8"
          className={`transition-colors duration-500 ${
            active ? "text-brand/60" : "text-white/10"
          }`}
        >
          <path d="M6 8L0 0h12z" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

/* ─── Detail Panel ──────────────────────────────────────────────── */
function DetailPanel({
  node,
  onClose,
}: {
  node: AgentNode | null;
  onClose: () => void;
}) {
  if (!node || !node.content) return null;

  return (
    <div className="glass-card flex max-h-[70vh] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          {statusDot(node.status)}
          <span className="text-sm font-bold text-slate-200">{node.label}</span>
          <span className="badge-green">Stage {node.stage}</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 transition text-lg"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300 font-mono">
          {node.content}
        </pre>
      </div>
      {node.updatedAt && (
        <div className="border-t border-white/[0.06] px-5 py-2 text-[10px] text-slate-600">
          Last updated: {new Date(node.updatedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

/* ─── Pipeline Stage Row ────────────────────────────────────────── */
function StageRow({
  stageNum,
  nodes,
  onSelect,
}: {
  stageNum: number;
  nodes: AgentNode[];
  onSelect: (node: AgentNode) => void;
}) {
  const meta = STAGE_META[stageNum];
  if (!meta) return null;

  const hasActivity = nodes.some((n) => n.status !== "idle");

  return (
    <div
      className={`rounded-xl border border-white/[0.04] bg-gradient-to-b ${meta.color} p-3`}
    >
      {/* Stage header */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-base">{meta.icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
          Stage {stageNum} — {meta.label}
        </span>
        {hasActivity && (
          <span className="ml-auto text-[10px] text-brand/60">
            {nodes.filter((n) => n.status === "done").length}/{nodes.length}
          </span>
        )}
      </div>

      {/* Agent nodes grid */}
      <div
        className={`grid gap-2 ${
          nodes.length === 1
            ? "grid-cols-1 max-w-md mx-auto"
            : nodes.length === 2
            ? "grid-cols-2"
            : nodes.length === 3
            ? "grid-cols-3"
            : "grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {nodes.map((node) => (
          <AgentNodeCard key={node.id} node={node} onClick={() => onSelect(node)} />
        ))}
      </div>
    </div>
  );
}

/* ─── Run Status Header ─────────────────────────────────────────── */
function RunStatusBar({
  run,
  connected,
}: {
  run: ReturnType<typeof useAgentEvents>["currentRun"];
  connected: boolean;
}) {
  return (
    <div className="glass-card flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-4">
        {/* Connection indicator */}
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-brand animate-pulse" : "bg-red-400"
            }`}
          />
          <span className="text-[11px] font-medium text-slate-400">
            {connected ? "LIVE" : "DISCONNECTED"}
          </span>
        </div>

        {run && (
          <>
            <div className="h-4 w-px bg-white/10" />
            <div className="text-[11px] text-slate-500">
              Run #{run.runId} — Signal{" "}
              <span className="font-mono text-slate-300">{run.signalId.slice(0, 12)}</span>
            </div>
          </>
        )}
      </div>

      {/* Final verdict */}
      {run?.approved !== null && run?.approved !== undefined && (
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-bold ${
              run.approved ? "text-brand" : "text-red-400"
            }`}
          >
            {run.approved ? "✓ APPROVED" : "✗ REJECTED"}
          </span>
          <span className="badge-amber">{run.action}</span>
          <span className="text-[10px] text-slate-500 uppercase">
            {run.confidence} confidence
          </span>
        </div>
      )}

      {run && run.approved === null && (
        <div className="flex items-center gap-2 text-amber-400">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-xs font-medium">Pipeline running...</span>
        </div>
      )}
    </div>
  );
}

/* ═══ MAIN PAGE ════════════════════════════════════════════════════ */
export default function AgentsOfficePage() {
  const { stages, currentRun, connected } = useAgentEvents();
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null);

  // Are any stages active (flowing)?
  const isFlowing = (stageNum: number) =>
    stages[stageNum]?.some((n) => n.status === "done" || n.status === "running") ?? false;

  return (
    <div className="relative min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-surface/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-slate-500 hover:text-slate-300 transition text-sm"
            >
              ← Dashboard
            </Link>
            <div className="h-4 w-px bg-white/10" />
            <h1 className="text-sm font-bold tracking-tight text-slate-100">
              Agents Office
            </h1>
            <span className="badge-green">AI Pipeline</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="font-mono">MNQ SCALPING</span>
            <span className="text-white/10">|</span>
            <span>APEX 100K</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Run status bar */}
        <RunStatusBar run={currentRun} connected={connected} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* ─── Pipeline Flow (left column) ─── */}
          <div className="space-y-0">
            {/* Stage 0: Data Sources */}
            <StageRow stageNum={0} nodes={stages[0]} onSelect={setSelectedNode} />
            <FlowArrow active={isFlowing(0)} />

            {/* Stage 1: Analyst Team */}
            <StageRow stageNum={1} nodes={stages[1]} onSelect={setSelectedNode} />
            <FlowArrow active={isFlowing(1)} />

            {/* Stage 2: Researcher Team */}
            <StageRow stageNum={2} nodes={stages[2]} onSelect={setSelectedNode} />
            <FlowArrow active={isFlowing(2)} />

            {/* Stage 3: Research Manager */}
            <StageRow stageNum={3} nodes={stages[3]} onSelect={setSelectedNode} />
            <FlowArrow active={isFlowing(3)} />

            {/* Stage 4: Trader Agent */}
            <StageRow stageNum={4} nodes={stages[4]} onSelect={setSelectedNode} />
            <FlowArrow active={isFlowing(4)} />

            {/* Stage 5: Risk Management Team */}
            <StageRow stageNum={5} nodes={stages[5]} onSelect={setSelectedNode} />
            <FlowArrow active={isFlowing(5)} />

            {/* Stage 6: Portfolio Manager */}
            <StageRow stageNum={6} nodes={stages[6]} onSelect={setSelectedNode} />

            {/* Execution result */}
            {currentRun?.approved !== null && currentRun?.approved !== undefined && (
              <>
                <FlowArrow active />
                <div
                  className={`rounded-xl border p-4 text-center transition-all duration-500 ${
                    currentRun.approved
                      ? "border-brand/40 bg-brand/10 shadow-[0_0_30px_rgba(0,230,138,0.1)]"
                      : "border-red-400/40 bg-red-500/10 shadow-[0_0_30px_rgba(239,68,68,0.1)]"
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">
                    Execution
                  </div>
                  <div
                    className={`text-lg font-black ${
                      currentRun.approved ? "text-brand" : "text-red-400"
                    }`}
                  >
                    {currentRun.approved ? "⚡ EXECUTE TRADE" : "⛔ SIGNAL REJECTED"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {currentRun.action} · {currentRun.confidence} confidence
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ─── Detail Panel (right column) ─── */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            {selectedNode?.content ? (
              <DetailPanel
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
              />
            ) : (
              <div className="glass-card flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="text-3xl mb-3 opacity-30">🤖</div>
                <div className="text-sm font-medium text-slate-400">
                  Select an agent to view output
                </div>
                <div className="mt-2 text-[11px] text-slate-600 max-w-[240px]">
                  Click any agent node on the left to inspect its full report,
                  arguments, or verdict.
                </div>
                {!currentRun && (
                  <div className="mt-6 text-[10px] text-slate-600 border border-white/[0.06] rounded-lg px-4 py-2">
                    Waiting for next signal...
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="mt-4 glass-card px-5 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Status Legend
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-600" />
                  <span className="text-[10px] text-slate-500">Idle</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-[10px] text-slate-500">Running</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-brand" />
                  <span className="text-[10px] text-slate-500">Done</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                  <span className="text-[10px] text-slate-500">Error</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
