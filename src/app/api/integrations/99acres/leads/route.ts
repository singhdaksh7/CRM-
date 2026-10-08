import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity";
import { recalculateLeadScore } from "@/lib/scoring";
import { runMatchingForLead } from "@/lib/lead-matching";
import { runAutomationRules } from "@/lib/automation-rules";
import { notifyRoles } from "@/lib/notifications";
import { captureUnmappedPortalEvent, ingestPortalLead } from "@/integrations/property-portals/ingestion";
import { AUTH_CHALLENGE, checkAcres99Authorization, getAcres99OrganizationId, getAcres99WebhookSecret } from "@/integrations/ninety-nine-acres/config";
import { MAX_BODY_BYTES, parseBody, readCappedText, sanitizePayload } from "@/integrations/ninety-nine-acres/payload";
import { mapAcres99Lead } from "@/integrations/ninety-nine-acres/adapter";

/**
 * 99acres inbound lead webhook - 99acres calls this endpoint, this app never
 * calls 99acres and never contacts the customer as a result of a delivery.
 *
 *   request -> HTTPS + rate limit -> bearer auth -> capped body parse
 *           -> sanitised raw capture -> 99acres adapter -> shared portal
 *              ingestion (ExternalLeadEvent + Lead) -> internal workflows
 *
 * 99acres supplied no API documentation, so the adapter recognises common
 * field aliases and the sanitised raw payload is always stored on the
 * ExternalLeadEvent; a delivery that cannot yet be mapped is acknowledged as
 * "received" instead of being lost. The tenant comes from server config only.
 *
 * Responses are deliberately tiny and carry no internal ids or error detail.
 */

const SNAPSHOT_MAX_CHARS = 200_000;
const SOURCE = "99acres";

const json = (body: Record<string, unknown>, status: number, headers?: Record<string, string>) => NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
const ok = (status: "created" | "duplicate" | "received") => json({ success: true, status }, 200);
const fail = (status: number, error: string, headers?: Record<string, string>) => json({ success: false, error }, status, headers);

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/** Internal, staff-facing follow-through for a newly created lead. Each step is best-effort: a delivery must still be acknowledged. */
async function runInternalWorkflows(lead: { id: string; clientName: string; preferredLocation: string }, organizationId: string) {
  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      logger.error("acres99_workflow_step_failed", { step: name, leadId: lead.id, message: error instanceof Error ? error.message : String(error) });
    }
  };
  await step("activity", () => logActivity({ leadId: lead.id, organizationId, type: "LEAD_RECEIVED", description: "Lead received via 99acres webhook" }));
  await step("score", () => recalculateLeadScore(lead.id, "LEAD_CREATED"));
  await step("matching", () => runMatchingForLead(lead.id, "created"));
  await step("automation", () => runAutomationRules({ trigger: "LEAD_CREATED", leadId: lead.id, organizationId }));
  await step("notify", () => notifyRoles(["ADMIN", "DATA_MANAGER"], { organizationId, type: "NEW_LEAD", title: "New lead received", message: `${lead.clientName} - ${lead.preferredLocation} (99acres)`, leadId: lead.id }));
}

export async function POST(request: NextRequest) {
  // HTTPS only in production. TLS ends at the reverse proxy, which reports the original scheme.
  if (process.env.NODE_ENV === "production") {
    const proto = request.headers.get("x-forwarded-proto");
    if (proto && proto.split(",")[0].trim().toLowerCase() !== "https") return fail(403, "https_required");
  }

  const ip = clientIp(request);
  const rate = await checkRateLimit("acres99Webhook", `acres99:${ip}`);
  if (!rate.allowed) return rateLimitResponse(rate);

  const secret = getAcres99WebhookSecret();
  if (!secret) {
    logger.error("acres99_webhook_not_configured");
    return fail(503, "not_configured");
  }
  const auth = checkAcres99Authorization(request.headers.get("authorization"), secret);
  if (auth === "missing") return fail(401, "unauthorized", { "www-authenticate": AUTH_CHALLENGE });
  if (auth === "invalid") {
    logger.warn("acres99_webhook_auth_rejected", { ip });
    return fail(403, "forbidden");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return fail(413, "payload_too_large");
  const body = await readCappedText(request);
  if ("tooLarge" in body) return fail(413, "payload_too_large");

  const parsed = parseBody(body.text, request.headers.get("content-type") ?? "");
  if (!parsed.ok) return fail(parsed.status, parsed.reason === "unsupported_media_type" ? "unsupported_media_type" : "invalid_payload");

  try {
    const organizationId = getAcres99OrganizationId();
    const sanitized = sanitizePayload(parsed.payload, secret) as Record<string, unknown>;
    const mapping = mapAcres99Lead(parsed.payload);
    // Staff-facing snapshot = mapped summary + the full sanitised payload (the reason the adapter can be fixed after the first real request).
    const snapshot = { ...mapping.snapshot, receivedFormat: parsed.format, rawPayload: sanitized };

    if (!mapping.canonical) {
      const captured = await captureUnmappedPortalEvent(organizationId, "NINETY_NINE_ACRES", { externalLeadId: mapping.externalLeadId, externalEventId: mapping.eventId, externalListingId: mapping.externalListingId, receivedAt: mapping.receivedAt, message: mapping.message, reason: mapping.unmappableReason ?? "unmappable" }, sanitized, snapshot, SNAPSHOT_MAX_CHARS);
      if (captured.status === "CAPTURED") {
        await recordAudit({ action: "CREATE", entityType: "ExternalLeadEvent", entityId: captured.event.id, organizationId, newValues: { event: "ACRES99_LEAD_RECEIVED_UNMAPPED", reason: mapping.unmappableReason, source: SOURCE } });
        logger.warn("acres99_webhook_received_unmapped", { reason: mapping.unmappableReason });
      }
      return ok("received");
    }

    const result = await ingestPortalLead(organizationId, "NINETY_NINE_ACRES", mapping.canonical, sanitized, { snapshot, snapshotMaxChars: SNAPSHOT_MAX_CHARS });

    await recordAudit({ action: "CREATE", entityType: "ExternalLeadEvent", entityId: result.event.id, organizationId, newValues: { event: "ACRES99_LEAD_RECEIVED", resolution: result.status, hasPhone: mapping.hasPhone, hasEmail: mapping.hasEmail, needsReview: mapping.needsReview, reviewReasons: mapping.reviewReasons, source: SOURCE } });

    if (result.status === "NEW") {
      await recordAudit({ action: "CREATE", entityType: "Lead", entityId: result.lead.id, organizationId, newValues: { event: "ACRES99_LEAD_AUTO_CREATED", externalLeadEventId: result.event.id } });
      await runInternalWorkflows(result.lead, organizationId);
      return ok("created");
    }
    if (result.status === "AMBIGUOUS") {
      await recordAudit({ action: "UPDATE", entityType: "ExternalLeadEvent", entityId: result.event.id, organizationId, newValues: { event: "ACRES99_LEAD_AMBIGUOUS_NEEDS_REVIEW", candidateCount: result.candidates?.length ?? 0 } });
      return ok("received");
    }
    if (result.status === "MATCHED_EXISTING") {
      await recordAudit({ action: "UPDATE", entityType: "ExternalLeadEvent", entityId: result.event.id, organizationId, newValues: { event: "ACRES99_LEAD_MATCHED_EXISTING" } });
    }
    // DUPLICATE (replayed delivery) and MATCHED_EXISTING (same person already in the CRM): no new Lead was created.
    return ok("duplicate");
  } catch (error) {
    // Two concurrent retries of one delivery race on the (organization, provider, eventId) unique key: the loser is a duplicate, not a failure.
    if (isUniqueViolation(error)) return ok("duplicate");
    logger.error("acres99_webhook_ingestion_failed", { message: error instanceof Error ? error.message : String(error) });
    // Our fault, not 99acres' - 5xx invites a retry, which is safe because ingestion is idempotent.
    return fail(500, "internal_error");
  }
}
