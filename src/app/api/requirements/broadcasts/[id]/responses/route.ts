import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { logActivity } from "@/lib/activity";
import { recordAudit } from "@/lib/audit";

/** Records a partner response against the selected recipient; property creation stays on the normal Property API. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]); const organizationId = getOrganizationId(session.user.id); const { id } = await params;
    const { partnerId, propertyId, note } = await req.json() as { partnerId: string; propertyId?: string; note?: string };
    const recipient = await prisma.requirementBroadcastRecipient.findFirst({ where: { requirementBroadcastId: id, inventoryPartnerId: partnerId, requirementBroadcast: { organizationId } }, include: { requirementBroadcast: true } });
    if (!recipient) throw new ApiError(404, "Selected broadcast recipient not found");
    if (propertyId) { const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId, inventorySource: "INDIRECT", partnerId } }); if (!property) throw new ApiError(400, "Property must be an indirect property of the responding partner"); }
    await prisma.$transaction([prisma.requirementBroadcastRecipient.update({ where: { id: recipient.id }, data: { respondedAt: new Date(), responseNote: note ?? null, linkedPropertyId: propertyId ?? null } }), prisma.requirementBroadcast.update({ where: { id }, data: { status: propertyId ? "MATCH_FOUND" : "RESPONSE_RECEIVED" } })]);
    await logActivity({ leadId: recipient.requirementBroadcast.leadId, type: "MATCHES_FOUND", description: "Inventory partner response recorded", actorId: session.user.id, metadata: { broadcastId: id, partnerId, propertyId } });
    await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "RequirementBroadcastRecipient", entityId: recipient.id, newValues: { propertyId, note } });
    return NextResponse.json({ success: true });
  } catch (err) { return handleApiError(err); }
}
