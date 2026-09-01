"use client";

import { useMemo, useState } from "react";

/** TEMPORARY PERFORMANCE DIAGNOSTIC — remove before any production merge. */
type Sample = { duration: number; ttfb: number; timings: Record<string, number> };
type Result = { name: string; samples: Sample[] };
const ENDPOINTS = [
  ["Auth only", "/api/internal/performance/auth-only"],
  ["Auth + SELECT 1 + indexed User lookup", "/api/internal/performance/auth-db"],
] as const;
const ROUTES = ["/dashboard", "/leads", "/properties", "/visits", "/follow-ups"] as const;

function median(values: number[]) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }
function summary(samples: Sample[]) {
  const values = samples.map((sample) => sample.duration);
  return { mean: values.reduce((sum, value) => sum + value, 0) / values.length, median: median(values), min: Math.min(...values), max: Math.max(...values) };
}
function parseServerTiming(value: string | null) {
  const timings: Record<string, number> = {};
  for (const entry of value?.split(",") ?? []) {
    const [name, duration] = entry.trim().split(";dur=");
    const value = Number(duration);
    if (name && Number.isFinite(value)) timings[name] = value;
  }
  return timings;
}
async function sample(url: string): Promise<Sample> {
  const started = performance.now();
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: { "x-perf-diagnostic": "1" } });
  const ttfb = performance.now() - started;
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  await response.arrayBuffer();
  return { duration: performance.now() - started, ttfb, timings: parseServerTiming(response.headers.get("server-timing")) };
}
function format(value: number) { return `${value.toFixed(1)} ms`; }

export function PerformanceDiagnosticClient({ previewDeployment }: { previewDeployment: string }) {
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authOnly = results.find((result) => result.name === "Auth only");
  const authDb = results.find((result) => result.name.startsWith("Auth +"));
  const decomposition = useMemo(() => {
    if (!authOnly || !authDb) return null;
    const auth = summary(authOnly.samples).mean;
    const full = summary(authDb.samples).mean;
    const db = Math.max(0, full - auth);
    return { auth, db, full, authPercent: full ? (auth / full) * 100 : 0 };
  }, [authOnly, authDb]);

  async function run() {
    setRunning(true); setError(null); setResults([]);
    try {
      const next: Result[] = [];
      for (const [name, url] of ENDPOINTS) next.push({ name, samples: await Promise.all(Array.from({ length: 10 }, () => sample(url))) });
      for (const route of ROUTES) next.push({ name: `${route} route request`, samples: await Promise.all(Array.from({ length: 3 }, () => sample(route))) });
      setResults(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Diagnostic request failed"); }
    finally { setRunning(false); }
  }

  async function copyReport() {
    const find = (name: string) => results.find((result) => result.name === name);
    const line = (name: string) => { const result = find(name); return result ? `${name}: ${format(summary(result.samples).mean)}` : `${name}: not measured`; };
    const authTiming = authOnly?.samples.map((sample) => sample.timings.auth ?? 0).filter(Boolean) ?? [];
    const report = [
      "# KP CRM Auth Performance Diagnostic", "", `Preview deployment: ${previewDeployment}`, `Timestamp: ${new Date().toISOString()}`, "",
      "## Auth", "Auth calls: diagnostic endpoints include proxy + handler authentication; Dashboard model: proxy + layout + page = 3", "JWT callbacks: one per auth() invocation (measured model)", "User lookups: one indexed lookup per JWT callback (measured model)", `Mean auth time: ${authTiming.length ? format(authTiming.reduce((a, b) => a + b, 0) / authTiming.length) : "not measured"}`, "Mean JWT DB lookup: captured in server logs only for this temporary build", `Cumulative auth contribution: ${decomposition ? `${decomposition.authPercent.toFixed(1)}% of auth+DB diagnostic` : "not measured"}`, "",
      "## Database", `SELECT 1: ${authDb ? format(authDb.samples.reduce((sum, sample) => sum + (sample.timings["db-first"] ?? 0), 0) / authDb.samples.length) : "not measured"}`, `Indexed User lookup: ${authDb ? format(authDb.samples.reduce((sum, sample) => sum + (sample.timings["db-user"] ?? 0), 0) / authDb.samples.length) : "not measured"}`, "",
      "## Routes", ...ROUTES.map((route) => line(`${route} route request`)), "", "## Navigation", "Dashboard -> Leads: compare the authenticated route-request means above; this tool avoids state-changing navigation.", "Leads -> Properties: compare the authenticated route-request means above.", "Properties -> Visits: compare the authenticated route-request means above.", "Visits -> Follow-ups: compare the authenticated route-request means above.", "", "## Root Cause Evidence", `Auth contribution: ${decomposition ? `${decomposition.authPercent.toFixed(1)}%` : "not measured"}`, `DB contribution: ${decomposition ? `${((decomposition.db / decomposition.full) * 100).toFixed(1)}% incremental over auth-only` : "not measured"}`, "Application/render contribution: route-request mean minus diagnostic endpoint mean; inspect route rows above.", `DOMINANT BOTTLENECK: ${decomposition ? (decomposition.authPercent >= 50 ? "Auth is a material contributor in the controlled diagnostic; route data is required before calling it dominant." : "Not established by the controlled diagnostic.") : "Not measured"}`, "CONFIDENCE: Preliminary — browser-side authenticated measurements, with read-only requests only.",
    ].join("\n");
    await navigator.clipboard.writeText(report);
  }

  return <section className="mx-auto max-w-6xl space-y-6">
    <div className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 text-amber-950"><p className="font-bold">PREVIEW DIAGNOSTIC — NEVER PRODUCTION</p><p className="mt-1 text-sm">Temporary, authenticated ADMIN-only, read-only browser measurements. It does not run automatically.</p></div>
    <div><h1 className="text-2xl font-bold">Performance Diagnosis</h1><p className="mt-1 text-sm text-[#596579]">Runs 10 warm samples for diagnostic endpoints and 3 authenticated document-request samples per route.</p></div>
    <div className="flex gap-3"><button onClick={run} disabled={running} className="rounded-xl bg-[#3366FF] px-4 py-2 font-semibold text-white disabled:opacity-60">{running ? "Running diagnosis…" : "Run Performance Diagnosis"}</button><button onClick={copyReport} disabled={!results.length || running} className="rounded-xl border border-[#E7ECF2] bg-white px-4 py-2 font-semibold disabled:opacity-60">Copy Diagnostic Report</button></div>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!!results.length && <><div className="overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white"><table className="w-full text-left text-sm"><thead className="bg-[#F3F6FA] text-[#596579]"><tr><th className="p-3">Test</th><th>Samples</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th></tr></thead><tbody>{results.map((result) => { const s = summary(result.samples); return <tr key={result.name} className="border-t border-[#E7ECF2]"><td className="p-3 font-medium">{result.name}</td><td>{result.samples.length}</td><td>{format(s.mean)}</td><td>{format(s.median)}</td><td>{format(s.min)}</td><td>{format(s.max)}</td></tr>; })}</tbody></table></div>
    {decomposition && <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 text-sm"><h2 className="font-bold">Decomposition</h2><p className="mt-2">No-auth baseline: not measured (intentionally unavailable to avoid an unauthenticated diagnostic surface).</p><p>Auth overhead: {format(decomposition.auth)}</p><p>DB overhead: {format(decomposition.db)}</p><p>Dashboard/application overhead: compare Dashboard route request with controlled endpoint results.</p><p className="mt-3 font-bold">AUTH BOTTLENECK CONTRIBUTION: {decomposition.authPercent.toFixed(1)}%</p></div>}</>}
  </section>;
}
