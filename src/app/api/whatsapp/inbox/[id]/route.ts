import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { inboxAccessWhere, linkConversation, markConversationRead } from "@/lib/whatsapp-inbox";
import { recordAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(); const { id } = await ctx.params;
    const organizationId = getOrganizationId(session.user.id);
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { id, ...inboxAccessWhere(session.user, organizationId) },
      include: { lead: { include: { assignedTo: { select: { id: true, name: true } }, catalogueShares: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 }, visits: { where: { visitDate: { gte: new Date() } }, orderBy: { visitDate: "asc" }, take: 1 }, deals: { where: { status: "OPEN" }, take: 1 } } }, assignedTo: { select: { id: true, name: true } } },
    });
    if (!conversation) throw new ApiError(404, "Conversation not found");
    return NextResponse.json({ conversation });
  } catch (error) { return handleApiError(error); }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(); const { id } = await ctx.params;
    const organizationId = getOrganizationId(session.user.id); const body = await req.json();
    const current = await prisma.whatsAppConversation.findFirst({ where: { id, ...inboxAccessWhere(session.user, organizationId) } });
    if (!current) throw new ApiError(404, "Conversation not found");
    if (body.action === "read") { await markConversationRead(id, organizationId); return NextResponse.json({ ok: true }); }
    if (body.action === "link" || body.action === "unlink") {
      if (session.user.role === "FIELD_EXECUTIVE") throw new ApiError(403, "Only Admin or Data Manager can change lead links");
      return NextResponse.json({ conversation: await linkConversation({ id, organizationId, leadId: body.action === "unlink" ? null : String(body.leadId), actorId: session.user.id }) });
    }
    if (body.action === "assign") {
      if (session.user.role === "FIELD_EXECUTIVE") throw new ApiError(403, "Only Admin or Data Manager can reassign conversations");
      const assigneeId = body.assignedToId ? String(body.assignedToId) : null;
      if (assigneeId && !(await prisma.user.findFirst({ where: { id: assigneeId, organizationId, status: "ACTIVE" } }))) throw new ApiError(404, "Employee not found");
      await prisma.whatsAppConversation.update({ where: { id }, data: { assignedToId: assigneeId } });
      await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "WhatsAppConversation", entityId: id, oldValues: { assignedToId: current.assignedToId }, newValues: { assignedToId: assigneeId } });
      return NextResponse.json({ ok: true });
    }
    throw new ApiError(400, "Unsupported action");
  } catch (error) { return handleApiError(error); }
}
