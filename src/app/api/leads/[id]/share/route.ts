import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";
import { getWhatsAppAdapter } from "@/lib/whatsapp";
import { getOrganizationId } from "@/lib/organization";
import { recalculateLeadScore } from "@/lib/scoring";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new ApiError(404, "Lead not found");
    if (session.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden");
    }
    const history = await prisma.sharedPropertyLog.findMany({ where: { leadId: id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ history });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const { propertyIds, message } = await req.json();
    if (!Array.isArray(propertyIds) || propertyIds.length === 0) throw new ApiError(400, "propertyIds is required");
    if (!message?.trim()) throw new ApiError(400, "message is required");

    const organizationId = getOrganizationId(session.user);
    const lead = await prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new ApiError(404, "Lead not found");

    const adapter = getWhatsAppAdapter();
    const whatsappLink = adapter.buildClickToChatLink(lead.phone, message);

    const log = await prisma.sharedPropertyLog.create({
      data: {
        organizationId,
        leadId: id,
        propertyIds: JSON.stringify(propertyIds),
        message,
        sharedById: session.user.id,
        whatsappLink,
      },
    });

    await logActivity({
      leadId: id,
      type: "PROPERTIES_SHARED",
      description: `${propertyIds.length} propert${propertyIds.length > 1 ? "ies" : "y"} shared via WhatsApp by ${session.user.name}`,
      actorId: session.user.id,
      metadata: { propertyIds },
    });

    if (lead.status === "NEW" || lead.status === "CONTACTED" || lead.status === "QUALIFIED") {
      await prisma.lead.update({ where: { id }, data: { status: "PROPERTIES_SHARED", lastContactedAt: new Date() } });
    }
    await recalculateLeadScore(id, "PROPERTIES_SHARED");

    return NextResponse.json({ log, whatsappLink });
  } catch (err) {
    return handleApiError(err);
  }
}
