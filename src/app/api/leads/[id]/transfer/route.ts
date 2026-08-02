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
    const { toUserId, reason } = await req.json();
    if (!toUserId) throw new ApiError(400, "toUserId is required");
    const organizationId = getOrganizationId(session.user.id);

    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new ApiError(404, "Lead not found");
    const toUser = await prisma.user.findFirst({ where: { id: toUserId, organizationId } });
    if (!toUser) throw new ApiError(404, "Target employee not found");

    await prisma.leadTransfer.create({ data: { organizationId, leadId: id, fromUserId: lead.assignedToId, toUserId, reason } });
    const updated = await prisma.lead.update({ where: { id }, data: { assignedToId: toUserId, assignmentStrategy: null, assignmentReason: `Manually transferred by ${session.user.name}${reason ? `: ${reason}` : ""}` } });
    await logActivity({ leadId: id, type: "LEAD_TRANSFERRED", description: `Transferred to ${toUser.name}${reason ? `: ${reason}` : ""}`, actorId: session.user.id });

    await createNotification({
      organizationId,
      userId: toUserId,
      type: "LEAD_TRANSFERRED",
      title: "Lead transferred to you",
      message: `${lead.clientName} (${lead.leadCode}) was transferred to you${reason ? `: ${reason}` : ""}`,
      leadId: id,
    });

    return NextResponse.json({ lead: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
