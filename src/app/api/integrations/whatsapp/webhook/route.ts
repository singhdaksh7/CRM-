import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppProvider, loadWhatsAppConfig } from "@/integrations/whatsapp";
import { hashPayload, recordWebhookEventOnce, markWebhookEventProcessed } from "@/lib/webhook-events";
import { resolveInboundConversation, recordInboundMessage, updateDeliveryStatus, sanitizeMediaFilename, validateInboundMedia } from "@/lib/whatsapp-inbox";
import { recordAudit } from "@/lib/audit";
import { getSystemOrganizationId } from "@/lib/organization";
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
  // No CRM user session on an inbound Meta webhook call - trusted system
  // context, same pattern as the Housing integration's own resolver.
  const organizationId = getSystemOrganizationId();
  logger.info("whatsapp_webhook_received", { messageCount: messages.length, statusCount: statuses.length });

  for (const inbound of messages) {
    const { isNew } = await recordWebhookEventOnce({
      organizationId,
      provider: "META_CLOUD",
      externalEventId: inbound.externalEventId,
      eventType: "message",
      payloadHash: hashPayload(rawBody),
    });
    if (!isNew) continue; // already processed - Meta retries deliveries, this must be a no-op

    try {
      const configuredPhoneNumberId = loadWhatsAppConfig().phoneNumberId;
      if (inbound.providerPhoneNumberId && configuredPhoneNumberId && inbound.providerPhoneNumberId !== configuredPhoneNumberId) {
        await markWebhookEventProcessed("META_CLOUD", inbound.externalEventId, "IGNORED", "Provider phone-number context did not match this CRM configuration");
        continue;
      }
      const conversation = await resolveInboundConversation({ organizationId, phoneNumber: inbound.from, displayName: inbound.displayName, providerPhoneNumberId: inbound.providerPhoneNumberId });
      const messageType = inbound.kind === "image" ? "IMAGE" : inbound.kind === "document" ? "DOCUMENT" : inbound.kind === "interactive_reply" || inbound.kind === "button_reply" ? "INTERACTIVE" : "TEXT";
      if (inbound.media?.mimeType && (messageType === "IMAGE" || messageType === "DOCUMENT")) validateInboundMedia(messageType, inbound.media.mimeType);
      await recordInboundMessage({
        organizationId,
        conversationId: conversation.id,
        providerMessageId: inbound.providerMessageId,
        content: inbound.text,
        messageType,
        timestamp: inbound.timestamp,
        caption: inbound.media?.caption,
        mediaMimeType: inbound.media?.mimeType,
        mediaFilename: inbound.media?.filename ? sanitizeMediaFilename(inbound.media.filename) : undefined,
        providerMetadata: inbound.media ? { mediaId: inbound.media.id, storage: "provider-private" } : undefined,
      });
      await markWebhookEventProcessed("META_CLOUD", inbound.externalEventId, "PROCESSED");
    } catch (err) {
      await markWebhookEventProcessed("META_CLOUD", inbound.externalEventId, "FAILED", err instanceof Error ? err.message : "Unknown error");
      logger.error("whatsapp_webhook_message_failed", { externalEventId: inbound.externalEventId, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  for (const statusEvent of statuses) {
    const { isNew } = await recordWebhookEventOnce({
      organizationId,
      provider: "META_CLOUD",
      externalEventId: statusEvent.externalEventId,
      eventType: "status",
      payloadHash: hashPayload(rawBody),
    });
    if (!isNew) continue;

    try {
      const result = await updateDeliveryStatus({ organizationId, providerMessageId: statusEvent.providerMessageId, status: statusEvent.status as "SENT" | "DELIVERED" | "READ" | "FAILED", timestamp: statusEvent.timestamp, errorCode: statusEvent.errorCode, errorMessage: statusEvent.errorMessage });
      if (!result.message) {
        await markWebhookEventProcessed("META_CLOUD", statusEvent.externalEventId, "IGNORED", `No message found for provider ID ${statusEvent.providerMessageId}`);
        continue;
      }

      // Reject a stale/out-of-order status regression (e.g. a delayed
      // "delivered" arriving after "read" already landed) - only apply
      // forward progress.
      if (!result.applied) {
        await markWebhookEventProcessed(
          "META_CLOUD",
          statusEvent.externalEventId,
          "IGNORED",
          `Stale status regression ignored (current=${result.message.status}, incoming=${statusEvent.status})`
        );
        continue;
      }

      await recordAudit({
        action: "OTHER",
        entityType: "WhatsAppMessage",
        entityId: result.message.id,
        newValues: { event: "whatsapp_status_updated", status: statusEvent.status },
      });
      await markWebhookEventProcessed("META_CLOUD", statusEvent.externalEventId, "PROCESSED");
    } catch (err) {
      await markWebhookEventProcessed("META_CLOUD", statusEvent.externalEventId, "FAILED", err instanceof Error ? err.message : "Unknown error");
    }
  }

  return NextResponse.json({ received: true });
}
