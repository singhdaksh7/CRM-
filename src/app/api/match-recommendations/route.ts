import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { logActivity } from "@/lib/activity";
import { recordAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const body = await req.json() as { recommendationIds?: string[]; action?: "IGNORE" };
    const ids = [...new Set(body.recommendationIds ?? [])];
    if (body.action !== "IGNORE" || ids.length === 0) throw new ApiError(400, "IGNORE and recommendationIds are required");
    const rows = await prisma.matchRecommendation.findMany({ where: { id: { in: ids }, organizationId, status: "PENDING" }, select: { id: true, leadId: true, propertyId: true } });
    if (rows.length !== ids.length) throw new ApiError(400, "Recommendations must be pending and in this organization");
    const now = new Date();
    await prisma.matchRecommendation.updateMany({ where: { id: { in: ids } }, data: { status: "IGNORED", ignoredAt: now, handledById: session.user.id } });
    for (const row of rows) {
      await logActivity({ leadId: row.leadId, type: "MATCHES_FOUND", description: "New property match ignored", actorId: session.user.id, metadata: { recommendationId: row.id, propertyId: row.propertyId } });
      await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "MatchRecommendation", entityId: row.id, newValues: { status: "IGNORED" } });
    }
    return NextResponse.json({ ignored: rows.length });
  } catch (err) { return handleApiError(err); }
}
