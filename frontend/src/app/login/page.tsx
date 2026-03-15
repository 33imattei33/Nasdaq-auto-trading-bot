"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }
    setError("");
    setLoading(true);
    // Simulate login — in production this would call a backend API
    setTimeout(() => {
      setLoading(false);
      router.push("/dashboard");
    }, 1200);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left: Form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 md:px-16 lg:px-24">
        <Link href="/" className="mb-10 flex items-center gap-2.5 self-start">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15">
            <svg className="h-4 w-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="text-lg font-bold text-white">
            Smart<span className="text-brand">Money</span>
          </span>
        </Link>

        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-white md:text-3xl">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-400">
            Log in to access your trading dashboard and Smart Money signals.
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-surface-100 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-brand/40 focus:ring-1 focus:ring-brand/20"
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">Password</label>
                <button type="button" className="text-[11px] text-brand hover:underline">
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-surface-100 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-brand/40 focus:ring-1 focus:ring-brand/20"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-brand w-full py-3 text-sm font-bold disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface border-t-transparent" />
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] uppercase tracking-wider text-slate-600">or</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {/* Tradovate direct login */}
          <button className="btn-ghost mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm">
            <svg className="h-4 w-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Sign in with Tradovate
          </button>

          <p className="mt-8 text-center text-xs text-slate-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-brand hover:underline">
              Create one for free
            </Link>
          </p>
        </div>
      </div>

      {/* Right: Visual panel */}
      <div className="hidden flex-1 items-center justify-center border-l border-white/[0.04] bg-surface-50/50 lg:flex">
        <div className="max-w-sm px-10 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand/10">
            <svg className="h-10 w-10 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="mt-6 text-xl font-bold text-white">
            Your Edge Awaits
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Access real-time institutional signals, automated execution, and Hegelian
            market structure analysis — all from one dashboard.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { value: "4-Step", label: "Signature Trade" },
              { value: "< 2s", label: "Signal Latency" },
              { value: "24/5", label: "Market Coverage" },
              { value: "APEX", label: "Risk Compliant" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-surface-100/60 p-3">
                <div className="text-lg font-bold text-brand">{stat.value}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
