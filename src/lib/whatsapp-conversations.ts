import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { logActivity } from "./activity";
import { normalizeIndianPhone, getWhatsAppProvider, loadWhatsAppConfig } from "@/integrations/whatsapp";
import type { WhatsAppDirection } from "@prisma/client";

const DEFAULT_PAGE_SIZE = 50;

/**
 * Finds the lead's conversation for its current phone number, or creates one
 * using whichever provider is presently configured. A lead can in principle
 * gain more than one conversation over time (e.g. if the client's phone
 * number changes) - the unique constraint is on (leadId, phoneNumber), not
 * leadId alone, which is exactly the flexibility the schema comment calls for.
 */
export async function findOrCreateConversation(leadId: string, organizationId: string) {
  const lead = await prisma.lead.findFirstOrThrow({ where: { id: leadId, organizationId } });
  const phoneNumber = normalizeIndianPhone(lead.phone, loadWhatsAppConfig().defaultCountryCode);
  if (!phoneNumber) {
    throw new ApiError(400, `Lead's phone number "${lead.phone}" is not a valid Indian number - cannot start a WhatsApp conversation.`);
  }

  const existing = await prisma.whatsAppConversation.findUnique({
    where: { leadId_phoneNumber: { leadId, phoneNumber } },
  });
  if (existing) return existing;

  const provider = getWhatsAppProvider();
  const conversation = await prisma.whatsAppConversation.create({
    data: { organizationId, leadId, phoneNumber, provider: provider.name, contactState: "LINKED", assignedToId: lead.assignedToId },
  });

  await logActivity({
    leadId,
    type: "WHATSAPP_CONVERSATION_CREATED",
    description: `WhatsApp conversation started (${phoneNumber}, ${provider.name.replace(/_/g, " ")})`,
  });

  return conversation;
}

export async function getConversationForLead(leadId: string) {
  return prisma.whatsAppConversation.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } });
}

export async function listMessages(conversationId: string, opts: { cursor?: string; take?: number } = {}) {
  const take = opts.take ?? DEFAULT_PAGE_SIZE;
  const messages = await prisma.whatsAppMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    take,
    include: { sentBy: true },
  });
  return messages;
}

export async function touchConversationTimestamps(conversationId: string, direction: WhatsAppDirection, at: Date = new Date()) {
  await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: at,
      ...(direction === "INBOUND" ? { lastInboundAt: at, unreadCount: { increment: 1 } } : { lastOutboundAt: at }),
    },
  });
}
