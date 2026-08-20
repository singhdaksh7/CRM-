import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { customerResponseSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";

// POST /api/recommendations/[id]/respond - record the customer's outcome
// (rule 46). Never auto-alters the CustomerRequirement - only a staff
// action does that (rule 46 "do not automatically alter requirement unless
// staff confirms"). DO_NOT_CONTACT is honored immediately on the contact.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const { id } = await params;
    const recommendation = await prisma.propertyRecommendation.findFirst({ where: { id, organizationId } });
    if (!recommendation) throw new ApiError(404, "Recommendation not found");

    const { outcome } = customerResponseSchema.parse(await req.json());
    const updated = await prisma.propertyRecommendation.update({
      where: { id },
      data: { status: "RESPONDED", responseOutcome: outcome, respondedAt: new Date(), respondedById: session.user.id },
    });

    if (outcome === "DO_NOT_CONTACT" && recommendation.customerContactId) {
      await prisma.customerContact.update({ where: { id: recommendation.customerContactId }, data: { doNotContact: true } });
    }

    await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "PropertyRecommendation", entityId: id, newValues: { responseOutcome: outcome } });
    return NextResponse.json({ recommendation: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
