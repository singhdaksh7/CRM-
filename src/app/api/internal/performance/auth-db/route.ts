import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { performanceDiagnosticsEnabled } from "@/lib/performance-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Preview-only temporary diagnostic: authenticated, then two harmless DB round trips. */
export async function GET() {
  if (!performanceDiagnosticsEnabled()) return unavailable();

  const authStarted = performance.now();
  let session;
  try {
    session = await requireSession(["ADMIN"]);
  } catch {
    return unavailable();
  }
  const authMs = performance.now() - authStarted;

  const firstStarted = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  const firstDbMs = performance.now() - firstStarted;

  const userStarted = performance.now();
  await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  const userDbMs = performance.now() - userStarted;

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Server-Timing": `auth;dur=${authMs.toFixed(1)}, db-first;dur=${firstDbMs.toFixed(1)}, db-user;dur=${userDbMs.toFixed(1)}`,
      },
    }
  );
}
