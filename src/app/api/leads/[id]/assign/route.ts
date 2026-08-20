import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { getOrganizationId } from "@/lib/organization";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const { employeeId } = await req.json();
    if (!employeeId) throw new ApiError(400, "employeeId is required");
    const organizationId = getOrganizationId(session.user);

    const employee = await prisma.user.findFirst({ where: { id: employeeId, organizationId } });
    if (!employee) throw new ApiError(404, "Employee not found");
    const existingLead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!existingLead) throw new ApiError(404, "Lead not found");

    const reason = `Manually assigned to ${employee.name} by ${session.user.name}`;
    const lead = await prisma.lead.update({
      where: { id },
      data: { assignedToId: employeeId, assignmentStrategy: null, assignmentReason: reason, autoAssignedAt: null },
    });
    await logActivity({ leadId: id, type: "LEAD_ASSIGNED", description: reason, actorId: session.user.id });

    await createNotification({
      organizationId,
      userId: employeeId,
      type: "LEAD_ASSIGNED",
      title: "New lead assigned to you",
      message: `${lead.clientName} (${lead.leadCode}) was manually assigned to you.`,
      leadId: id,
    });

    return NextResponse.json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}
