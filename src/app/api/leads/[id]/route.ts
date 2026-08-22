import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { leadSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { enumToLabel } from "@/lib/utils";
import { recalculateLeadScore } from "@/lib/scoring";
import { runMatchingForLead } from "@/lib/lead-matching";
import { notifyRoles } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";
import { logger } from "@/lib/logger";
import { assignedToSelect } from "@/lib/user-select";
import { isLeadAccessibleToUser } from "@/lib/lead-access";

const REQUIREMENT_FIELDS = ["preferredLocation", "minBudget", "maxBudget", "preferredBhk", "requirementType", "moveInDate"] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const lead = await prisma.lead.findFirst({
      where: { id, organizationId },
      include: {
        assignedTo: { select: assignedToSelect },
        activities: { orderBy: { createdAt: "desc" }, include: { actor: { select: assignedToSelect } } },
        followUps: { orderBy: { dueDate: "asc" }, include: { owner: { select: assignedToSelect } } },
        visits: { orderBy: { visitDate: "desc" }, include: { property: true, assignedTo: { select: assignedToSelect } } },
        sharedProperties: { orderBy: { createdAt: "desc" } },
      } as never,
    });
    if (!lead) throw new ApiError(404, "Lead not found");
    // simplified-role-workflow (targeted fix pass, Blocker B) - was the same
    // stale check as the lead detail page (no unassigned-lead carve-out),
    // now shares isLeadAccessibleToUser instead of a second copy of the rule.
    if (!isLeadAccessibleToUser(lead, session.user)) {
      throw new ApiError(403, "Forbidden");
    }
    return NextResponse.json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Lead not found");
    if (session.user.role === "FIELD_EXECUTIVE" && existing.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const body = await req.json();
    const data = leadSchema.partial().parse(body);

    const requirementChanged = REQUIREMENT_FIELDS.some((field) => {
      if (!(field in data)) return false;
      if (field === "moveInDate") {
        const newVal = data.moveInDate ? new Date(data.moveInDate).getTime() : null;
        const oldVal = existing.moveInDate ? existing.moveInDate.getTime() : null;
        return newVal !== oldVal;
      }
      return data[field] !== existing[field];
    });

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        ...data,
        email: data.email || undefined,
        moveInDate: data.moveInDate ? new Date(data.moveInDate) : undefined,
      } as never,
    });

    if (data.status && data.status !== existing.status) {
      await logActivity({
        leadId: id,
        type: "STATUS_CHANGED",
        description: `Status changed from ${enumToLabel(existing.status)} to ${enumToLabel(data.status)}`,
        actorId: session.user.id,
      });
    }
    if (data.notes && data.notes !== existing.notes) {
      await logActivity({ leadId: id, type: "NOTE_ADDED", description: "Notes updated", actorId: session.user.id });
    }
    if (data.status === "CLOSED_WON" && existing.status !== "CLOSED_WON") {
      await logActivity({ leadId: id, type: "DEAL_CLOSED", description: `Deal closed won by ${session.user.name}`, actorId: session.user.id });
      await notifyRoles(["ADMIN"], {
        organizationId: existing.organizationId,
        type: "DEAL_WON",
        title: "Deal closed won",
        message: `${lead.clientName} (${lead.leadCode}) marked Closed Won.`,
        leadId: id,
      });
    }

    // Recalculate score on every edit (per spec). If the caller explicitly set a
    // priority in this same request, that manual override wins over the score's
    // derived priority - scoring still records the up-to-date score/explanation.
    await recalculateLeadScore(id, data.status && data.status !== existing.status ? "STATUS_CHANGED" : "LEAD_UPDATED");
    if (data.priority) {
      await prisma.lead.update({ where: { id }, data: { priority: data.priority } });
    }

    if (requirementChanged) {
      try {
        await runMatchingForLead(id, "updated");
      } catch (err) {
        logger.error("lead_matching_failed", { leadId: id, message: err instanceof Error ? err.message : String(err) });
      }
    }

    const finalLead = await prisma.lead.findUnique({ where: { id }, include: { assignedTo: { select: assignedToSelect } } });
    return NextResponse.json({ lead: finalLead });
  } catch (err) {
    return handleApiError(err);
  }
}
