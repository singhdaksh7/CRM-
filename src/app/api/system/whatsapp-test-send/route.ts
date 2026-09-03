import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getWhatsAppProvider, loadWhatsAppConfig } from "@/integrations/whatsapp";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

const testSendSchema = z.object({
  confirm: z.literal(true),
});

/**
 * Admin-only explicit test-send action - deliberately separate from the
 * normal lead-messaging pipeline (no lead is touched, nothing is persisted
 * as a WhatsAppMessage). Sends one real message through whichever provider
 * is active, always to the server-configured WHATSAPP_TEST_RECIPIENT - the
 * caller never supplies a phone number, so this can never be used to
 * message an arbitrary number. Requires an explicit `confirm: true` since
 * this is a real external action with a real cost (Meta conversation
 * pricing) when META_CLOUD is active.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN"]);
    const limitResult = await checkRateLimit("whatsappTestSend", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const body = await req.json();
    testSendSchema.parse(body);

    const config = loadWhatsAppConfig();
    if (!config.testRecipient) {
      throw new ApiError(400, "WHATSAPP_TEST_RECIPIENT is not configured - set it before using the test-send action.");
    }

    const provider = getWhatsAppProvider();
    const result = await provider.sendTextMessage({
      to: config.testRecipient,
      body: "This is a test message from KP Properties to confirm WhatsApp connectivity. No action is needed.",
    });

    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "WhatsAppProvider",
      newValues: { event: "whatsapp_test_send", provider: provider.name, status: result.status },
    });
    logger.info("whatsapp_test_send", { actorId: session.user.id, provider: provider.name, status: result.status });

    return NextResponse.json({ provider: provider.name, status: result.status, clickToChatUrl: result.clickToChatUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
