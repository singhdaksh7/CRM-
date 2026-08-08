import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { recordAudit } from "./audit";
import { createNotification, notifyRoles } from "./notifications";
import { logActivity } from "./activity";
import { normalizeIndianPhone, loadWhatsAppConfig } from "@/integrations/whatsapp";
import type { Role, WhatsAppMessageStatus } from "@prisma/client";

export const INBOX_PAGE_SIZE = 30;
export const MESSAGE_PAGE_SIZE = 40;

export function inboxAccessWhere(user: { id: string; role: Role }, organizationId: string) {
  return {
    organizationId,
    ...(user.role === "FIELD_EXECUTIVE"
      ? { OR: [{ assignedToId: user.id }, { lead: { assignedToId: user.id } }] }
      : {}),
  };
}

export async function findLeadMatchesByPhone(organizationId: string, phone: string) {
  const normalized = normalizeIndianPhone(phone, loadWhatsAppConfig().defaultCountryCode);
  if (!normalized) return [];
  const leads = await prisma.lead.findMany({
    where: { organizationId },
    select: { id: true, clientName: true, phone: true, assignedToId: true },
  });
  return leads.filter((lead) => normalizeIndianPhone(lead.phone, loadWhatsAppConfig().defaultCountryCode) === normalized);
}

export async function resolveInboundConversation(params: {
  organizationId: string;
  phoneNumber: string;
  displayName?: string;
  providerPhoneNumberId?: string;
}) {
  const existing = await prisma.whatsAppConversation.findFirst({
    where: { organizationId: params.organizationId, phoneNumber: params.phoneNumber, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const matches = await findLeadMatchesByPhone(params.organizationId, params.phoneNumber);
  const uniqueLead = matches.length === 1 ? matches[0] : null;
  const conversation = await prisma.whatsAppConversation.create({
    data: {
      organizationId: params.organizationId,
      phoneNumber: params.phoneNumber,
      displayName: params.displayName,
      provider: "META_CLOUD",
      providerPhoneNumberId: params.providerPhoneNumberId,
      leadId: uniqueLead?.id,
      assignedToId: uniqueLead?.assignedToId,
      contactState: uniqueLead ? "LINKED" : matches.length > 1 ? "AMBIGUOUS" : "UNKNOWN",
    },
  });

  if (!uniqueLead) {
    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId: params.organizationId,
      type: matches.length > 1 ? "WHATSAPP_MULTIPLE_LEAD_MATCH" : "WHATSAPP_UNKNOWN_CONTACT",
      title: matches.length > 1 ? "Multiple possible WhatsApp leads" : "Unknown WhatsApp contact",
      message: matches.length > 1
        ? "An inbound WhatsApp conversation needs manual lead linking."
        : "An unlinked WhatsApp conversation needs review.",
    });
  }
  return conversation;
}

export async function recordInboundMessage(params: {
  organizationId: string;
  conversationId: string;
  providerMessageId: string;
  content: string;
  messageType: "TEXT" | "IMAGE" | "DOCUMENT" | "INTERACTIVE";
  timestamp: Date;
  caption?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  providerMetadata?: Record<string, unknown>;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.whatsAppMessage.create({
      data: {
        organizationId: params.organizationId,
        conversationId: params.conversationId,
        direction: "INBOUND",
        messageType: params.messageType,
        provider: "META_CLOUD",
        providerMessageId: params.providerMessageId,
        content: params.content,
        caption: params.caption,
        mediaMimeType: params.mediaMimeType,
        mediaFilename: params.mediaFilename,
        metadata: params.providerMetadata ? JSON.stringify(params.providerMetadata) : undefined,
        status: "RECEIVED",
        providerTimestamp: params.timestamp,
        createdAt: params.timestamp,
      },
    });
    const conversation = await tx.whatsAppConversation.update({
      where: { id: params.conversationId },
      data: { lastMessageAt: params.timestamp, lastInboundAt: params.timestamp, unreadCount: { increment: 1 } },
      include: { lead: true },
    });
    return { message, conversation };
  });

  if (result.conversation.leadId) {
    await logActivity({
      leadId: result.conversation.leadId,
      type: "WHATSAPP_INBOUND",
      description: `Inbound WhatsApp ${params.messageType.toLowerCase()} received`,
    });
  }
  if (result.conversation.assignedToId) {
    await createNotification({
      organizationId: params.organizationId,
      userId: result.conversation.assignedToId,
      type: "CLIENT_REPLY_RECEIVED",
      title: "New WhatsApp message",
      message: `${result.conversation.lead?.clientName ?? result.conversation.displayName ?? "A contact"} sent a message.`,
      leadId: result.conversation.leadId ?? undefined,
    });
  }
  return result;
}

export async function updateDeliveryStatus(params: {
  organizationId: string;
  providerMessageId: string;
  status: Extract<WhatsAppMessageStatus, "SENT" | "DELIVERED" | "READ" | "FAILED">;
  timestamp: Date;
  errorCode?: string;
  errorMessage?: string;
}) {
  const rank: Record<WhatsAppMessageStatus, number> = { QUEUED: 0, RECEIVED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
  const message = await prisma.whatsAppMessage.findFirst({
    where: { organizationId: params.organizationId, providerMessageId: params.providerMessageId },
    include: { conversation: true },
  });
  if (!message || rank[params.status] <= rank[message.status]) return { applied: false, message };
  const data = {
    status: params.status,
    ...(params.status === "SENT" ? { sentAt: params.timestamp } : {}),
    ...(params.status === "DELIVERED" ? { deliveredAt: params.timestamp } : {}),
    ...(params.status === "READ" ? { readAt: params.timestamp } : {}),
    ...(params.status === "FAILED" ? { failedAt: params.timestamp, errorMessage: params.errorMessage, providerErrorCode: params.errorCode } : {}),
  };
  return { applied: true, message: await prisma.whatsAppMessage.update({ where: { id: message.id }, data }) };
}

export async function markConversationRead(id: string, organizationId: string) {
  return prisma.whatsAppConversation.updateMany({ where: { id, organizationId }, data: { unreadCount: 0, crmReadAt: new Date() } });
}

export async function linkConversation(params: { id: string; organizationId: string; leadId: string | null; actorId: string }) {
  const conversation = await prisma.whatsAppConversation.findFirst({ where: { id: params.id, organizationId: params.organizationId } });
  if (!conversation) throw new ApiError(404, "Conversation not found");
  const lead = params.leadId
    ? await prisma.lead.findFirst({ where: { id: params.leadId, organizationId: params.organizationId } })
    : null;
  if (params.leadId && !lead) throw new ApiError(404, "Lead not found");
  const updated = await prisma.whatsAppConversation.update({
    where: { id: params.id },
    data: { leadId: lead?.id ?? null, assignedToId: lead?.assignedToId ?? conversation.assignedToId, contactState: lead ? "LINKED" : "UNKNOWN" },
  });
  await recordAudit({ userId: params.actorId, action: "UPDATE", entityType: "WhatsAppConversation", entityId: params.id, oldValues: { leadId: conversation.leadId }, newValues: { leadId: lead?.id ?? null } });
  if (lead) await logActivity({ leadId: lead.id, type: "WHATSAPP_CONVERSATION_LINKED", description: "WhatsApp conversation linked to lead", actorId: params.actorId });
  return updated;
}

export function sanitizeMediaFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".").replace(/^[._-]+/, "").slice(0, 120) || "attachment";
}

export function validateInboundMedia(type: "IMAGE" | "DOCUMENT", mime: string, size?: number) {
  const allowed = type === "IMAGE" ? ["image/jpeg", "image/png", "image/webp"] : ["application/pdf", "text/plain"];
  if (!allowed.includes(mime.toLowerCase())) throw new ApiError(415, "Unsupported WhatsApp media type");
  if (size !== undefined && size > 10 * 1024 * 1024) throw new ApiError(413, "WhatsApp media exceeds the 10 MB limit");
}
