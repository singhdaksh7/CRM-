import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWhatsAppProvider } from "@/integrations/whatsapp";
import { hashPayload, recordWebhookEventOnce, markWebhookEventProcessed } from "@/lib/webhook-events";
import { touchConversationTimestamps } from "@/lib/whatsapp-conversations";
import { handleInboundReplyEffects } from "@/lib/whatsapp-messages";
import { logActivity } from "@/lib/activity";
import { createNotification } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

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

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
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
      const conversation = await prisma.whatsAppConversation.findFirst({
        where: { organizationId, phoneNumber: inbound.from },
        orderBy: { createdAt: "desc" },
      });

      if (!conversation) {
        // No lead has a conversation for this number yet - record the event
        // as ignored rather than silently dropping it, so it's visible to
        // an admin diagnosing why a client's message didn't show up.
        await markWebhookEventProcessed("META_CLOUD", inbound.externalEventId, "IGNORED", `No conversation found for ${inbound.from}`);
        continue;
      }

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

      await markWebhookEventProcessed("META_CLOUD", statusEvent.externalEventId, "PROCESSED");
    } catch (err) {
      await markWebhookEventProcessed("META_CLOUD", statusEvent.externalEventId, "FAILED", err instanceof Error ? err.message : "Unknown error");
    }
  }

  return NextResponse.json({ received: true });
}
