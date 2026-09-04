import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ingestPortalLead } from "@/integrations/property-portals/ingestion";
import { fetchLeadsPage, OlxAuthError, OlxApiError } from "./client";
import { mapOlxLead } from "./adapter";
import { isOlxConfigured, getOlxInitialLookbackHours, getOlxSyncOverlapMinutes, OLX_MAX_DATE_RANGE_DAYS, OLX_MAX_PAGE_SIZE } from "./config";
import { syncSelldoForNewLead } from "@/integrations/selldo/sync";

/**
 * OLX is pull-based. This module owns incremental polling built on
 * PropertyPortalConnection.lastSuccessfulSyncAt as the cursor (per Part C of
 * the task) - stateless across invocations, so a Vercel Cron restart or a
 * cold serverless start never loses the cursor: it always comes back from
 * the DB row, never from memory.
 *
 * ASSUMPTION: the OLX leads-fetch endpoint's startDate/endDate query
 * parameters are formatted as ISO calendar dates (YYYY-MM-DD) - the task
 * gives no format for these two params (only that the lead record's own
 * `date` field is DD/MM/YY). This is the one place to change if the real
 * OLX contract expects a different format.
 */

function formatOlxDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface SyncWindow {
  startDate: Date;
  endDate: Date;
}

/** Chunks [from, to] into <=7-day segments (OLX's documented max date range), oldest first. */
export function computeSyncWindows(from: Date, to: Date): SyncWindow[] {
  const windows: SyncWindow[] = [];
  const maxSpanMs = OLX_MAX_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000;
  let cursor = new Date(from);
  if (cursor >= to) return windows;
  while (cursor < to) {
    const segmentEnd = new Date(Math.min(cursor.getTime() + maxSpanMs, to.getTime()));
    windows.push({ startDate: new Date(cursor), endDate: segmentEnd });
    cursor = segmentEnd;
  }
  return windows;
}

/** First sync (no cursor): bounded lookback. Incremental sync: cursor minus a safety overlap window. */
export function computeSyncStart(lastSuccessfulSyncAt: Date | null, now: Date): Date {
  if (!lastSuccessfulSyncAt) {
    return new Date(now.getTime() - getOlxInitialLookbackHours() * 60 * 60 * 1000);
  }
  return new Date(lastSuccessfulSyncAt.getTime() - getOlxSyncOverlapMinutes() * 60 * 1000);
}

export interface OlxSyncConnectionResult {
  connectionId: string;
  organizationId: string;
  leadsFetched: number;
  leadsRejectedMalformed: number;
  leadsNew: number;
  leadsMatchedExisting: number;
  leadsAmbiguous: number;
  leadsDuplicate: number;
  windowsCompleted: number;
  windowsPlanned: number;
  error: string | null;
}

/**
 * Syncs a single OLX connection. Ingests leads window-by-window, page-by-page,
 * committing each page's leads via ingestPortalLead (which dedupes) BEFORE
 * fetching the next page - so a failure on a later page/window never
 * discards leads already ingested from earlier ones (Part C requirement).
 * The connection's lastSuccessfulSyncAt cursor is advanced only up to the
 * end of the last window that completed fully, so a retry naturally resumes
 * (with the standard overlap) from the true failure point.
 */
export async function syncOlxConnection(connection: { id: string; organizationId: string; lastSuccessfulSyncAt: Date | null }, now: Date = new Date()): Promise<OlxSyncConnectionResult> {
  const result: OlxSyncConnectionResult = {
    connectionId: connection.id,
    organizationId: connection.organizationId,
    leadsFetched: 0,
    leadsRejectedMalformed: 0,
    leadsNew: 0,
    leadsMatchedExisting: 0,
    leadsAmbiguous: 0,
    leadsDuplicate: 0,
    windowsCompleted: 0,
    windowsPlanned: 0,
    error: null,
  };

  const start = computeSyncStart(connection.lastSuccessfulSyncAt, now);
  const windows = computeSyncWindows(start, now);
  result.windowsPlanned = windows.length;
  if (windows.length === 0) {
    await prisma.propertyPortalConnection.update({ where: { id: connection.id }, data: { lastSyncAt: now, status: "CONNECTED" } });
    return result;
  }

  let lastCompletedWindowEnd: Date | null = null;

  try {
    for (const window of windows) {
      let page = 1;
      for (;;) {
        const pageResult = await fetchLeadsPage({ startDate: formatOlxDate(window.startDate), endDate: formatOlxDate(window.endDate), page, pageSize: OLX_MAX_PAGE_SIZE });
        result.leadsFetched += pageResult.leads.length;
        result.leadsRejectedMalformed += pageResult.rejected;

        for (const rawLead of pageResult.leads) {
          try {
            const { canonical, snapshot, needsReview, reviewReasons } = mapOlxLead(rawLead);
            const ingestResult = await ingestPortalLead(connection.organizationId, "OLX", canonical, rawLead, { connectionId: connection.id, snapshot: { ...snapshot, needsReview, reviewReasons } });
            if (ingestResult.status === "NEW") {
              result.leadsNew++;
              // Best-effort, matches ingestion.ts's own autoAssignLead pattern -
              // Sell.Do sync failure must never affect OLX lead ingestion.
              await syncSelldoForNewLead(ingestResult.lead.id, connection.organizationId, connection.id).catch((err) => {
                logger.error("olx_selldo_inline_sync_failed", { leadId: ingestResult.lead.id, message: err instanceof Error ? err.message : String(err) });
              });
            } else if (ingestResult.status === "MATCHED_EXISTING") result.leadsMatchedExisting++;
            else if (ingestResult.status === "AMBIGUOUS") result.leadsAmbiguous++;
            else if (ingestResult.status === "DUPLICATE") result.leadsDuplicate++;
          } catch (err) {
            // One malformed/failing lead must never abort the whole page/window.
            logger.error("olx_lead_ingestion_failed", { connectionId: connection.id, message: err instanceof Error ? err.message : String(err) });
          }
        }

        if (pageResult.isLastPage) break;
        page++;
      }
      lastCompletedWindowEnd = window.endDate;
      result.windowsCompleted++;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message;
    const isAuthFailure = err instanceof OlxAuthError || (err instanceof OlxApiError && err.status === 403);
    await prisma.propertyPortalConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: now,
        lastErrorAt: now,
        lastErrorSummary: message.slice(0, 500),
        status: isAuthFailure ? "AUTH_FAILED" : "DEGRADED",
        // Advance the cursor only as far as fully-completed windows -
        // anything from lastCompletedWindowEnd onward is retried (with
        // overlap) on the next invocation.
        ...(lastCompletedWindowEnd ? { lastSuccessfulSyncAt: lastCompletedWindowEnd } : {}),
      },
    });
    logger.error("olx_sync_connection_failed", { connectionId: connection.id, organizationId: connection.organizationId, message });
    return result;
  }

  await prisma.propertyPortalConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: now, lastSuccessfulSyncAt: now, status: "CONNECTED", lastErrorAt: null, lastErrorSummary: null },
  });
  return result;
}

/**
 * Runs OLX sync for every configured OLX connection across every
 * organization - this is the one legitimate multi-tenant iteration point
 * (a scheduled job, not a per-request context - see the comment on
 * getSystemOrganizationId in src/lib/organization.ts about why a job like
 * this must enumerate connections explicitly rather than assume a single org).
 * organizationId for every downstream write is always connection.organizationId
 * from this DB row - never anything read from the OLX response.
 */
export async function runOlxSync(): Promise<{ configured: boolean; results: OlxSyncConnectionResult[] }> {
  if (!isOlxConfigured()) {
    logger.warn("olx_sync_skipped_not_configured");
    return { configured: false, results: [] };
  }
  const connections = await prisma.propertyPortalConnection.findMany({
    where: { provider: "OLX", status: { not: "PARTNER_ACCESS_REQUIRED" } },
    select: { id: true, organizationId: true, lastSuccessfulSyncAt: true },
  });
  const results: OlxSyncConnectionResult[] = [];
  for (const connection of connections) {
    results.push(await syncOlxConnection(connection));
  }
  return { configured: true, results };
}
