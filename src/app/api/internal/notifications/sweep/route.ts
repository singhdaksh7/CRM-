import { NextRequest, NextResponse } from "next/server";
import { runThrottledSweep } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";
import { withTiming } from "@/lib/perf";
import { logger, newRequestId } from "@/lib/logger";

/**
 * Due/overdue follow-up notification sweep - moved off the (app) layout's
 * blocking render path (see src/lib/notifications.ts). Intended to be
 * called by Vercel Cron (see vercel.json) every 15 minutes; idempotent, so
 * an extra manual or overlapping call never duplicates notifications.
 *
 * Protected via the same Authorization header Vercel Cron sends
 * automatically when CRON_SECRET is set
 * (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs) -
 * not a public mutation. Vercel Cron always triggers via GET, so GET is the
 * handler vercel.json's schedule actually calls; POST is kept as the same
 * protected handler for manual/administrative triggering.
 */
const CRON_LOCK_TTL_SECONDS = 60;

async function handleSweep(req: NextRequest) {
  const requestId = newRequestId();
  const route = "/api/internal/notifications/sweep";

  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    logger.error("sweep_misconfigured", { requestId, route, reason: "CRON_SECRET not set" });
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${expectedSecret}`) {
    logger.warn("sweep_unauthorized", { requestId, route });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withTiming(
      "notificationsSweep",
      route,
      () => runThrottledSweep(getOrganizationId(), CRON_LOCK_TTL_SECONDS),
      requestId
    );
    return NextResponse.json({ ok: true, requestId, ...result });
  } catch (err) {
    logger.error("sweep_failed", { requestId, route, message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Sweep failed", requestId }, { status: 500 });
  }
}

export const GET = handleSweep;
export const POST = handleSweep;
