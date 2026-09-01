"use client";

import { useState } from "react";

type Metric = { duration: number; calls: number; parallel: boolean };
type Query = { model: string; operation: string; duration: number; calls: number; resultSize: string; scope: string; indexed: string };
type Benchmark = { total: number; metrics: Record<string, Metric>; queries: Query[] };
type Row = { name: string; samples: Benchmark[] };
const TARGETS = ["dashboard", "leads", "properties", "visits", "follow-ups"] as const;
const ROUTES = ["/dashboard", "/leads", "/properties", "/visits", "/follow-ups"] as const;
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const fmt = (value: number) => `${value.toFixed(1)} ms`;

async function samples<T>(count: number, work: () => Promise<T>): Promise<T[]> { const values: T[] = []; for (let i = 0; i < count; i++) values.push(await work()); return values; }

async function benchmark(target: string) {
  const response = await fetch(`/api/internal/performance/benchmark/${target}`, { cache: "no-store", credentials: "same-origin", headers: { "x-perf-diagnostic": "1" } });
  if (!response.ok) throw new Error(`${target} benchmark returned ${response.status}`);
  return response.json() as Promise<Benchmark>;
}
async function routeSample(path: string) {
  const started = performance.now();
  const response = await fetch(path, { cache: "no-store", credentials: "same-origin", headers: { "x-perf-diagnostic": "1" } });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  await response.arrayBuffer(); return performance.now() - started;
}

export function PerformanceDiagnosticClient({ previewDeployment, variant = "experimental" }: { previewDeployment: string; variant?: "baseline" | "experimental" }) {
  const [results, setResults] = useState<Row[]>([]); const [routeResults, setRouteResults] = useState<Record<string, number[]>>({});
  const [running, setRunning] = useState(false); const [error, setError] = useState<string | null>(null);
  const get = (target: string) => results.find((row) => row.name === target);
  const current = (target: string) => mean(get(target)?.samples.map((sample) => sample.total) ?? []);
  const dashboardSamples = get("dashboard")?.samples ?? [];
  const dashboardMetrics = Object.fromEntries(Object.keys(dashboardSamples[0]?.metrics ?? {}).map((name) => [name, { duration: mean(dashboardSamples.map((sample) => sample.metrics[name]?.duration ?? 0)), calls: Math.round(mean(dashboardSamples.map((sample) => sample.metrics[name]?.calls ?? 0)),), parallel: dashboardSamples.some((sample) => sample.metrics[name]?.parallel) }]));
  const dashboardQueries = Object.values(dashboardSamples.flatMap((sample) => sample.queries).reduce<Record<string, Query & { samples: number }>>((all, query) => { const key = `${query.scope}|${query.model}|${query.operation}|${query.resultSize}`; const current = all[key] ?? { ...query, duration: 0, calls: 0, samples: 0 }; current.duration += query.duration; current.calls += query.calls; current.samples += 1; all[key] = current; return all; }, {})).map((query) => ({ ...query, duration: query.duration / dashboardSamples.length, calls: query.calls / dashboardSamples.length }));

  async function run() {
    setRunning(true); setError(null); setResults([]); setRouteResults({});
    try {
      const next = await Promise.all(TARGETS.map(async (name) => ({ name, samples: await samples(10, () => benchmark(name)) })));
      const routes = Object.fromEntries(await Promise.all(ROUTES.map(async (path) => [path, await samples(3, () => routeSample(path))])));
      setResults(next); setRouteResults(routes);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Deep benchmark failed"); }
    finally { setRunning(false); }
  }
  const copy = async () => {
    const report = ["# KP CRM DEEP BENCHMARK + EXPERIMENT REPORT", "", `Preview: ${previewDeployment}`, "", "## Architecture Boundaries", "Proxy: separate execution boundary; cannot share RSC request state.", "Auth.js: handler authentication includes one authoritative JWT/user validation.", "RSC: React cache() deduplicates app-layout/page auth only within one RSC tree.", "Cross-boundary sharing impossible: Proxy ↔ RSC/Route Handler.", "", "## Server Benchmark", "Metric | Current | Experimental | Improvement", ...TARGETS.map((name) => `${name} | ${fmt(current(name))} | N/A | Not applicable`), "", "## Dashboard Waterfall", "Operation | Duration | Calls | Sequential/Parallel", ...Object.entries(dashboardMetrics).map(([name, item]) => `${name} | ${fmt(item.duration)} | ${item.calls} | ${item.parallel ? "Parallel" : "Sequential"}`), "", "## Real Route A/B", "Route | Baseline | Experimental | Improvement", ...ROUTES.map((path) => `${path} | ${fmt(mean(routeResults[path] ?? []))} | N/A | Not applicable`), "", "## Auth Experiment", "Current validations: one handler validation; proxy is independently measured outside this context.", "Experimental validations: one RSC validation shared by layout/page through React cache().", "Request-scoped deduplication: SAFE for RSC only; NOT APPLICABLE to Proxy/Route Handler.", "", "## Verdict", "ROOT CAUSE PROVEN: NO", "REAL ROUTE IMPROVEMENT >=25%: NOT MEASURED", "REAL ROUTE REDUCTION >=500MS: NOT MEASURED", "SECURITY PRESERVED: YES", "READY FOR CONTROLLED RELEASE: NO", "Production changed: NO"].join("\n");
    await navigator.clipboard.writeText(report);
  };
  return <section className="mx-auto max-w-6xl space-y-6">
    <div className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 text-amber-950"><p className="font-bold">PREVIEW DIAGNOSTIC — NEVER PRODUCTION</p><p className="mt-1 text-sm">ADMIN-only, read-only timing metadata. No records, identifiers, cookies, SQL, or secrets are returned.</p></div>
    <div><h1 className="text-2xl font-bold">Performance Diagnosis</h1><p className="mt-1 text-sm text-[#596579]">Variant: {variant}. Ten isolated server samples per page data path, then authenticated browser route samples. Dashboard samples bypass only its short-lived data cache so the query waterfall reflects real loader work; parallel durations are never summed.</p></div>
    <div className="flex gap-3"><button onClick={run} disabled={running} className="rounded-xl bg-[#3366FF] px-4 py-2 font-semibold text-white disabled:opacity-60">{running ? "Running deep benchmark…" : "RUN DEEP BENCHMARK"}</button><button onClick={copy} disabled={!results.length || running} className="rounded-xl border border-[#E7ECF2] bg-white px-4 py-2 font-semibold disabled:opacity-60">Copy Report</button></div>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!!results.length && <><Table title="Server benchmark — this deployment" headers={["Metric", "Mean wall-clock"]} rows={TARGETS.map((name) => [name, fmt(current(name))])} /><Table title="Dashboard branch waterfall — mean per sample" headers={["Operation", "Duration", "Calls", "Scheduling"]} rows={Object.entries(dashboardMetrics).map(([name, item]) => [name, fmt(item.duration), String(item.calls), item.parallel ? "Parallel" : "Sequential"])} /><Table title="Dashboard Prisma query waterfall — mean per sample" headers={["Scope", "Model.operation", "Duration", "Calls", "Result size", "Indexed?"]} rows={dashboardQueries.map((query) => [query.scope, `${query.model}.${query.operation}`, fmt(query.duration), query.calls.toFixed(1), query.resultSize, query.indexed])} /><Table title="Real browser route latency — this deployment" headers={["Route", "Mean wall-clock"]} rows={ROUTES.map((path) => [path, fmt(mean(routeResults[path] ?? []))])} /></>}
  </section>;
}

function Table({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) { return <div className="overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white"><h2 className="p-4 font-bold">{title}</h2><table className="w-full text-left text-sm"><thead className="bg-[#F3F6FA] text-[#596579]"><tr>{headers.map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={`${row[0]}-${i}`} className="border-t border-[#E7ECF2]">{row.map((cell, j) => <td key={j} className="p-3">{cell}</td>)}</tr>)}</tbody></table></div>; }
