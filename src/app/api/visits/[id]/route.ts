import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { visitSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { recalculateLeadScore } from "@/lib/scoring";
import { createNotification } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";
import type { LeadStatus, VisitOutcome } from "@prisma/client";

// Visit outcome -> lead status mapping (a small, low-risk slice of the
// fuller Phase 2C "Visit Feedback" workflow, wired in now because it shares
// this exact code path).
const OUTCOME_TO_LEAD_STATUS: Partial<Record<VisitOutcome, LeadStatus>> = {
  READY_FOR_NEGOTIATION: "NEGOTIATION",
  WANTS_ANOTHER_PROPERTY: "QUALIFIED",
  NOT_INTERESTED: "NOT_INTERESTED",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);
    const existing = await prisma.visit.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Visit not found");
    if (session.user.role === "FIELD_EXECUTIVE" && existing.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const body = await req.json();
    const data = visitSchema.partial().parse(body);

    const visit = await prisma.visit.update({
      where: { id },
      data: { ...data, visitDate: data.visitDate ? new Date(data.visitDate) : undefined },
    });

    if (data.status === "COMPLETED" && existing.status !== "COMPLETED") {
      await logActivity({ leadId: existing.leadId, type: "VISIT_COMPLETED", description: `Visit marked completed${data.outcome ? ` - ${data.outcome.replace(/_/g, " ")}` : ""}`, actorId: session.user.id });

      const mappedStatus = data.outcome ? OUTCOME_TO_LEAD_STATUS[data.outcome] : undefined;
      await prisma.lead.update({
        where: { id: existing.leadId },
        data: {
          status: mappedStatus ?? "VISIT_COMPLETED",
          priority: data.outcome === "HIGHLY_INTERESTED" ? "HOT" : undefined,
        },
      });
      await recalculateLeadScore(existing.leadId, "VISIT_COMPLETED");
    } else if (data.status === "RESCHEDULED" && existing.status !== "RESCHEDULED") {
      await logActivity({ leadId: existing.leadId, type: "STATUS_CHANGED", description: "Visit rescheduled", actorId: session.user.id });
      if (existing.assignedToId) {
        await createNotification({
          organizationId: existing.organizationId,
          userId: existing.assignedToId,
          type: "VISIT_RESCHEDULED",
          title: "Visit rescheduled",
          message: "One of your visits has been rescheduled.",
          leadId: existing.leadId,
          visitId: existing.id,
        });
      }
    } else if (data.status === "CANCELLED" && existing.status !== "CANCELLED") {
      await logActivity({ leadId: existing.leadId, type: "STATUS_CHANGED", description: "Visit cancelled", actorId: session.user.id });
      if (existing.assignedToId) {
        await createNotification({
          organizationId: existing.organizationId,
          userId: existing.assignedToId,
          type: "VISIT_CANCELLED",
          title: "Visit cancelled",
          message: "One of your visits has been cancelled.",
          leadId: existing.leadId,
          visitId: existing.id,
        });
      }
    } else if (data.status && data.status !== existing.status) {
      await logActivity({ leadId: existing.leadId, type: "STATUS_CHANGED", description: `Visit status changed to ${data.status.replace(/_/g, " ")}`, actorId: session.user.id });
    }

    return NextResponse.json({ visit });
  } catch (err) {
    return handleApiError(err);
  }
}
