import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { inboxAccessWhere } from "@/lib/whatsapp-inbox";

export async function GET() {
  try {
    const session = await requireSession(); const organizationId = getOrganizationId(session.user);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const conversationScope = inboxAccessWhere(session.user, organizationId);
    const messageScope = { organizationId, ...(session.user.role === "FIELD_EXECUTIVE" ? { conversation: { OR: [{ assignedToId: session.user.id }, { lead: { assignedToId: session.user.id } }] } } : {}) };
    const [inboundToday, outbound, unread, failed, linked, unknown, byEmployee, responded] = await Promise.all([
      prisma.whatsAppConversation.count({ where: { ...conversationScope, lastInboundAt: { gte: today } } }),
      prisma.whatsAppMessage.count({ where: { ...messageScope, direction: "OUTBOUND", createdAt: { gte: today } } }),
      prisma.whatsAppConversation.count({ where: { ...conversationScope, unreadCount: { gt: 0 } } }),
      prisma.whatsAppMessage.count({ where: { ...messageScope, direction: "OUTBOUND", status: "FAILED" } }),
      prisma.whatsAppConversation.count({ where: { ...conversationScope, contactState: "LINKED" } }),
      prisma.whatsAppConversation.count({ where: { ...conversationScope, contactState: { in: ["UNKNOWN", "AMBIGUOUS"] } } }),
      prisma.whatsAppConversation.groupBy({ by: ["assignedToId"], where: conversationScope, _count: { _all: true } }),
      prisma.whatsAppConversation.findMany({ where: { ...conversationScope, lastInboundAt: { not: null }, lastOutboundAt: { not: null } }, select: { lastInboundAt: true, lastOutboundAt: true } }),
    ]);
    const responseTimes = responded.filter((x) => x.lastInboundAt && x.lastOutboundAt && x.lastOutboundAt > x.lastInboundAt).map((x) => x.lastOutboundAt!.getTime() - x.lastInboundAt!.getTime());
    return NextResponse.json({ inboundToday, outboundToday: outbound, unread, failed, linked, unknown, averageFirstResponseMinutes: responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 60000) : null, byEmployee });
  } catch (error) { return handleApiError(error); }
}
