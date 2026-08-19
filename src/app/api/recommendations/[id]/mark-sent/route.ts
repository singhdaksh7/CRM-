import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";

// POST /api/recommendations/[id]/mark-sent - the ONLY way a recommendation
// ever reaches SENT. Called exclusively by an explicit user action after
// they open the click-to-chat link (or, for a Meta-configured provider, the
// real send call would set this) - never by property create/update, a
// recompute, or any background job (rule 26 ZERO AUTO-SEND). Also stamps
// CustomerContact.lastContactedAt/lastPropertySentAt for the frequency-
// safety gate (rule 21/22).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user.id);
    const { id } = await params;
    const recommendation = await prisma.propertyRecommendation.findFirst({ where: { id, organizationId } });
    if (!recommendation) throw new ApiError(404, "Recommendation not found");
    if (recommendation.status !== "PREPARED") throw new ApiError(409, "A recommendation must be prepared before it can be marked sent");

    const now = new Date();
    const [updated] = await prisma.$transaction([
      prisma.propertyRecommendation.update({ where: { id }, data: { status: "SENT", sentAt: now } }),
      ...(recommendation.customerContactId
        ? [prisma.customerContact.update({ where: { id: recommendation.customerContactId }, data: { lastContactedAt: now, lastPropertySentAt: now } })]
        : []),
      ...(recommendation.leadId ? [prisma.lead.update({ where: { id: recommendation.leadId }, data: { lastContactedAt: now } })] : []),
    ]);

    await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "PropertyRecommendation", entityId: id, newValues: { status: "SENT" } });
    return NextResponse.json({ recommendation: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
