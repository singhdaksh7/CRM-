import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { cleanupExpiredUploadSessions, cleanupSoftDeletedPropertyObjects } from "@/lib/storage-orphan-cleanup";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

/** Admin-only bounded orphan cleanup. Never deletes arbitrary client-supplied keys. */
export async function POST() {
  try {
    const session = await requireSession(["ADMIN"]);
    const limitResult = await checkRateLimit("document", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const organizationId = getOrganizationId(session.user.id);
    const sessions = await cleanupExpiredUploadSessions(50);
    const softDeleted = await cleanupSoftDeletedPropertyObjects({ organizationId, limit: 25 });

    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "Storage",
      newValues: { event: "orphan_cleanup", sessions, softDeleted },
    });

    return NextResponse.json({ sessions, softDeleted });
  } catch (err) {
    return handleApiError(err);
  }
}
