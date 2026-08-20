import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { visitSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { recalculateLeadScore } from "@/lib/scoring";
import { createNotification } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";
import { checkVisitConflict } from "@/lib/visit-conflict";
import { recordAudit } from "@/lib/audit";
import { runAutomationRules } from "@/lib/automation-rules";
import { appendPropertyTimelineEvent } from "@/lib/property-timeline";
import type { LeadStatus, VisitOutcome } from "@prisma/client";

// Visit outcome -> lead status mapping (a small, low-risk slice of the
// fuller Phase 2C "Visit Feedback" workflow, wired in now because it shares
// this exact code path).
const OUTCOME_TO_LEAD_STATUS: Partial<Record<VisitOutcome, LeadStatus>> = {
  READY_FOR_NEGOTIATION: "NEGOTIATION",
  WANTS_ANOTHER_PROPERTY: "QUALIFIED",
  NOT_INTERESTED: "NOT_INTERESTED",
  // Phase 4 - Field Operations
  SHORTLISTED: "QUALIFIED",
  REJECTED: "NOT_INTERESTED",
  NEGOTIATION_IN_PROGRESS: "NEGOTIATION",
  // CUSTOMER_NO_SHOW / OWNER_NO_SHOW / FOLLOW_UP_NEEDED intentionally
  // unmapped - they fall through to the existing "VISIT_COMPLETED" default
  // below, same as any other outcome not in this table.
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
    const { overrideConflict, overrideReason, ...data } = visitSchema.partial().parse(body);

    // data.leadId/data.propertyId are client-suppliable via visitSchema -
    // without this check a caller could re-point a Visit it owns at another
    // organization's lead/property just by submitting that id.
    if (data.leadId) {
      const lead = await prisma.lead.findFirst({ where: { id: data.leadId, organizationId }, select: { id: true } });
      if (!lead) throw new ApiError(404, "Lead not found");
    }
    if (data.propertyId) {
      const prop = await prisma.property.findFirst({ where: { id: data.propertyId, organizationId }, select: { id: true } });
      if (!prop) throw new ApiError(404, "Property not found");
    }

    const reschedule = data.visitDate !== undefined || data.visitTime !== undefined || data.assignedToId !== undefined || data.propertyId !== undefined;
    let conflictData: Record<string, unknown> = {};

    if (reschedule) {
      const nextEmployeeId = data.assignedToId !== undefined ? data.assignedToId : existing.assignedToId;
      const nextVisitDate = data.visitDate ? new Date(data.visitDate) : existing.visitDate;
      const nextVisitTime = data.visitTime ?? existing.visitTime;
      const nextPropertyId = data.propertyId ?? existing.propertyId;

      if (nextEmployeeId) {
        const conflict = await checkVisitConflict({
          visitId: existing.id,
          employeeId: nextEmployeeId,
          organizationId,
          visitDate: nextVisitDate,
          visitTime: nextVisitTime,
          propertyId: nextPropertyId,
        });

        if (conflict.status === "WARNING" && !overrideConflict) {
          await recordAudit({ userId: session.user.id, action: "OTHER", entityType: "Visit", entityId: existing.id, newValues: { event: "visit_conflict_detected", detail: conflict.detail } });
          return NextResponse.json({ conflict, requiresOverride: true }, { status: 409 });
        }
        if (conflict.status === "WARNING" && overrideConflict) {
          if (session.user.role === "FIELD_EXECUTIVE") throw new ApiError(403, "Only an Admin or Data Manager can override a scheduling conflict");
          if (!overrideReason) throw new ApiError(400, "overrideReason is required to proceed despite a detected conflict");
          await recordAudit({ userId: session.user.id, action: "OTHER", entityType: "Visit", entityId: existing.id, newValues: { event: "visit_conflict_overridden", reason: overrideReason, detail: conflict.detail } });
        }

        conflictData = {
          travelDurationMinutes: conflict.travelDurationMinutes,
          travelDistanceMeters: conflict.travelDistanceMeters,
          routeCheckedAt: conflict.routeSource !== "NONE" ? new Date() : null,
          routeSource: conflict.routeSource,
          conflictStatus: conflict.status === "WARNING" ? "OVERRIDDEN" : "NONE",
          conflictDetail: conflict.detail,
          conflictOverrideReason: conflict.status === "WARNING" ? overrideReason : null,
          conflictOverrideByUserId: conflict.status === "WARNING" ? session.user.id : null,
          conflictOverrideAt: conflict.status === "WARNING" ? new Date() : null,
        };
      }
    }

    const visit = await prisma.visit.update({
      where: { id },
      data: { ...data, visitDate: data.visitDate ? new Date(data.visitDate) : undefined, ...conflictData },
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
      await runAutomationRules({ trigger: "VISIT_COMPLETED", visitId: existing.id, leadId: existing.leadId, organizationId });

      // Phase 4, Objective 6 - every visit outcome updates Timeline, Lead,
      // Property, Analytics, and Audit Log. Lead/Analytics already covered
      // above (lead.status update + recalculateLeadScore feeds Lead Health).
      if (data.outcome) {
        await logActivity({ leadId: existing.leadId, type: "VISIT_OUTCOME_RECORDED", description: `Visit outcome recorded: ${data.outcome.replace(/_/g, " ")}`, actorId: session.user.id });
        await recordAudit({
          userId: session.user.id,
          action: "OTHER",
          entityType: "Visit",
          entityId: existing.id,
          newValues: { event: "visit_outcome_recorded", outcome: data.outcome },
        });
        await appendPropertyTimelineEvent({
          organizationId,
          propertyId: existing.propertyId,
          eventType: "VISIT_COMPLETED",
          toValue: data.outcome,
          actorId: session.user.id,
        });
      }
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
