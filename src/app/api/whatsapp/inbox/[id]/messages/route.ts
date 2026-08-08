import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { inboxAccessWhere, MESSAGE_PAGE_SIZE } from "@/lib/whatsapp-inbox";
import { sendOutboundMessage } from "@/lib/whatsapp-messages";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(); const { id } = await ctx.params; const organizationId = getOrganizationId(session.user.id);
    const conversation = await prisma.whatsAppConversation.findFirst({ where: { id, ...inboxAccessWhere(session.user, organizationId) } });
    if (!conversation) throw new ApiError(404, "Conversation not found");
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const rows = await prisma.whatsAppMessage.findMany({ where: { organizationId, conversationId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MESSAGE_PAGE_SIZE + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { sentBy: { select: { id: true, name: true } }, replyToMessage: { select: { id: true, content: true } } } });
    const hasMore = rows.length > MESSAGE_PAGE_SIZE; const slice = rows.slice(0, MESSAGE_PAGE_SIZE); const nextCursor = hasMore ? slice.at(-1)?.id : null;
    return NextResponse.json({ messages: slice.reverse(), nextCursor });
  } catch (error) { return handleApiError(error); }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(); const { id } = await ctx.params; const organizationId = getOrganizationId(session.user.id);
    const conversation = await prisma.whatsAppConversation.findFirst({ where: { id, ...inboxAccessWhere(session.user, organizationId) } });
    if (!conversation) throw new ApiError(404, "Conversation not found");
    if (!conversation.leadId) throw new ApiError(400, "Link this conversation to a lead before sending");
    const body = await req.json(); const kind = String(body.kind ?? "text");
    let content = String(body.content ?? "").trim(); let messageType: "TEXT" | "TEMPLATE" | "CATALOGUE" = "TEXT"; let catalogueUrl: string | undefined;
    if (kind === "template") messageType = "TEMPLATE";
    if (kind === "catalogue") {
      const catalogue = await prisma.catalogueShare.findFirst({ where: { id: String(body.catalogueId), organizationId, leadId: conversation.leadId, status: "ACTIVE" } });
      if (!catalogue) throw new ApiError(404, "Active catalogue not found");
      catalogueUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/share/catalogue/${catalogue.token}`;
      content = content || `Here is your property catalogue: ${catalogueUrl}`; messageType = "CATALOGUE";
    }
    if (kind === "property") {
      const property = await prisma.property.findFirst({ where: { id: String(body.propertyId), organizationId, status: "AVAILABLE" }, select: { id: true, title: true, area: true, bhk: true, monthlyRent: true, salePrice: true } });
      if (!property) throw new ApiError(404, "Available property not found");
      const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/p/${property.id}`;
      content = `${property.title} · ${property.area}${property.bhk ? ` · ${property.bhk} BHK` : ""}\n${url}`;
    }
    const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;
    const result = await sendOutboundMessage({ leadId: conversation.leadId, conversationId: conversation.id, sentByUserId: session.user.id, content, messageType, templateName: body.templateName, catalogueUrl, idempotencyKey, metadata: { explicitEmployeeAction: true, ...(kind === "property" ? { propertyId: body.propertyId } : {}) } });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
