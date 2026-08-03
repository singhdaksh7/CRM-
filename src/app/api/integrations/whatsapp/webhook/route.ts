import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWhatsAppProvider, loadWhatsAppConfig } from "@/integrations/whatsapp";
import { hashPayload, recordWebhookEventOnce, markWebhookEventProcessed } from "@/lib/webhook-events";
import { touchConversationTimestamps } from "@/lib/whatsapp-conversations";
import { handleInboundReplyEffects } from "@/lib/whatsapp-messages";
import { logActivity } from "@/lib/activity";
import { createNotification, notifyRoles } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { getOrganizationId } from "@/lib/organization";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { WhatsAppMessageStatus } from "@prisma/client";

/** Monotonic status ranks - a later/duplicate webhook can never move a message backwards (e.g. a delayed "sent" arriving after "read" must not downgrade it). FAILED is terminal and never overwritten either. */
const STATUS_RANK: Record<WhatsAppMessageStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4,
  RECEIVED: 0,
};

/**
 * Meta Cloud webhook verification handshake (GET). Only meaningful when
 * WHATSAPP_PROVIDER=META_CLOUD - MOCK and CLICK_TO_CHAT never receive real
 * webhook calls from Meta, so this intentionally returns 400 for them
 * rather than silently pretending to verify.
 */
export async function GET(req: NextRequest) {
  const provider = getWhatsAppProvider();
  if (provider.name !== "META_CLOUD") {
    return NextResponse.json({ error: "Webhook verification only applies when WHATSAPP_PROVIDER=META_CLOUD" }, { status: 400 });
  }
  if (!loadWhatsAppConfig().webhookEnabled) {
    return NextResponse.json({ error: "The WhatsApp webhook is currently disabled (WHATSAPP_WEBHOOK_ENABLED=false)" }, { status: 503 });
  }

  // Never log hub.verify_token, matched or not.
  const challenge = provider.verifyWebhook(req.nextUrl.searchParams);
  if (challenge === null) {
    return NextResponse.json({ error: "Verification failed - invalid mode or verify token" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

export async function POST(req: NextRequest) {
  const limitResult = await checkRateLimit("webhook", clientIp(req));
  if (!limitResult.allowed) return rateLimitResponse(limitResult);

  const provider = getWhatsAppProvider();
  if (provider.name !== "META_CLOUD") {
    return NextResponse.json({ error: "This endpoint only accepts events when WHATSAPP_PROVIDER=META_CLOUD" }, { status: 400 });
  }
  if (!loadWhatsAppConfig().webhookEnabled) {
    return NextResponse.json({ error: "The WhatsApp webhook is currently disabled (WHATSAPP_WEBHOOK_ENABLED=false)" }, { status: 503 });
  }

  // Signature is validated against the raw body BEFORE any JSON.parse -
  // never trust/parse the body first.
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    // Never log the signature header or the raw body here.
    await recordAudit({
      action: "OTHER",
      entityType: "WhatsAppWebhook",
      newValues: { event: "webhook_signature_rejected" },
      result: "FAILURE",
    });
    logger.warn("whatsapp_webhook_signature_rejected", {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { messages, statuses } = provider.parseInboundWebhook(payload);
  const organizationId = getOrganizationId();
  logger.info("whatsapp_webhook_received", { messageCount: messages.length, statusCount: statuses.length });

  for (const inbound of messages) {
    const { isNew } = await recordWebhookEventOnce({
      provider: "META_CLOUD",
      externalEventId: inbound.externalEventId,
      eventType: "message",
      payloadHash: hashPayload(rawBody),
    });
    if (!isNew) continue; // already processed - Meta retries deliveries, this must be a no-op

    try {
      // Every conversation across every lead that currently uses this phone
      // number - NOT just the first/most-recent one. A single match
      // resolves normally; zero or multiple matches must never be guessed.
      const conversations = await prisma.whatsAppConversation.findMany({
        where: { organizationId, phoneNumber: inbound.from },
        orderBy: { createdAt: "desc" },
      });

      if (conversations.length === 0) {
        await markWebhookEventProcessed("META_CLOUD", inbound.externalEventId, "IGNORED", `No conversation found for ${inbound.from}`);
        await notifyRoles(["ADMIN", "DATA_MANAGER"], {
          organizationId,
          type: "WHATSAPP_UNKNOWN_CONTACT",
          title: "Unknown WhatsApp contact",
          message: "A WhatsApp message arrived from a number with no matching lead conversation.",
        });
        await recordAudit({
          action: "OTHER",
          entityType: "WhatsAppMessage",
          newValues: { event: "whatsapp_unknown_contact" },
        });
        continue;
      }

      if (conversations.length > 1) {
        // Ambiguous: this phone number is attached to more than one lead's
        // conversation. Do not guess which lead it belongs to - flag for
        // manual resolution instead of silently attaching to the most recent.
        await markWebhookEventProcessed(
          "META_CLOUD",
          inbound.externalEventId,
          "IGNORED",
          `Multiple leads (${conversations.length}) match phone number - manual resolution required`
        );
        await notifyRoles(["ADMIN", "DATA_MANAGER"], {
          organizationId,
          type: "WHATSAPP_MULTIPLE_LEAD_MATCH",
          title: "Multiple leads match a WhatsApp number",
          message: `A WhatsApp message arrived from a number linked to ${conversations.length} different leads - manual review required.`,
        });
        await recordAudit({
          action: "OTHER",
          entityType: "WhatsAppMessage",
          newValues: { event: "whatsapp_multiple_lead_match", matchCount: conversations.length },
        });
        continue;
      }

      const conversation = conversations[0];

      await prisma.whatsAppMessage.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          direction: "INBOUND",
          messageType: "TEXT",
          provider: "META_CLOUD",
          providerMessageId: inbound.providerMessageId,
          content: inbound.text,
          status: "RECEIVED",
          createdAt: inbound.timestamp,
        },
      });
      await touchConversationTimestamps(conversation.id, "INBOUND", inbound.timestamp);
      await handleInboundReplyEffects(conversation.leadId, inbound.text);
      await markWebhookEventProcessed("META_CLOUD", inbound.externalEventId, "PROCESSED");
    } catch (err) {
      await markWebhookEventProcessed("META_CLOUD", inbound.externalEventId, "FAILED", err instanceof Error ? err.message : "Unknown error");
      logger.error("whatsapp_webhook_message_failed", { externalEventId: inbound.externalEventId, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  for (const statusEvent of statuses) {
    const { isNew } = await recordWebhookEventOnce({
      provider: "META_CLOUD",
      externalEventId: statusEvent.externalEventId,
      eventType: "status",
      payloadHash: hashPayload(rawBody),
    });
    if (!isNew) continue;

    try {
      const message = await prisma.whatsAppMessage.findUnique({ where: { providerMessageId: statusEvent.providerMessageId }, include: { conversation: true } });
      if (!message) {
        await markWebhookEventProcessed("META_CLOUD", statusEvent.externalEventId, "IGNORED", `No message found for provider ID ${statusEvent.providerMessageId}`);
        continue;
      }

      // Reject a stale/out-of-order status regression (e.g. a delayed
      // "delivered" arriving after "read" already landed) - only apply
      // forward progress.
      if (STATUS_RANK[statusEvent.status] <= STATUS_RANK[message.status]) {
        await markWebhookEventProcessed(
          "META_CLOUD",
          statusEvent.externalEventId,
          "IGNORED",
          `Stale status regression ignored (current=${message.status}, incoming=${statusEvent.status})`
        );
        continue;
      }

      const data: Record<string, unknown> = { status: statusEvent.status };
      if (statusEvent.status === "DELIVERED") data.deliveredAt = statusEvent.timestamp;
      if (statusEvent.status === "READ") data.readAt = statusEvent.timestamp;
      if (statusEvent.status === "FAILED") data.failedAt = statusEvent.timestamp;

      await prisma.whatsAppMessage.update({ where: { id: message.id }, data });

      if (statusEvent.status === "FAILED") {
        await logActivity({ leadId: message.conversation.leadId, type: "WHATSAPP_MESSAGE_FAILED", description: "WhatsApp message delivery failed (reported by Meta)." });
        const lead = await prisma.lead.findUnique({ where: { id: message.conversation.leadId } });
        if (lead?.assignedToId) {
          await createNotification({
            organizationId,
            userId: lead.assignedToId,
            type: "WHATSAPP_MESSAGE_FAILED",
            title: "WhatsApp message failed",
            message: `A message to ${lead.clientName} could not be delivered.`,
            leadId: lead.id,
          });
        }
      }

      await recordAudit({
        action: "OTHER",
        entityType: "WhatsAppMessage",
        entityId: message.id,
        newValues: { event: "whatsapp_status_updated", status: statusEvent.status },
      });
      await markWebhookEventProcessed("META_CLOUD", statusEvent.externalEventId, "PROCESSED");
    } catch (err) {
      await markWebhookEventProcessed("META_CLOUD", statusEvent.externalEventId, "FAILED", err instanceof Error ? err.message : "Unknown error");
    }
  }

  return NextResponse.json({ received: true });
}
