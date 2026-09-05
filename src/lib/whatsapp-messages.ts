import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { resolveOrganizationIdForUser } from "./organization";
import { logActivity } from "./activity";
import { createNotification } from "./notifications";
import { recalculateLeadScore } from "./scoring";
import { recordAudit } from "./audit";
import { findOrCreateConversation, touchConversationTimestamps } from "./whatsapp-conversations";
import { getWhatsAppProvider } from "@/integrations/whatsapp";
import { WhatsAppProviderError, WhatsAppConfigError } from "@/integrations/whatsapp/whatsapp-errors";
import { isWithinCustomerCareWindow } from "@/integrations/whatsapp/whatsapp-window";
import { assertTemplateApproved } from "@/integrations/whatsapp/whatsapp-templates";
import type { WhatsAppMessageStatus, WhatsAppMessageType } from "@prisma/client";

interface SendMessageParams {
  leadId: string;
  conversationId?: string;
  sentByUserId: string;
  content: string;
  messageType?: WhatsAppMessageType;
  templateName?: string;
  catalogueUrl?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  /** Already authorized by the caller; used only to select this lead's conversation. */
  recipientPhone?: string;
}

/** Sends an outbound message through whichever provider is configured, persisting every state transition. */
export async function sendOutboundMessage(params: SendMessageParams) {
  if (!params.content?.trim()) throw new ApiError(400, "Message content is required");

  const organizationId = await resolveOrganizationIdForUser(params.sentByUserId);
  const conversation = params.conversationId
    ? await prisma.whatsAppConversation.findFirst({ where: { id: params.conversationId, organizationId, leadId: params.leadId } })
    : await findOrCreateConversation(params.leadId, organizationId, params.recipientPhone);
  if (!conversation) throw new ApiError(404, "Conversation not found");
  const provider = getWhatsAppProvider();
  const messageType = params.messageType ?? "TEXT";
  if (params.idempotencyKey) {
    const existing = await prisma.whatsAppMessage.findFirst({ where: { organizationId, idempotencyKey: params.idempotencyKey } });
    if (existing) return { message: existing, clickToChatUrl: undefined };
  }

  // Meta's customer-service-window and template-approval rules only apply
  // to the real Meta Cloud API - Mock and Click-to-Chat have no such
  // restriction (there is no Meta session to be inside or outside of).
  if (provider.name === "META_CLOUD") {
    if (messageType === "TEMPLATE") {
      if (!params.templateName) throw new ApiError(400, "templateName is required for a TEMPLATE message");
      try {
        assertTemplateApproved(params.templateName);
      } catch (err) {
        if (err instanceof WhatsAppConfigError) throw new ApiError(400, err.message);
        throw err;
      }
    } else if (!isWithinCustomerCareWindow(conversation.lastInboundAt)) {
      throw new ApiError(
        400,
        "This client hasn't messaged in the last 24 hours, so Meta only allows an approved template message (not free text) - use a template instead."
      );
    }
  }

  const message = await prisma.whatsAppMessage.create({
    data: {
      organizationId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      messageType,
      provider: provider.name,
      content: params.content,
      templateName: params.templateName,
      status: "QUEUED",
      sentByUserId: params.sentByUserId,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      idempotencyKey: params.idempotencyKey,
    },
  });

  try {
    const result = await (async () => {
      if (messageType === "TEMPLATE" && params.templateName) {
        return provider.sendTemplateMessage({ to: conversation.phoneNumber, templateName: params.templateName, body: params.content });
      }
      if (messageType === "CATALOGUE" && params.catalogueUrl) {
        return provider.sendCatalogueMessage({ to: conversation.phoneNumber, body: params.content, catalogueUrl: params.catalogueUrl });
      }
      return provider.sendTextMessage({ to: conversation.phoneNumber, body: params.content });
    })();

    const updated = await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        providerMessageId: result.providerMessageId,
        status: result.status,
        sentAt: result.status === "SENT" ? new Date() : null,
      },
    });

    await touchConversationTimestamps(conversation.id, "OUTBOUND");
    await logActivity({
      leadId: params.leadId,
      type: params.metadata?.propertyId ? "WHATSAPP_PROPERTY_SENT" : messageType === "CATALOGUE" ? "WHATSAPP_CATALOGUE_SENT" : "WHATSAPP_OUTBOUND",
      description: `${messageType === "CATALOGUE" ? "Catalogue" : "WhatsApp"} message sent (${provider.name.replace(/_/g, " ")})`,
      actorId: params.sentByUserId,
    });
    await recordAudit({
      userId: params.sentByUserId,
      action: "CREATE",
      entityType: "WhatsAppMessage",
      entityId: updated.id,
      newValues: { event: "whatsapp_message_sent", leadId: params.leadId, messageType, provider: provider.name, status: updated.status },
    });

    return { message: updated, clickToChatUrl: result.clickToChatUrl };
  } catch (err) {
    const errorMessage = err instanceof WhatsAppProviderError ? err.message : "Failed to send message";
    const failed = await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: { status: "FAILED", errorMessage, failedAt: new Date() },
    });
    await recordAudit({
      userId: params.sentByUserId,
      action: "OTHER",
      entityType: "WhatsAppMessage",
      entityId: failed.id,
      newValues: { event: "whatsapp_message_failed", leadId: params.leadId, messageType, provider: provider.name },
      result: "FAILURE",
      errorMessage,
    });
    await notifyMessageFailed(params.leadId, organizationId, errorMessage);
    return { message: failed, clickToChatUrl: undefined };
  }
}

/**
 * Click-to-chat never confirms delivery on its own - this is the explicit,
 * application-side action taken after the UI opens the wa.me link, per the
 * documented status policy in click-to-chat-provider.ts.
 */
export async function markClickToChatOpened(messageId: string) {
  const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!message) throw new ApiError(404, "Message not found");
  if (message.provider !== "CLICK_TO_CHAT") throw new ApiError(400, "Only click-to-chat messages can be marked as opened");

  const updated = await prisma.whatsAppMessage.update({ where: { id: messageId }, data: { status: "SENT", sentAt: new Date() } });
  await touchConversationTimestamps(message.conversationId, "OUTBOUND");
  return updated;
}

/**
 * Re-runs the send pipeline for a failed message - creates a brand-new
 * message row (never mutates the original, preserving history) linked back
 * via metadata.retryOf. Re-validates the customer-care window and template
 * approval exactly as a fresh send would (both can have changed since the
 * original attempt failed) - sendOutboundMessage enforces both already, so
 * this never bypasses them.
 */
export async function retryMessage(messageId: string, sentByUserId: string) {
  const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!message) throw new ApiError(404, "Message not found");
  if (message.status !== "FAILED") throw new ApiError(400, "Only failed messages can be retried");
  if (!message.conversation.leadId) throw new ApiError(400, "Link this conversation to a lead before retrying");

  const existingMetadata = message.metadata ? JSON.parse(message.metadata) : {};

  const result = await sendOutboundMessage({
    leadId: message.conversation.leadId,
    conversationId: message.conversationId,
    sentByUserId,
    content: message.content,
    messageType: message.messageType,
    templateName: message.templateName ?? undefined,
    metadata: { ...existingMetadata, retryOf: message.id },
    idempotencyKey: `retry:${message.id}`,
  });

  await logActivity({
    leadId: message.conversation.leadId,
    type: "WHATSAPP_MESSAGE_SENT",
    description: "WhatsApp message retried after a previous failure",
    actorId: sentByUserId,
  });
  await recordAudit({
    userId: sentByUserId,
    action: "OTHER",
    entityType: "WhatsAppMessage",
    entityId: result.message.id,
    newValues: { event: "whatsapp_message_retried", retryOf: message.id, status: result.message.status },
  });

  return result;
}

const SIMULATED_REPLIES = [
  "I like the second property.",
  "Can we visit tomorrow?",
  "Do you have anything closer to the metro?",
  "My budget is only ₹20,000.",
  "Please call me after 6 PM.",
  "I am not interested in these options.",
] as const;

export { SIMULATED_REPLIES };

/** Mock-mode only: simulates the client replying, running the exact same pipeline a real inbound webhook would trigger. */
export async function simulateReply(leadId: string, text: string, organizationId: string) {
  const provider = getWhatsAppProvider();
  if (provider.name !== "MOCK") throw new ApiError(400, "Simulated replies are only available when WHATSAPP_PROVIDER=MOCK");

  const conversation = await findOrCreateConversation(leadId, organizationId);

  const message = await prisma.whatsAppMessage.create({
    data: {
      organizationId,
      conversationId: conversation.id,
      direction: "INBOUND",
      messageType: "TEXT",
      provider: provider.name,
      providerMessageId: `mock_in_${Date.now()}`,
      content: text,
      status: "RECEIVED",
    },
  });

  await touchConversationTimestamps(conversation.id, "INBOUND");
  await handleInboundReplyEffects(leadId, text);

  return message;
}

/** Mock-mode only: transitions a previously-sent outbound message through DELIVERED / READ / FAILED. */
export async function simulateStatus(messageId: string, targetStatus: Extract<WhatsAppMessageStatus, "DELIVERED" | "READ" | "FAILED">) {
  const provider = getWhatsAppProvider();
  if (provider.name !== "MOCK") throw new ApiError(400, "Simulated status transitions are only available when WHATSAPP_PROVIDER=MOCK");

  const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!message) throw new ApiError(404, "Message not found");
  if (message.direction !== "OUTBOUND") throw new ApiError(400, "Only outbound messages have delivery/read status");

  const now = new Date();
  const data: Record<string, unknown> = { status: targetStatus };
  if (targetStatus === "DELIVERED") data.deliveredAt = now;
  if (targetStatus === "READ") data.readAt = now;
  if (targetStatus === "FAILED") {
    data.failedAt = now;
    data.errorMessage = "Simulated failure";
  }

  const updated = await prisma.whatsAppMessage.update({ where: { id: messageId }, data });

  if (targetStatus === "FAILED") {
    if (message.conversation.leadId) await notifyMessageFailed(message.conversation.leadId, message.organizationId, "Simulated failure");
  }

  return updated;
}

/** Shared side-effects for any inbound reply, whether simulated or from a real webhook. */
export async function handleInboundReplyEffects(leadId: string, text: string) {
  await logActivity({
    leadId,
    type: "CLIENT_REPLY_RECEIVED",
    // Per Phase 2B.10 guidance: keep sensitive content out of notification
    // titles - this is the lead activity description, which is only ever
    // shown inside the authenticated lead workspace, not a notification title.
    description: `Inbound WhatsApp reply received: "${truncate(text, 120)}"`,
  });

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { lastContactedAt: new Date() },
  });

  if (lead.assignedToId) {
    await createNotification({
      organizationId: lead.organizationId,
      userId: lead.assignedToId,
      type: "CLIENT_REPLY_RECEIVED",
      title: "Client replied on WhatsApp",
      message: `${lead.clientName} sent a new WhatsApp message.`,
      leadId,
    });
  }

  await recalculateLeadScore(leadId, "WHATSAPP_REPLY_RECEIVED");
}

async function notifyMessageFailed(leadId: string, organizationId: string, errorMessage: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  await logActivity({ leadId, type: "WHATSAPP_MESSAGE_FAILED", description: `WhatsApp message failed to send: ${errorMessage}` });
  if (lead.assignedToId) {
    await createNotification({
      organizationId,
      userId: lead.assignedToId,
      type: "WHATSAPP_MESSAGE_FAILED",
      title: "WhatsApp message failed",
      message: `A message to ${lead.clientName} could not be sent.`,
      leadId,
    });
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
