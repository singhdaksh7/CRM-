import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { visitFeedbackSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { logActivity } from "@/lib/activity";
import { recordAudit } from "@/lib/audit";

/** Objective 11 - structured visit feedback, upserted since Visit has at most one. Feeds Lead Health and Property Health (see rules/lead-health.ts and rules/property-health.ts). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id: visitId } = await params;
    const organizationId = getOrganizationId(session.user);

    const visit = await prisma.visit.findFirst({ where: { id: visitId, organizationId } });
    if (!visit) throw new ApiError(404, "Visit not found");
    if (session.user.role === "FIELD_EXECUTIVE" && visit.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const data = visitFeedbackSchema.parse(await req.json());

    const feedback = await prisma.visitFeedback.upsert({
      where: { visitId },
      create: {
        organizationId,
        visitId,
        customerLiked: JSON.stringify(data.customerLiked),
        customerDisliked: JSON.stringify(data.customerDisliked),
        budgetIssue: data.budgetIssue,
        areaIssue: data.areaIssue,
        parkingIssue: data.parkingIssue,
        familyRejected: data.familyRejected,
        ownerRejected: data.ownerRejected,
        willVisitAgain: data.willVisitAgain,
        negotiationRequired: data.negotiationRequired,
        additionalNotes: data.additionalNotes,
        rating: data.rating ?? null,
        submittedById: session.user.id,
      },
      update: {
        customerLiked: JSON.stringify(data.customerLiked),
        customerDisliked: JSON.stringify(data.customerDisliked),
        budgetIssue: data.budgetIssue,
        areaIssue: data.areaIssue,
        parkingIssue: data.parkingIssue,
        familyRejected: data.familyRejected,
        ownerRejected: data.ownerRejected,
        willVisitAgain: data.willVisitAgain,
        negotiationRequired: data.negotiationRequired,
        additionalNotes: data.additionalNotes,
        rating: data.rating ?? null,
      },
    });

    await logActivity({
      leadId: visit.leadId,
      type: "VISIT_FEEDBACK_SUBMITTED",
      description: "Visit feedback submitted",
      actorId: session.user.id,
    });
    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "VisitFeedback",
      entityId: feedback.id,
      newValues: { event: "visit_feedback_submitted", visitId },
    });

    return NextResponse.json({ feedback });
  } catch (err) {
    return handleApiError(err);
  }
}
