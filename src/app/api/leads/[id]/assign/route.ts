import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { createNotification } from "@/lib/notifications";
import { assignedToSelect } from "@/lib/user-select";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const { assignedToId } = await req.json();
    if (!assignedToId) throw new ApiError(400, "assignedToId is required");
    const organizationId = getOrganizationId(session.user);

    const employee = await prisma.user.findFirst({ where: { id: assignedToId, organizationId, role: "FIELD_EXECUTIVE" } });
    if (!employee) throw new ApiError(404, "Employee not found");
    const existingLead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!existingLead) throw new ApiError(404, "Lead not found");

    const reason = `Manually assigned to ${employee.name} by ${session.user.name}`;
    // A lead assignment is not complete without its timeline entry. Keep both
    // required writes in one transaction so a timeline failure cannot leave a
    // lead assigned while this endpoint truthfully reports an error.
    const lead = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: { assignedToId, assignmentStrategy: null, assignmentReason: reason, autoAssignedAt: null },
        include: { assignedTo: { select: assignedToSelect } },
      });
      await tx.activity.create({
        data: { organizationId, leadId: id, type: "LEAD_ASSIGNED", description: reason, actorId: session.user.id },
      });
      return updated;
    });

    // Notification delivery is an optional side effect. Its failure must not
    // turn a committed, visible assignment into a false failure for the user.
    try {
      await createNotification({
        organizationId,
        userId: assignedToId,
        type: "LEAD_ASSIGNED",
        title: "New lead assigned to you",
        message: `${lead.clientName} (${lead.leadCode}) was manually assigned to you.`,
        leadId: id,
      });
    } catch (error) {
      logger.error("lead_assignment_notification_failed", {
        leadId: id,
        organizationId,
        assignedToId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({ success: true, lead });
  } catch (err) {
    return handleApiError(err);
  }
}
