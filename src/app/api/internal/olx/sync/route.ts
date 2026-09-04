import { NextRequest, NextResponse } from "next/server";
import { runOlxSync } from "@/integrations/olx/sync";
import { retryFailedSelldoOperations } from "@/integrations/selldo/sync";
import { logger, newRequestId } from "@/lib/logger";

/**
 * OLX incremental lead sync - pull-based, so (unlike Housing's inbound
 * webhook) this app must call out on a schedule. Wired into vercel.json's
 * `crons` array every 30 minutes, protected by the same Authorization
 * header pattern as the existing notification sweep (CRON_SECRET). Also
 * runs the Sell.Do retry sweep in the same invocation (both are small,
 * infrequent jobs) rather than requesting a second Vercel Cron slot.
 */
async function handleSync(req: NextRequest) {
  const requestId = newRequestId();
  const route = "/api/internal/olx/sync";

  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    logger.error("olx_sync_misconfigured", { requestId, route, reason: "CRON_SECRET not set" });
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${expectedSecret}`) {
    logger.warn("olx_sync_unauthorized", { requestId, route });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const olx = await runOlxSync();
    const selldo = await retryFailedSelldoOperations();
    return NextResponse.json({ ok: true, requestId, olx, selldo });
  } catch (err) {
    logger.error("olx_sync_failed", { requestId, route, message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Sync failed", requestId }, { status: 500 });
  }
}

export const GET = handleSync;
export const POST = handleSync;
