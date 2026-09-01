import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { performanceDiagnosticsEnabled } from "@/lib/performance-diagnostics";
import { collectPerformanceMetrics, measurePerformanceMetric } from "@/lib/performance-diagnostic-context";
import { benchmarkDashboard, benchmarkFollowUps, benchmarkLeads, benchmarkProperties, benchmarkVisits } from "@/lib/performance-benchmarks";
import { isSyntheticPerformanceAdmin } from "@/lib/preview-performance-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
function rounded(value: number) { return Math.round(value * 10) / 10; }

export async function GET(_request: NextRequest, context: { params: Promise<{ target: string }> }) {
  if (!performanceDiagnosticsEnabled()) return notFound();
  const { target } = await context.params;
  if (!["dashboard", "leads", "properties", "visits", "follow-ups"].includes(target)) return notFound();
  try {
    const started = performance.now();
    const collected = await collectPerformanceMetrics(async () => {
      const session = await measurePerformanceMetric("auth", () => requireSession(["ADMIN"]));
      if (!isSyntheticPerformanceAdmin(session.user)) throw new Error("Synthetic diagnostic account required");
      const organizationId = await measurePerformanceMetric("organization", async () => getOrganizationId(session.user));
      await measurePerformanceMetric("pageDataLoader", async () => {
        if (target === "dashboard") return benchmarkDashboard({ role: session.user.role, userId: session.user.id, organizationId });
        if (target === "leads") return benchmarkLeads(organizationId);
        if (target === "properties") return benchmarkProperties(organizationId);
        if (target === "visits") return benchmarkVisits(organizationId);
        return benchmarkFollowUps(organizationId);
      });
    });
    const metrics = Object.fromEntries(Object.entries(collected.metrics).map(([name, metric]) => [name, { duration: rounded(metric.duration), calls: metric.calls, parallel: metric.parallel }]));
    const total = rounded(performance.now() - started);
    const timing = Object.entries(metrics).map(([name, value]) => `${name};dur=${value.duration}`).concat(`total;dur=${total}`).join(", ");
    return NextResponse.json({ total, metrics, experiment: "current-only", note: "Route-handler benchmark. Proxy and RSC request scopes are separate and are not combined." }, { headers: { "Server-Timing": timing, "Cache-Control": "no-store" } });
  } catch {
    return notFound();
  }
}
