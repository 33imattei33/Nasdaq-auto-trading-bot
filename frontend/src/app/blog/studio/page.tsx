"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   SEO ANALYSIS ENGINE (runs client-side in real-time)
   ═══════════════════════════════════════════════════════════════════════ */

interface SeoScore {
  overall: number;
  title: { score: number; tips: string[] };
  meta: { score: number; tips: string[] };
  keywords: { score: number; density: number; tips: string[] };
  readability: { score: number; avgSentenceLen: number; tips: string[] };
  structure: { score: number; headingCount: number; tips: string[] };
  length: { score: number; wordCount: number; tips: string[] };
}

function analyzeSeo(title: string, meta: string, body: string, keyword: string): SeoScore {
  const words = body.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgSentenceLen = sentences.length > 0 ? Math.round(wordCount / sentences.length) : 0;
  const headings = (body.match(/^#{1,3}\s.+/gm) || []).length;
  const kw = keyword.toLowerCase().trim();
  const kwCount = kw
    ? (body.toLowerCase().match(new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")) || []).length
    : 0;
  const density = wordCount > 0 ? (kwCount / wordCount) * 100 : 0;

  // Title scoring
  const titleTips: string[] = [];
  let titleScore = 0;
  if (title.length >= 30 && title.length <= 60) titleScore += 40;
  else if (title.length > 0) { titleScore += 15; titleTips.push("Title should be 30–60 characters"); }
  else titleTips.push("Add a title");
  if (kw && title.toLowerCase().includes(kw)) titleScore += 30;
  else if (kw) titleTips.push("Include focus keyword in title");
  if (/\d/.test(title)) titleScore += 15;
  else titleTips.push("Add a number for higher CTR");
  if (/[?!:|—]/.test(title)) titleScore += 15;
  else titleTips.push("Use power punctuation (? ! : — )");

  // Meta scoring
  const metaTips: string[] = [];
  let metaScore = 0;
  if (meta.length >= 120 && meta.length <= 160) metaScore += 50;
  else if (meta.length > 0) { metaScore += 20; metaTips.push("Meta description should be 120–160 chars"); }
  else metaTips.push("Add a meta description");
  if (kw && meta.toLowerCase().includes(kw)) metaScore += 30;
  else if (kw) metaTips.push("Include focus keyword in meta");
  if (/\b(learn|discover|how to|guide|tips|strategy)\b/i.test(meta)) metaScore += 20;
  else metaTips.push("Use action words (learn, discover, how to)");

  // Keyword scoring
  const kwTips: string[] = [];
  let kwScore = 0;
  if (!kw) { kwTips.push("Set a focus keyword"); }
  else {
    if (density >= 0.5 && density <= 2.5) kwScore += 50;
    else if (density < 0.5) { kwScore += 10; kwTips.push("Use keyword more (target 1–2% density)"); }
    else { kwScore += 20; kwTips.push("Keyword stuffing detected — reduce usage"); }
    if (body.slice(0, 300).toLowerCase().includes(kw)) kwScore += 25;
    else kwTips.push("Use keyword in first paragraph");
    if (headings > 0) {
      const headingLines = body.match(/^#{1,3}\s.+/gm) || [];
      const kwInH = headingLines.some((h) => h.toLowerCase().includes(kw));
      if (kwInH) kwScore += 25;
      else kwTips.push("Include keyword in at least one heading");
    }
  }

  // Readability scoring
  const readTips: string[] = [];
  let readScore = 0;
  if (avgSentenceLen > 0 && avgSentenceLen <= 20) readScore += 40;
  else if (avgSentenceLen > 20 && avgSentenceLen <= 30) { readScore += 25; readTips.push("Shorten sentences for readability"); }
  else if (avgSentenceLen > 30) { readScore += 10; readTips.push("Sentences are too long — aim for ≤ 20 words"); }
  const paragraphs = body.split(/\n\n+/).filter(Boolean);
  const shortParas = paragraphs.filter((p) => p.split(/\s+/).length <= 100).length;
  if (paragraphs.length > 0 && shortParas / paragraphs.length > 0.7) readScore += 30;
  else readTips.push("Break text into shorter paragraphs");
  if (/[-*]\s/.test(body) || /\d+\.\s/.test(body)) readScore += 30;
  else readTips.push("Add bullet points or numbered lists");

  // Structure scoring
  const structTips: string[] = [];
  let structScore = 0;
  if (headings >= 3) structScore += 50;
  else if (headings >= 1) { structScore += 25; structTips.push("Add more headings (aim for 3+)"); }
  else structTips.push("Add H2/H3 headings with ## or ###");
  if (/\!\[/.test(body) || /\[.*\]\(.*\)/.test(body)) structScore += 25;
  else structTips.push("Add links or image references");
  if (body.includes("**") || body.includes("*")) structScore += 25;
  else structTips.push("Use bold/italic for emphasis");

  // Length scoring
  const lenTips: string[] = [];
  let lenScore = 0;
  if (wordCount >= 1500) lenScore = 100;
  else if (wordCount >= 1000) { lenScore = 75; lenTips.push("Great length! 1500+ words ranks better"); }
  else if (wordCount >= 600) { lenScore = 50; lenTips.push("Good start — aim for 1000+ words"); }
  else if (wordCount >= 300) { lenScore = 30; lenTips.push("Thin content — expand to 600+ words"); }
  else { lenScore = 10; lenTips.push("Very short — search engines prefer 1000+ words"); }

  const overall = Math.round(
    titleScore * 0.15 + metaScore * 0.15 + kwScore * 0.25 + readScore * 0.2 + structScore * 0.1 + lenScore * 0.15
  );

  return {
    overall,
    title: { score: titleScore, tips: titleTips },
    meta: { score: metaScore, tips: metaTips },
    keywords: { score: kwScore, density: Math.round(density * 100) / 100, tips: kwTips },
    readability: { score: readScore, avgSentenceLen, tips: readTips },
    structure: { score: structScore, headingCount: headings, tips: structTips },
    length: { score: lenScore, wordCount, tips: lenTips },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   AI ARTICLE TEMPLATES
   ═══════════════════════════════════════════════════════════════════════ */

interface GenerateOpts {
  topic: string;
  keyword: string;
  tone: string;
  length: string;
}

async function generateArticle(opts: GenerateOpts): Promise<{ title: string; meta: string; body: string }> {
  const res = await fetch("http://localhost:8000/api/blog/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error("Generation failed");
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════════════
   SCORE BAR COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

function ScoreBar({ label, score, detail }: { label: string; score: number; detail?: string }) {
  const color =
    score >= 75 ? "bg-brand" : score >= 50 ? "bg-amber-400" : score >= 25 ? "bg-orange-500" : "bg-red-500";
  const textColor =
    score >= 75 ? "text-brand" : score >= 50 ? "text-amber-400" : score >= 25 ? "text-orange-500" : "text-red-400";
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={`font-bold ${textColor}`}>
          {score}/100{detail ? ` · ${detail}` : ""}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-200">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN STUDIO COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

const TONES = ["Professional", "Educational", "Conversational", "Technical", "Persuasive"];
const LENGTHS = ["Short (~600 words)", "Medium (~1000 words)", "Long (~1500 words)", "In-Depth (~2000 words)"];

export default function BlogStudioPage() {
  // Editor state
  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState("");
  const [body, setBody] = useState("");
  const [keyword, setKeyword] = useState("");

  // Generator state
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("Educational");
  const [length, setLength] = useState("Medium (~1000 words)");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  // UI state
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [seoOpen, setSeoOpen] = useState(true);

  // SEO scoring (debounced)
  const [seo, setSeo] = useState<SeoScore | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSeo = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSeo(analyzeSeo(title, meta, body, keyword));
    }, 400);
  }, [title, meta, body, keyword]);

  useEffect(() => { runSeo(); }, [runSeo]);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setGenError("");
    try {
      const result = await generateArticle({ topic, keyword, tone, length });
      setTitle(result.title);
      setMeta(result.meta);
      setBody(result.body);
    } catch {
      setGenError("Generation failed — check that the backend is running.");
    } finally {
      setGenerating(false);
    }
  };

  const scoreColor = (s: number) =>
    s >= 75 ? "text-brand" : s >= 50 ? "text-amber-400" : s >= 25 ? "text-orange-500" : "text-red-400";
  const scoreBg = (s: number) =>
    s >= 75 ? "border-brand/30 bg-brand/[0.08]" : s >= 50 ? "border-amber-400/30 bg-amber-400/[0.08]" : "border-red-500/30 bg-red-500/[0.08]";

  /* ── Markdown to basic HTML for preview ── */
  const renderPreview = (md: string) => {
    return md
      .replace(/^### (.+)$/gm, '<h3 class="mt-6 mb-2 text-lg font-bold text-white">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="mt-8 mb-3 text-xl font-bold text-white">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="mt-8 mb-4 text-2xl font-bold text-white">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-slate-300">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-300">$2</li>')
      .replace(/\n\n/g, '</p><p class="mt-3 text-sm leading-relaxed text-slate-400">')
      .replace(/^/, '<p class="mt-3 text-sm leading-relaxed text-slate-400">')
      .concat("</p>");
  };

  return (
    <div className="min-h-screen">
      {/* ─── Nav ─── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-surface/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/15">
                <svg className="h-3.5 w-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-sm font-bold text-white">
                Smart<span className="text-brand">Money</span>
              </span>
            </Link>
            <span className="text-slate-600">/</span>
            <Link href="/blog" className="text-xs text-slate-400 hover:text-white">Blog</Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-medium text-white">AI Studio</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-ghost px-3 py-1.5 text-[11px]" onClick={() => {
              const blob = new Blob([`# ${title}\n\n> ${meta}\n\n${body}`], { type: "text/markdown" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${title.replace(/\s+/g, "-").toLowerCase() || "article"}.md`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <svg className="mr-1 inline h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export .md
            </button>
            <Link href="/blog" className="btn-brand px-3 py-1.5 text-[11px]">
              ← Back to Blog
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto flex max-w-7xl gap-5 px-6 py-6">
        {/* ═══════════════════════════════════════════════════════════════
           LEFT — Editor
           ═══════════════════════════════════════════════════════════════ */}
        <div className="flex-1 space-y-5">
          {/* AI Generator Panel */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <svg className="h-4 w-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              AI Article Generator
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Describe your topic and the AI will draft a full SEO-optimized article.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-400">Topic / Prompt</label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-white/10 bg-surface-100 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition focus:border-brand/40"
                  placeholder="e.g. How to identify stop hunts in NAS100 using the FOREXIA approach..."
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">Focus Keyword</label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-surface-100 px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition focus:border-brand/40"
                    placeholder="e.g. stop hunt detection"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">Tone</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-surface-100 px-3 py-2 text-xs text-white outline-none focus:border-brand/40"
                  >
                    {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">Length</label>
                  <select
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-surface-100 px-3 py-2 text-xs text-white outline-none focus:border-brand/40"
                  >
                    {LENGTHS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              {genError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">{genError}</div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || !topic.trim()}
                className="btn-brand w-full py-2.5 text-xs font-bold disabled:opacity-50"
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-surface border-t-transparent" />
                    Generating article…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Generate Article with AI
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Write / Preview Tabs */}
          <div className="flex items-center gap-1 rounded-lg bg-surface-100 p-1">
            <button
              onClick={() => setTab("write")}
              className={`flex-1 rounded-md px-4 py-2 text-xs font-medium transition ${
                tab === "write" ? "bg-surface-200 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <svg className="mr-1.5 inline h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
              Write
            </button>
            <button
              onClick={() => setTab("preview")}
              className={`flex-1 rounded-md px-4 py-2 text-xs font-medium transition ${
                tab === "preview" ? "bg-surface-200 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <svg className="mr-1.5 inline h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.206.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Preview
            </button>
          </div>

          {/* Editor Area */}
          <div className="glass-card p-5">
            {tab === "write" ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">Article Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-surface-100 px-4 py-2.5 text-base font-bold text-white placeholder-slate-600 outline-none transition focus:border-brand/40"
                    placeholder="Your article title…"
                  />
                  <div className="mt-1 text-right text-[10px] text-slate-600">{title.length}/60 chars</div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-400">Meta Description</label>
                  <textarea
                    value={meta}
                    onChange={(e) => setMeta(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-white/10 bg-surface-100 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-brand/40"
                    placeholder="Brief description for search engines…"
                  />
                  <div className="mt-1 text-right text-[10px] text-slate-600">{meta.length}/160 chars</div>
                </div>

                <div>
                  <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-400">
                    Article Body (Markdown)
                    <span className="text-slate-600">{body.split(/\s+/).filter(Boolean).length} words</span>
                  </label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={24}
                    className="w-full rounded-lg border border-white/10 bg-surface-100 px-4 py-3 font-mono text-sm leading-relaxed text-slate-300 placeholder-slate-600 outline-none transition focus:border-brand/40"
                    placeholder="Write your article in Markdown…&#10;&#10;## Introduction&#10;&#10;Start writing here...&#10;&#10;## Key Points&#10;&#10;- Point one&#10;- Point two"
                  />
                </div>
              </div>
            ) : (
              <div className="min-h-[500px]">
                {title && (
                  <h1 className="text-2xl font-bold text-white md:text-3xl">{title}</h1>
                )}
                {meta && (
                  <p className="mt-2 text-sm italic text-slate-500">{meta}</p>
                )}
                {body ? (
                  <div
                    className="mt-6 prose-invert"
                    dangerouslySetInnerHTML={{ __html: renderPreview(body) }}
                  />
                ) : (
                  <div className="flex h-60 items-center justify-center text-sm text-slate-600">
                    Start writing to see the preview
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
           RIGHT — SEO Panel
           ═══════════════════════════════════════════════════════════════ */}
        <div className="w-80 shrink-0 space-y-4">
          {/* Overall Score */}
          <div className={`glass-card p-5 text-center ${seo ? scoreBg(seo.overall) : ""}`}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">SEO Score</div>
            <div className={`mt-2 text-4xl font-black ${seo ? scoreColor(seo.overall) : "text-slate-600"}`}>
              {seo ? seo.overall : "—"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {seo
                ? seo.overall >= 80
                  ? "Excellent — ready to publish!"
                  : seo.overall >= 60
                  ? "Good — a few tweaks will boost ranking"
                  : seo.overall >= 40
                  ? "Fair — follow the tips below"
                  : "Needs work — check each category"
                : "Start writing to see your score"}
            </div>
          </div>

          {/* Toggle */}
          <button
            onClick={() => setSeoOpen(!seoOpen)}
            className="flex w-full items-center justify-between rounded-lg border border-white/[0.06] bg-surface-50 px-4 py-2.5 text-xs font-medium text-slate-400 transition hover:text-white"
          >
            SEO Breakdown
            <svg className={`h-4 w-4 transition ${seoOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {seoOpen && seo && (
            <div className="space-y-3">
              {/* Category Scores */}
              {[
                { label: "Title Tag", score: seo.title.score, tips: seo.title.tips, detail: `${title.length} chars` },
                { label: "Meta Description", score: seo.meta.score, tips: seo.meta.tips, detail: `${meta.length} chars` },
                { label: "Keyword Usage", score: seo.keywords.score, tips: seo.keywords.tips, detail: `${seo.keywords.density}% density` },
                { label: "Readability", score: seo.readability.score, tips: seo.readability.tips, detail: `~${seo.readability.avgSentenceLen} words/sentence` },
                { label: "Content Structure", score: seo.structure.score, tips: seo.structure.tips, detail: `${seo.structure.headingCount} headings` },
                { label: "Content Length", score: seo.length.score, tips: seo.length.tips, detail: `${seo.length.wordCount} words` },
              ].map((cat) => (
                <div key={cat.label} className="glass-card p-3.5">
                  <ScoreBar label={cat.label} score={cat.score} detail={cat.detail} />
                  {cat.tips.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {cat.tips.map((tip, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-slate-500">
                          <svg className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                          </svg>
                          {tip}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Quick Tips */}
          <div className="glass-card p-4">
            <div className="text-[11px] font-bold text-white">Quick SEO Checklist</div>
            <div className="mt-3 space-y-2">
              {[
                { check: title.length >= 30 && title.length <= 60, text: "Title is 30–60 chars" },
                { check: meta.length >= 120 && meta.length <= 160, text: "Meta is 120–160 chars" },
                { check: !!keyword && title.toLowerCase().includes(keyword.toLowerCase()), text: "Keyword in title" },
                { check: (body.match(/^#{1,3}\s/gm) || []).length >= 3, text: "3+ headings (##)" },
                { check: body.split(/\s+/).filter(Boolean).length >= 1000, text: "1000+ words" },
                { check: !!keyword && body.slice(0, 300).toLowerCase().includes(keyword.toLowerCase()), text: "Keyword in first paragraph" },
                { check: /[-*]\s/.test(body), text: "Has bullet lists" },
                { check: /\*\*/.test(body), text: "Uses bold emphasis" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  {item.check ? (
                    <svg className="h-3.5 w-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  )}
                  <span className={item.check ? "text-slate-300" : "text-slate-500"}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
