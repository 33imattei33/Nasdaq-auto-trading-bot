"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    plan: "pro",
    tradovateUser: "",
    agree: false,
  });
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      if (!form.name || !form.email || !form.password) {
        setError("Please fill in all fields");
        return;
      }
      if (form.password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      if (!form.agree) {
        setError("You must agree to the terms");
        return;
      }
      setError("");
      setStep(2);
      return;
    }

    // Step 2: Submit
    setLoading(true);
    setError("");
    // Simulate registration — in production this would call a backend API
    setTimeout(() => {
      setLoading(false);
      router.push("/dashboard");
    }, 1500);
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
            FORE<span className="text-brand">XIA</span>
          </span>
        </Link>

        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-white md:text-3xl">Create your account</h1>
          <p className="mt-2 text-sm text-slate-400">
            {step === 1
              ? "Start trading NAS100 with institutional signals."
              : "Connect your Tradovate account to start live trading."}
          </p>

          {/* Step indicator */}
          <div className="mt-6 flex items-center gap-3">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              step >= 1 ? "bg-brand text-surface" : "bg-surface-200 text-slate-500"
            }`}>1</div>
            <div className={`h-px flex-1 ${step >= 2 ? "bg-brand/50" : "bg-surface-200"}`} />
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              step >= 2 ? "bg-brand text-surface" : "bg-surface-200 text-slate-500"
            }`}>2</div>
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>Account</span>
            <span>Broker</span>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {step === 1 ? (
              <>
                {/* Name */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Full Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-surface-100 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-brand/40 focus:ring-1 focus:ring-brand/20"
                    placeholder="Your name"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-surface-100 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-brand/40 focus:ring-1 focus:ring-brand/20"
                    placeholder="you@example.com"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-surface-100 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-brand/40 focus:ring-1 focus:ring-brand/20"
                    placeholder="Min 8 characters"
                  />
                </div>

                {/* Plan selector */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Select Plan</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "starter", label: "Starter", price: "$49/mo" },
                      { id: "pro", label: "Pro", price: "$149/mo" },
                      { id: "institution", label: "Institution", price: "$399/mo" },
                    ].map((pl) => (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => setForm({ ...form, plan: pl.id })}
                        className={`rounded-lg border p-3 text-center transition ${
                          form.plan === pl.id
                            ? "border-brand/40 bg-brand/[0.06]"
                            : "border-white/10 bg-surface-100 hover:border-white/20"
                        }`}
                      >
                        <div className={`text-xs font-bold ${form.plan === pl.id ? "text-brand" : "text-white"}`}>
                          {pl.label}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">{pl.price}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Terms */}
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.agree}
                    onChange={(e) => setForm({ ...form, agree: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-white/20 bg-surface-100 text-brand focus:ring-brand/30"
                  />
                  <span className="text-xs text-slate-400">
                    I agree to the{" "}
                    <span className="text-brand">Terms of Service</span> and{" "}
                    <span className="text-brand">Risk Disclosure</span>. Trading futures involves
                    substantial risk of loss.
                  </span>
                </label>

                <button type="submit" className="btn-brand w-full py-3 text-sm font-bold">
                  Continue
                </button>
              </>
            ) : (
              <>
                {/* Tradovate credentials */}
                <div className="rounded-xl border border-white/[0.08] bg-surface-100 p-5">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                    <svg className="h-4 w-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                    Connect Tradovate Account
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Optional — you can also connect later from the dashboard Settings panel.
                  </p>

                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">Tradovate Username</label>
                      <input
                        type="text"
                        value={form.tradovateUser}
                        onChange={(e) => setForm({ ...form, tradovateUser: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-surface-200 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-brand/40 focus:ring-1 focus:ring-brand/20"
                        placeholder="Your Tradovate username"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-brand/[0.06] px-3 py-2 text-[11px] text-brand">
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    Secure browser-based login. We never store your Tradovate password.
                  </div>
                </div>

                {/* Broker mode */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">Trading Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-brand/40 bg-brand/[0.06] p-3 text-center">
                      <div className="text-xs font-bold text-brand">DEMO</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">Paper trading</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-surface-100 p-3 text-center opacity-50">
                      <div className="text-xs font-bold text-slate-400">LIVE</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">Requires Pro plan</div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="btn-ghost flex-1 py-3 text-sm"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-brand flex-1 py-3 text-sm font-bold disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface border-t-transparent" />
                        Creating…
                      </span>
                    ) : (
                      "Create Account"
                    )}
                  </button>
                </div>
              </>
            )}
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>

      {/* Right: Visual panel */}
      <div className="hidden flex-1 items-center justify-center border-l border-white/[0.04] bg-surface-50/50 lg:flex">
        <div className="max-w-sm px-10 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand/10">
            <svg className="h-10 w-10 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h2 className="mt-6 text-xl font-bold text-white">
            Start Trading With the Institutions
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Get access to the FOREXIA engine — institutional signal detection,
            automated Tradovate execution, and APEX-compliant risk management.
          </p>
          <div className="mt-8 space-y-3 text-left">
            {[
              "4-step Signature Trade detection",
              "Full analysis thesis per signal",
              "Kill zone precision timing",
              "APEX prop-firm risk engine",
              "Live Tradovate integration",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-slate-300">
                <svg className="h-4 w-4 flex-shrink-0 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
