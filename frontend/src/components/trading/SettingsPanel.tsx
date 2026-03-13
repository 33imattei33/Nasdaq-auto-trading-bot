"use client";

import { useState, useEffect } from "react";

interface SettingsPanelProps {
  isLive: boolean;
  accountSpec?: string;
  mode?: string;
  onConnect: (creds: {
    username: string;
    password: string;
    live: boolean;
    cid?: number;
    sec?: string;
  }) => Promise<{ connected: boolean; error?: string; hint?: string; account_spec?: string }>;
  onConnectWithToken: (payload: {
    access_token: string;
    md_access_token?: string;
    live: boolean;
  }) => Promise<{ connected: boolean; error?: string; account_spec?: string }>;
  onBrowserLogin: (payload: {
    username: string;
    password: string;
    live: boolean;
  }) => Promise<{ connected: boolean; error?: string; account_spec?: string }>;
  onDisconnect: () => Promise<void>;
}

type AuthTab = "browser" | "token" | "credentials";

export default function SettingsPanel({
  isLive,
  accountSpec,
  mode,
  onConnect,
  onConnectWithToken,
  onBrowserLogin,
  onDisconnect,
}: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AuthTab>("browser");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [live, setLive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cid, setCid] = useState("");
  const [sec, setSec] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [mdAccessToken, setMdAccessToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Load saved username from localStorage or backend .env
  useEffect(() => {
    const saved = localStorage.getItem("tv_username");
    if (saved) {
      setUsername(saved);
    } else {
      // Try to get saved credentials from backend .env
      fetch("http://localhost:8000/api/settings/saved-credentials")
        .then((r) => r.json())
        .then((data) => {
          if (data.username && !username) setUsername(data.username);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    if (!username || !password) {
      setResult({ ok: false, message: "Username and password are required." });
      return;
    }
    setLoading(true);
    setResult(null);

    try {
      const res = await onConnect({
        username,
        password,
        live,
        cid: cid ? parseInt(cid) : undefined,
        sec: sec || undefined,
      });

      if (res.connected) {
        localStorage.setItem("tv_username", username);
        setResult({
          ok: true,
          message: `Connected to ${res.account_spec ?? "Tradovate"}`,
        });
        // Close panel after success
        setTimeout(() => setOpen(false), 1500);
      } else {
        setResult({
          ok: false,
          message: res.error ?? "Connection failed",
        });
      }
    } catch (e: unknown) {
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    await onDisconnect();
    setResult({ ok: true, message: "Disconnected — paper mode" });
    setLoading(false);
  };

  const handleTokenConnect = async () => {
    if (!accessToken.trim()) {
      setResult({ ok: false, message: "Paste your access token." });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await onConnectWithToken({
        access_token: accessToken.trim(),
        md_access_token: mdAccessToken.trim() || undefined,
        live,
      });
      if (res.connected) {
        setResult({
          ok: true,
          message: `Connected to ${res.account_spec ?? "Tradovate"}`,
        });
        setTimeout(() => setOpen(false), 1500);
      } else {
        setResult({ ok: false, message: res.error ?? "Token rejected" });
      }
    } catch (e: unknown) {
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBrowserLogin = async () => {
    setLoading(true);
    setResult({ ok: true, message: "Browser window opening — log in there…" });
    try {
      const res = await onBrowserLogin({
        username,
        password,
        live,
      });
      if (res.connected) {
        setResult({
          ok: true,
          message: `Connected to ${res.account_spec ?? "Tradovate"}`,
        });
        setTimeout(() => setOpen(false), 1500);
      } else {
        setResult({ ok: false, message: res.error ?? "Browser login failed" });
      }
    } catch (e: unknown) {
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Gear button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg bg-slate-800/80 p-2 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
        title="Account Settings"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-100">
                Account Settings
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Connection status */}
            <div
              className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                isLive
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-800/50 text-slate-400"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isLive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                }`}
              />
              {isLive ? (
                <span>
                  Connected to <strong>{accountSpec}</strong>{" "}
                  <span className="text-slate-500">({mode})</span>
                </span>
              ) : (
                <span>Not connected — Paper mode</span>
              )}
            </div>

            {/* Disconnect button if live */}
            {isLive && (
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="mb-4 w-full rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                {loading ? "Disconnecting…" : "Disconnect"}
              </button>
            )}

            {/* Credentials form */}
            {!isLive && (
              <div className="space-y-3">
                {/* Tab switcher */}
                <div className="flex gap-1 rounded-lg bg-slate-800 p-0.5">
                  <button
                    onClick={() => { setTab("browser"); setResult(null); }}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      tab === "browser"
                        ? "bg-amber-500/20 text-amber-300"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    🌐 Browser Login
                  </button>
                  <button
                    onClick={() => { setTab("token"); setResult(null); }}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      tab === "token"
                        ? "bg-amber-500/20 text-amber-300"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    🔑 Token
                  </button>
                  <button
                    onClick={() => { setTab("credentials"); setResult(null); }}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      tab === "credentials"
                        ? "bg-amber-500/20 text-amber-300"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    API Keys
                  </button>
                </div>

                {/* ──── Browser Login Tab ──── */}
                {tab === "browser" && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <p className="text-[11px] leading-relaxed text-emerald-200/80">
                        <strong>Recommended.</strong> A Chromium browser will open
                        with your credentials pre-filled and auto-submitted.
                        If Tradovate shows a CAPTCHA, solve it in the browser
                        window. Your token is captured automatically.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Username <span className="text-slate-600">(optional — uses .env if empty)</span>
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. APEX_384980"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none transition focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Password <span className="text-slate-600">(optional — uses .env if empty)</span>
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Uses saved .env password"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none transition focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                      />
                    </div>

                    {/* Environment toggle */}
                    <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
                      <span className="text-xs text-slate-400">Environment</span>
                      <div className="flex gap-1 rounded-lg bg-slate-800 p-0.5">
                        <button
                          onClick={() => setLive(false)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                            !live
                              ? "bg-amber-500/20 text-amber-300"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          DEMO
                        </button>
                        <button
                          onClick={() => setLive(true)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                            live
                              ? "bg-red-500/20 text-red-300"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          LIVE
                        </button>
                      </div>
                      {live && (
                        <span className="text-[10px] text-red-400">
                          ⚠ Real money
                        </span>
                      )}
                    </div>

                    {/* Launch button */}
                    <button
                      onClick={handleBrowserLogin}
                      disabled={loading}
                      className="w-full rounded-lg bg-emerald-500/90 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          Logging in — check the browser window…
                        </span>
                      ) : (
                        "🌐 Launch Browser Login"
                      )}
                    </button>

                    {loading && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                        <p className="text-center text-[11px] text-amber-200/80">
                          <strong>A Chromium window should appear.</strong><br/>
                          Your credentials are auto-filled and submitted.<br/>
                          If you see a CAPTCHA, solve it in that window.<br/>
                          This will auto-connect once login succeeds (3 min timeout).
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ──── Token Tab ──── */}
                {tab === "token" && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-3">
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        If you already have a token from DevTools / Local Storage,
                        paste it below.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Access Token
                      </label>
                      <textarea
                        rows={3}
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        placeholder="Paste your access token here…"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-xs text-slate-200 placeholder-slate-600 outline-none transition focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-slate-500">
                        Market Data Token <span className="text-slate-600">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={mdAccessToken}
                        onChange={(e) => setMdAccessToken(e.target.value)}
                        placeholder="Only if different from above"
                        className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-amber-500/50"
                      />
                    </div>

                    {/* Environment toggle */}
                    <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
                      <span className="text-xs text-slate-400">Environment</span>
                      <div className="flex gap-1 rounded-lg bg-slate-800 p-0.5">
                        <button
                          onClick={() => setLive(false)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                            !live
                              ? "bg-amber-500/20 text-amber-300"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          DEMO
                        </button>
                        <button
                          onClick={() => setLive(true)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                            live
                              ? "bg-red-500/20 text-red-300"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          LIVE
                        </button>
                      </div>
                      {live && (
                        <span className="text-[10px] text-red-400">
                          ⚠ Real money
                        </span>
                      )}
                    </div>

                    <button
                      onClick={handleTokenConnect}
                      disabled={loading || !accessToken.trim()}
                      className="w-full rounded-lg bg-amber-500/90 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          Connecting…
                        </span>
                      ) : (
                        "Connect with Token"
                      )}
                    </button>
                  </div>
                )}

                {/* ──── Credentials Tab ──── */}
                {tab === "credentials" && (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Tradovate Username
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. APEX_384980"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none transition focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Password
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none transition focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30"
                      />
                    </div>

                    {/* Environment toggle */}
                    <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
                      <span className="text-xs text-slate-400">Environment</span>
                      <div className="flex gap-1 rounded-lg bg-slate-800 p-0.5">
                        <button
                          onClick={() => setLive(false)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                            !live
                              ? "bg-amber-500/20 text-amber-300"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          DEMO
                        </button>
                        <button
                          onClick={() => setLive(true)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                            live
                              ? "bg-red-500/20 text-red-300"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          LIVE
                        </button>
                      </div>
                      {live && (
                        <span className="text-[10px] text-red-400">
                          ⚠ Real money
                        </span>
                      )}
                    </div>

                    {/* Advanced: API Keys */}
                    <button
                      onClick={() => setShowAdvanced((a) => !a)}
                      className="text-xs text-slate-500 transition hover:text-slate-300"
                    >
                      {showAdvanced ? "▾" : "▸"} API Keys (optional — bypasses
                      CAPTCHA)
                    </button>

                    {showAdvanced && (
                      <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">
                            Client ID (cid)
                          </label>
                          <input
                            type="text"
                            value={cid}
                            onChange={(e) => setCid(e.target.value)}
                            placeholder="Numeric ID from Tradovate"
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-amber-500/50"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-slate-500">
                            API Secret
                          </label>
                          <input
                            type="password"
                            value={sec}
                            onChange={(e) => setSec(e.target.value)}
                            placeholder="Secret from Tradovate API settings"
                            className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-amber-500/50"
                          />
                        </div>
                        <p className="text-[10px] leading-relaxed text-slate-600">
                          Get API keys at{" "}
                          <a
                            href="https://trader.tradovate.com/#/security"
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-500/70 underline"
                          >
                            trader.tradovate.com → Security
                          </a>
                        </p>
                      </div>
                    )}

                    {/* Connect button */}
                    <button
                      onClick={handleConnect}
                      disabled={loading || !username || !password}
                      className="w-full rounded-lg bg-amber-500/90 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg
                            className="h-4 w-4 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                            />
                          </svg>
                          Connecting…
                        </span>
                      ) : (
                        "Connect to Tradovate"
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Result feedback */}
            {result && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  result.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                {result.message}
              </div>
            )}

            {/* Help text */}
            <p className="mt-4 text-[10px] leading-relaxed text-slate-600">
              Your credentials are sent directly to Tradovate&apos;s API and are
              never stored on any server. Only the username is saved locally for convenience.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
