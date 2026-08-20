import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { inboxAccessWhere, INBOX_PAGE_SIZE } from "@/lib/whatsapp-inbox";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const filter = req.nextUrl.searchParams.get("filter") ?? "all";
    const search = req.nextUrl.searchParams.get("search")?.trim();
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const base = inboxAccessWhere(session.user, organizationId);
    const where: Prisma.WhatsAppConversationWhereInput = {
      AND: [base,
      {
      ...(filter === "mine" ? { assignedToId: session.user.id } : {}),
      ...(filter === "unassigned" ? { assignedToId: null } : {}),
      ...(filter === "unread" ? { unreadCount: { gt: 0 } } : {}),
      ...(filter === "linked" ? { contactState: "LINKED" as const } : {}),
      ...(filter === "unknown" ? { contactState: { in: ["UNKNOWN", "AMBIGUOUS"] } } : {}),
      ...(search ? { OR: [{ phoneNumber: { contains: search } }, { displayName: { contains: search, mode: "insensitive" as const } }, { lead: { OR: [{ clientName: { contains: search, mode: "insensitive" as const } }, { leadCode: { contains: search, mode: "insensitive" as const } }] } }] } : {}),
      }],
    };
    const rows = await prisma.whatsAppConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: INBOX_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { lead: { select: { id: true, clientName: true, status: true, priority: true, assignedToId: true } }, assignedTo: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, messageType: true, createdAt: true } } },
    });
    const hasMore = rows.length > INBOX_PAGE_SIZE;
    const conversations = rows.slice(0, INBOX_PAGE_SIZE);
    return NextResponse.json({ conversations, nextCursor: hasMore ? conversations.at(-1)?.id : null });
  } catch (error) { return handleApiError(error); }
}
