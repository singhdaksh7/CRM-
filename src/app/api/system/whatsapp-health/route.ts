import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getWhatsAppProvider, getWhatsAppConfigStatus } from "@/integrations/whatsapp";
import { listWhatsAppTemplates } from "@/integrations/whatsapp/whatsapp-templates";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * Cheap, no-network config check any signed-in role can call before
 * offering Copy/Open WhatsApp actions in the Demand Pool UI. Reads env vars
 * only - never calls Meta's API and never exposes credentials.
 */
export async function GET() {
  try {
    await requireSession();
    const status = getWhatsAppConfigStatus();
    return NextResponse.json({ configured: status.provider !== "MOCK", providerConfigured: status.provider !== "MOCK", provider: status.provider, status: status.provider });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Admin-only WhatsApp diagnostics. Confirms configuration and (for
 * META_CLOUD) that the access token/phone-number-id/business-account-id are
 * actually accepted by Meta's Graph API - all via read-only GET calls, never
 * sending a real message. Never exposes credentials in the response.
 */
export async function POST() {
  try {
    const session = await requireSession(["ADMIN"]);
    const limitResult = await checkRateLimit("whatsappTestConnection", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const status = getWhatsAppConfigStatus();
    const provider = getWhatsAppProvider();
    const diagnostics = await provider.getDiagnostics();
    const templates = listWhatsAppTemplates().map((t) => ({ useCase: t.useCase, name: t.name, category: t.category, approved: t.approved }));

    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "WhatsAppProvider",
      newValues: { event: "whatsapp_health_check", provider: status.provider, ok: diagnostics.ok },
    });
    logger.info("whatsapp_health_check", { actorId: session.user.id, provider: status.provider, ok: diagnostics.ok });

    return NextResponse.json({ provider: status.provider, webhookEnabled: status.webhookEnabled, ok: diagnostics.ok, details: diagnostics.details, templates });
  } catch (err) {
    return handleApiError(err);
  }
}
