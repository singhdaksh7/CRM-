import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { runOlxSync } from "@/integrations/olx/sync";

/**
 * Admin-triggered "Sync Now" for the OLX connection - runs the exact same
 * sync logic as the Vercel Cron job (src/integrations/olx/sync.ts), just
 * invoked on demand. ADMIN-only, rate-limited per admin to prevent
 * repeated-click abuse (see src/lib/rate-limit.ts's `olxManualSync` rule,
 * the same pattern used by the Housing webhook route).
 */
export async function POST() {
  try {
    const session = await requireSession(["ADMIN"]);
    const organizationId = getOrganizationId(session.user);

    const rate = await checkRateLimit("olxManualSync", session.user.id);
    if (!rate.allowed) return rateLimitResponse(rate);

    const result = await runOlxSync();
    const orgResults = result.results.filter((r) => r.organizationId === organizationId);

    await recordAudit({
      userId: session.user.id,
      organizationId,
      action: "UPDATE",
      entityType: "PropertyPortalConnection",
      entityId: null,
      newValues: { event: "OLX_MANUAL_SYNC_TRIGGERED", configured: result.configured, connectionsSynced: orgResults.length },
    });

    return NextResponse.json({ configured: result.configured, results: orgResults });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Read-only status for the admin UI - never exposes credentialReference/config. */
export async function GET() {
  try {
    const session = await requireSession(["ADMIN"]);
    const organizationId = getOrganizationId(session.user);
    const connection = await prisma.propertyPortalConnection.findFirst({
      where: { organizationId, provider: "OLX" },
      select: { status: true, lastSyncAt: true, lastSuccessfulSyncAt: true, lastErrorAt: true, lastErrorSummary: true },
    });
    const [leadCount, selldoPending, selldoRetryable, selldoDeadLetter, selldoSucceeded] = await Promise.all([
      prisma.externalLeadEvent.count({ where: { organizationId, provider: "OLX" } }),
      prisma.portalOperation.count({ where: { organizationId, operationType: "SELLDO_LEAD_SYNC", status: "PENDING" } }),
      prisma.portalOperation.count({ where: { organizationId, operationType: "SELLDO_LEAD_SYNC", status: "RETRYABLE" } }),
      prisma.portalOperation.count({ where: { organizationId, operationType: "SELLDO_LEAD_SYNC", status: "DEAD_LETTER" } }),
      prisma.portalOperation.count({ where: { organizationId, operationType: "SELLDO_LEAD_SYNC", status: "SUCCEEDED" } }),
    ]);
    return NextResponse.json({
      connection,
      olxLeadEventCount: leadCount,
      selldo: { pending: selldoPending, retryable: selldoRetryable, deadLetter: selldoDeadLetter, succeeded: selldoSucceeded },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
