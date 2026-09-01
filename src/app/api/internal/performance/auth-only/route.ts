import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { performanceDiagnosticsEnabled } from "@/lib/performance-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Preview-only temporary diagnostic: proxy auth + one handler auth, no DB work outside Auth.js. */
export async function GET() {
  if (!performanceDiagnosticsEnabled()) return unavailable();
  const started = performance.now();
  try {
    await requireSession(["ADMIN"]);
  } catch {
    return unavailable();
  }
  const authMs = performance.now() - started;
  return NextResponse.json(
    { ok: true },
    { headers: { "Server-Timing": `auth;dur=${authMs.toFixed(1)}` } }
  );
}
