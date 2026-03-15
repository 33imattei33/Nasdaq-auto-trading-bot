"use client";

import Link from "next/link";

const POSTS = [
  {
    slug: "what-is-smart-money",
    category: "Education",
    date: "Mar 10, 2026",
    title: "What Is Smart Money and Why Does It Matter for NAS100?",
    excerpt:
      "Smart money refers to the capital controlled by institutional investors, central banks, and hedge funds. Understanding how they move price is the key to profitable futures trading.",
    readTime: "6 min read",
  },
  {
    slug: "signature-trade-explained",
    category: "Strategy",
    date: "Mar 8, 2026",
    title: "The 4-Step Signature Trade: How Institutions Trap Retail Traders",
    excerpt:
      "Wedge → Stop Hunt → Exhaustion → Reversal. This is the exact sequence institutions use to accumulate positions. Our bot detects it automatically on every scan cycle.",
    readTime: "8 min read",
  },
  {
    slug: "kill-zones-timing",
    category: "Strategy",
    date: "Mar 5, 2026",
    title: "Kill Zones: Why Timing Is Everything in NAS100 Trading",
    excerpt:
      "The London (08–12 UTC) and New York (14–16 UTC) kill zones are when 80% of the daily range is established. Trading outside these windows is like fishing in an empty pond.",
    readTime: "5 min read",
  },
  {
    slug: "apex-risk-management",
    category: "Risk Management",
    date: "Mar 3, 2026",
    title: "APEX Prop-Firm Compliant: How Our Risk Engine Protects Your Account",
    excerpt:
      "With $300 max risk per trade, 2% equity cap, 4-contract limit, and trailing drawdown protection — our bot is built from the ground up for funded accounts.",
    readTime: "7 min read",
  },
  {
    slug: "hegelian-weekly-structure",
    category: "Education",
    date: "Feb 28, 2026",
    title: "The Hegelian 5-Act Weekly Structure: Trading With the Narrative",
    excerpt:
      "Monday = Connector, Tuesday = Accumulation, Wednesday = Reversal, Thursday = Distribution, Friday = Epilogue. Each day plays a different role in the institutional weekly cycle.",
    readTime: "9 min read",
  },
  {
    slug: "stop-hunt-detection",
    category: "Technical",
    date: "Feb 25, 2026",
    title: "How Our Engine Detects Stop Hunts in Real Time",
    excerpt:
      "Stop hunts are wicks that pierce key levels to trigger retail stop-losses. Our algorithm measures wick-to-body ratios, zone breaches, and lookback windows to catch them instantly.",
    readTime: "6 min read",
  },
];

const CATEGORIES = ["All", "Education", "Strategy", "Risk Management", "Technical"];

export default function BlogPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-surface/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15">
              <svg className="h-4 w-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-lg font-bold text-white">
              Smart<span className="text-brand">Money</span>
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm text-slate-400 transition hover:text-white">Home</Link>
            <Link href="/blog/studio" className="flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-brand">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI Studio
            </Link>
            <Link href="/login" className="text-sm text-slate-300 transition hover:text-white">Log In</Link>
            <Link href="/register" className="btn-brand text-xs">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="border-b border-white/[0.04] py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="section-title text-brand">Blog</p>
          <h1 className="mt-3 text-3xl font-bold text-white md:text-5xl">
            Smart Money Insights
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Deep dives into institutional trading strategies, NAS100 analysis,
            risk management, and the technology behind our execution engine.
          </p>
          <Link
            href="/blog/studio"
            className="btn-brand mt-6 inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Open AI Studio
          </Link>
        </div>
      </section>

      {/* Categories */}
      <div className="border-b border-white/[0.04]">
        <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto px-6 py-4">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition ${
                c === "All"
                  ? "bg-brand/15 text-brand"
                  : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Articles */}
      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {POSTS.map((post) => (
              <article
                key={post.slug}
                className="glass-card group cursor-pointer p-6 transition hover:border-brand/20"
              >
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-semibold text-brand">
                    {post.category}
                  </span>
                  <span className="text-slate-600">{post.date}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-600">{post.readTime}</span>
                </div>

                <h2 className="mt-4 text-lg font-bold leading-snug text-white transition group-hover:text-brand">
                  {post.title}
                </h2>

                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {post.excerpt}
                </p>

                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-brand opacity-0 transition group-hover:opacity-100">
                  Read article
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/[0.04] py-16">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-2xl font-bold text-white">
            Ready to put this knowledge into action?
          </h2>
          <p className="mt-3 text-slate-400">
            Start trading with the Smart Money engine — signals with full analysis thesis included.
          </p>
          <Link href="/register" className="btn-brand mt-6 inline-block px-8 py-3 text-sm font-bold">
            Create Free Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 text-center">
        <p className="text-[11px] text-slate-600">
          © {new Date().getFullYear()} NQ-Trading Agents. NAS100 Institutional Execution Engine.
        </p>
      </footer>
    </div>
  );
}
