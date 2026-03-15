"use client";

import Link from "next/link";
import { useState } from "react";

/* ─── Feature/Benefit data ─── */
const FEATURES = [
  {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: "Institutional-Grade Signals",
    desc: "Our engine detects the exact 4-step Signature Trade used by FOREXIA methodology: Wedge → Stop Hunt → Exhaustion → Reversal. Each signal includes a full analysis thesis and confluence factors.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Kill Zone Precision",
    desc: "Trades only fire during high-probability windows — London (08–12 UTC) and New York (14–16 UTC) kill zones — when institutional volume peaks and retail traps are most common.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: "APEX-Compliant Risk Engine",
    desc: "Built-in APEX/prop-firm safety: $300 max risk per trade, 2% equity cap, 4 MNQ contract limit, trailing drawdown protection, and automatic daily loss cutoff at $600.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: "Hegelian 5-Act Weekly Model",
    desc: "The bot follows a 5-act weekly narrative — Connector → Accumulation → Reversal → Distribution → Epilogue — sizing positions to match each day's institutional probability.",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
    title: "Live TradingView-Style Charts",
    desc: "Full candlestick charting with real-time NQ=F price streaming, liquidity zone overlays, live position/order markers, and multi-timeframe analysis (1m to 1D).",
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
    title: "Direct Tradovate Integration",
    desc: "One-click browser login to Tradovate DEMO or LIVE. Bracket orders with automatic stop-loss and take-profit, position monitoring, and the Close All panic button.",
  },
];

const STATS = [
  { value: "2:1", label: "Min Reward-to-Risk" },
  { value: "90%", label: "Max Signal Confidence" },
  { value: "10s", label: "Scan Interval" },
  { value: "$300", label: "Max Risk Per Trade" },
];

const PLANS = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    desc: "Perfect for learning the institutional edge",
    features: [
      "Paper trading mode",
      "Real-time NQ=F signals",
      "Analysis thesis per signal",
      "Kill zone alerts",
      "Community Discord access",
    ],
    cta: "Start Free Trial",
    highlight: false,
  },
  {
    name: "Pro Trader",
    price: "$149",
    period: "/mo",
    desc: "Full automation for serious traders",
    features: [
      "Everything in Starter",
      "Live Tradovate auto-execution",
      "APEX prop-firm risk engine",
      "Bracket orders with SL/TP",
      "Up to 4 MNQ contracts",
      "Priority signal delivery",
      "Weekly structure insights",
    ],
    cta: "Get Started",
    highlight: true,
  },
  {
    name: "Institution",
    price: "$399",
    period: "/mo",
    desc: "Multi-account and custom strategies",
    features: [
      "Everything in Pro",
      "Multi-account management",
      "Custom kill zone windows",
      "Custom risk parameters",
      "Dedicated support channel",
      "API access for integrations",
      "White-glove onboarding",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

/* ─── Navbar ─── */
function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/[0.06] bg-surface/70 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15">
            <svg className="h-4 w-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="text-lg font-bold text-white">
            FORE<span className="text-brand">XIA</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-slate-400 transition hover:text-white">Features</a>
          <a href="#pricing" className="text-sm text-slate-400 transition hover:text-white">Pricing</a>
          <Link href="/blog" className="text-sm text-slate-400 transition hover:text-white">Blog</Link>
          <Link href="/login" className="text-sm text-slate-300 transition hover:text-white">Log In</Link>
          <Link href="/register" className="btn-brand text-xs">Get Started</Link>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden text-slate-300" onClick={() => setMobileOpen(!mobileOpen)}>
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-white/[0.06] bg-surface/95 px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            <a href="#features" className="text-sm text-slate-300" onClick={() => setMobileOpen(false)}>Features</a>
            <a href="#pricing" className="text-sm text-slate-300" onClick={() => setMobileOpen(false)}>Pricing</a>
            <Link href="/blog" className="text-sm text-slate-300">Blog</Link>
            <Link href="/login" className="text-sm text-slate-300">Log In</Link>
            <Link href="/register" className="btn-brand text-center text-xs">Get Started</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

/* ─── Page ─── */
export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative overflow-hidden pt-32 pb-20 md:pt-44 md:pb-32">
        {/* Background effects */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand/[0.04] blur-[120px]" />
          <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-blue-600/[0.03] blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.06] px-4 py-1.5 text-xs font-medium text-brand">
            <span className="pulse-dot" />
            NAS100 Institutional Execution Engine
          </div>

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white md:text-6xl lg:text-7xl">
            Trade NAS100 Like
            <br />
            <span className="bg-gradient-to-r from-brand via-emerald-300 to-brand bg-clip-text text-transparent">
              FOREXIA
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400 md:text-xl">
            Fully automated institutional-grade trading bot that detects stop hunts,
            liquidity sweeps, and signature reversals on Micro E-mini Nasdaq futures —
            with built-in APEX prop-firm risk management.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="btn-brand px-8 py-3.5 text-base font-bold"
            >
              Start Trading Now
            </Link>
            <Link
              href="#features"
              className="btn-ghost px-8 py-3.5 text-base"
            >
              See How It Works
            </Link>
          </div>

          {/* Stats row */}
          <div className="mx-auto mt-16 grid max-w-xl grid-cols-2 gap-6 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-extrabold text-white md:text-3xl">{s.value}</div>
                <div className="mt-1 text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section className="border-t border-white/[0.04] bg-surface-50/50 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <p className="section-title text-brand">How It Works</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">
              The 4-Step Signature Trade
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-400">
              Our engine replicates the exact sequence institutional traders use to
              accumulate positions before explosive moves.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: "01", title: "Wedge Forming", desc: "Price contracts into a narrowing range, trapping liquidity above and below the consolidation zone.", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
              { step: "02", title: "Stop Hunt", desc: "A sharp wick pierces key levels, triggering retail stop-losses and providing institutional capital cheap entries.", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
              { step: "03", title: "Exhaustion", desc: "A doji candle appears — selling pressure is absorbed. Institutions have finished accumulating.", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
              { step: "04", title: "Reversal", desc: "A decisive candle in the true direction confirms the move. The bot enters with bracket orders.", color: "text-brand", bg: "bg-brand/10 border-brand/20" },
            ].map((s) => (
              <div key={s.step} className={`rounded-2xl border ${s.bg} p-6`}>
                <div className={`text-3xl font-black ${s.color} opacity-40`}>{s.step}</div>
                <h3 className="mt-3 text-lg font-bold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FEATURES ═══════════════ */}
      <section id="features" className="border-t border-white/[0.04] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="section-title text-brand">Features</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">
              Everything You Need to Trade Institutionally
            </h2>
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  {f.icon}
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ PRICING ═══════════════ */}
      <section id="pricing" className="border-t border-white/[0.04] bg-surface-50/50 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <p className="section-title text-brand">Pricing</p>
            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">
              Choose Your Edge
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-400">
              Start with paper trading for free. Upgrade to go live with full automation.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl border p-8 ${
                  p.highlight
                    ? "border-brand/40 bg-brand/[0.04] shadow-glow"
                    : "border-white/[0.08] bg-surface-50"
                }`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-4 py-1 text-xs font-bold text-surface">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">{p.price}</span>
                  <span className="text-slate-500">{p.period}</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{p.desc}</p>

                <ul className="mt-6 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={`mt-8 block w-full rounded-lg py-3 text-center text-sm font-bold transition ${
                    p.highlight
                      ? "bg-brand text-surface shadow-glow-sm hover:bg-brand-400"
                      : "border border-white/10 text-slate-300 hover:border-brand/30 hover:text-brand"
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ CTA ═══════════════ */}
      <section className="border-t border-white/[0.04] py-20 md:py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Ready to Trade Like the Institutions?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Join traders using our FOREXIA engine to detect institutional moves
            on NAS100 before they happen.
          </p>
          <Link href="/register" className="btn-brand mt-8 inline-block px-10 py-4 text-base font-bold">
            Create Free Account
          </Link>
        </div>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="border-t border-white/[0.06] bg-surface-50/50 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand/15">
                  <svg className="h-3.5 w-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <span className="font-bold text-white">FORE<span className="text-brand">XIA</span></span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Institutional NAS100 execution engine. Detect institutional moves. Trade with precision.
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Product</h4>
              <div className="mt-3 flex flex-col gap-2">
                <a href="#features" className="text-sm text-slate-500 hover:text-white transition">Features</a>
                <a href="#pricing" className="text-sm text-slate-500 hover:text-white transition">Pricing</a>
                <Link href="/blog" className="text-sm text-slate-500 hover:text-white transition">Blog</Link>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Account</h4>
              <div className="mt-3 flex flex-col gap-2">
                <Link href="/register" className="text-sm text-slate-500 hover:text-white transition">Create Account</Link>
                <Link href="/login" className="text-sm text-slate-500 hover:text-white transition">Log In</Link>
                <Link href="/dashboard" className="text-sm text-slate-500 hover:text-white transition">Dashboard</Link>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Legal</h4>
              <div className="mt-3 flex flex-col gap-2">
                <span className="text-sm text-slate-500">Terms of Service</span>
                <span className="text-sm text-slate-500">Privacy Policy</span>
                <span className="text-sm text-slate-500">Risk Disclosure</span>
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-white/[0.04] pt-6 text-center">
            <p className="text-[11px] text-slate-600">
              © {new Date().getFullYear()} NQ-Trading Agents. NAS100 Institutional Execution Engine. Trading futures involves risk of loss.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
