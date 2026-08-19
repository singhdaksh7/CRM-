import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { ingestPortalLead } from "@/integrations/property-portals/ingestion";
import { housingLeadPayloadSchema } from "@/integrations/housing/schema";
import { mapHousingLead } from "@/integrations/housing/adapter";
import { getHousingOrganizationId, getHousingWebhookSecret, getHousingAllowedIps } from "@/integrations/housing/config";

/**
 * Housing lead-push webhook - Housing calls this endpoint, this app
 * never calls Housing. Housing's documented sample payload carries no
 * authentication, so the endpoint works with zero configuration; an
 * operator can later opt into a shared-secret header and/or IP allowlist
 * purely by setting env vars (see config.ts), never by changing this route.
 *
 * Contract: JSON only, body text exactly "RECEIVED" on success/duplicate,
 * body text exactly "BAD REQUEST" on any malformed/invalid payload. No CRM
 * or internal data, and no stack trace, is ever returned in the response.
 */

const MAX_BODY_BYTES = 256 * 1024;
const PLAIN_TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8" } as const;

function received() {
  return new NextResponse("RECEIVED", { status: 200, headers: PLAIN_TEXT_HEADERS });
}

function badRequest() {
  return new NextResponse("BAD REQUEST", { status: 400, headers: PLAIN_TEXT_HEADERS });
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return new NextResponse("BAD REQUEST", { status: 413, headers: PLAIN_TEXT_HEADERS });

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return badRequest();

  const ip = clientIp(request);
  const rate = await checkRateLimit("housingWebhook", `housing:${ip}`);
  if (!rate.allowed) return rateLimitResponse(rate);

  const allowedIps = getHousingAllowedIps();
  if (allowedIps && !allowedIps.includes(ip)) {
    logger.warn("housing_webhook_ip_rejected", { ip });
    return badRequest();
  }

  const secret = getHousingWebhookSecret();
  if (secret && request.headers.get("x-housing-webhook-secret") !== secret) {
    logger.warn("housing_webhook_secret_rejected", { ip });
    return badRequest();
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new NextResponse("BAD REQUEST", { status: 413, headers: PLAIN_TEXT_HEADERS });
    rawBody = JSON.parse(text);
  } catch {
    return badRequest();
  }

  const parsed = housingLeadPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    logger.warn("housing_webhook_validation_failed", { ip, issueCount: parsed.error.issues.length });
    return badRequest();
  }

  try {
    const { canonical, snapshot, needsReview, reviewReasons } = mapHousingLead(parsed.data);
    const organizationId = getHousingOrganizationId();

    const result = await ingestPortalLead(organizationId, "HOUSING", canonical, rawBody, snapshot);

    await recordAudit({
      action: "CREATE",
      entityType: "ExternalLeadEvent",
      entityId: result.event.id,
      newValues: { event: "HOUSING_LEAD_RECEIVED", resolution: result.status, hasPhone: Boolean(canonical.phone), hasEmail: Boolean(canonical.email), needsReview, reviewReasons },
    });

    if (result.status === "NEW") {
      await recordAudit({ action: "CREATE", entityType: "Lead", entityId: result.lead.id, newValues: { event: "HOUSING_LEAD_AUTO_CREATED", externalLeadEventId: result.event.id } });
    } else if (result.status === "MATCHED_EXISTING") {
      await recordAudit({ action: "UPDATE", entityType: "ExternalLeadEvent", entityId: result.event.id, newValues: { event: "HOUSING_LEAD_MATCHED_EXISTING" } });
    } else if (result.status === "AMBIGUOUS") {
      await recordAudit({ action: "UPDATE", entityType: "ExternalLeadEvent", entityId: result.event.id, newValues: { event: "HOUSING_LEAD_AMBIGUOUS_NEEDS_REVIEW", candidateCount: result.candidates?.length ?? 0 } });
    }

    // Every branch above (NEW, MATCHED_EXISTING, AMBIGUOUS, DUPLICATE) is a
    // successful, safely-idempotent receipt from Housing's point of view -
    // Housing only ever needs to know the delivery landed, not how the CRM
    // resolved it internally.
    return received();
  } catch (error) {
    logger.error("housing_webhook_ingestion_failed", { message: error instanceof Error ? error.message : String(error) });
    // A valid payload we failed to process is our fault, not Housing's - ask
    // for a retry via 5xx rather than telling Housing the payload was bad.
    return new NextResponse("ERROR", { status: 500, headers: PLAIN_TEXT_HEADERS });
  }
}
