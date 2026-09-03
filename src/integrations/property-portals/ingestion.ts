import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { autoAssignLead } from "@/lib/assignment";
import { logger } from "@/lib/logger";
import type { PropertyPortalProviderId } from "./registry";

export type CanonicalPortalLead = { provider?: PropertyPortalProviderId; externalLeadId?: string; externalEventId?: string; externalListingId?: string; name: string; phone?: string; email?: string; message?: string; enquiryType?: string; receivedAt?: Date; safeSourceMetadata?: Record<string, unknown>; locality: string; minBudget: number; maxBudget: number; assetClass: "RESIDENTIAL" | "COMMERCIAL"; transactionType: "RENT" | "SALE"; bhk?: number; commercialPropertyType?: string; minAreaSqft?: number; maxAreaSqft?: number };
export type PortalCandidate = { id: string; clientName: string };

/** Pure decision point: ambiguous people are never auto-created or merged. */
export function resolvePortalLead(candidates: PortalCandidate[]) {
  if (candidates.length === 1) return "MATCHED_EXISTING" as const;
  if (candidates.length > 1) return "AMBIGUOUS" as const;
  return "NEW" as const;
}

function leadSource(provider: PropertyPortalProviderId) { return provider === "NINETY_NINE_ACRES" ? "ACRES_99" : provider === "HOUSING" ? "HOUSING_COM" : provider; }

type IngestionContext = { connectionId?: string; snapshot?: Record<string, unknown> };

export async function ingestPortalLead(organizationId: string, provider: PropertyPortalProviderId, input: CanonicalPortalLead, rawPayload: unknown, context: IngestionContext | Record<string, unknown> = {}) {
  // Backwards compatible with Housing's existing fifth `snapshot` argument.
  const options: IngestionContext = "snapshot" in context || "connectionId" in context ? context as IngestionContext : { snapshot: context };
  const rawPayloadHash = createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex");
  // Preserve Housing's stored external IDs; connection-backed providers namespace
  // their event id so two authorized accounts cannot collide within a tenant.
  const scopedEventId = input.externalEventId ? (options.connectionId ? `${options.connectionId}:${input.externalEventId}` : input.externalEventId) : undefined;
  const existingEvent = input.externalEventId
    ? await prisma.externalLeadEvent.findUnique({ where: { organizationId_provider_externalEventId: { organizationId, provider, externalEventId: scopedEventId! } } })
    : await prisma.externalLeadEvent.findFirst({ where: { organizationId, provider, rawPayloadHash }, orderBy: { createdAt: "desc" } });
  if (existingEvent) return { status: "DUPLICATE" as const, event: existingEvent };
  const phone = input.phone ? normalizeIndianPhone(input.phone) : null;
  const filters = [] as Array<{ phone?: { contains: string }; email?: { equals: string; mode: "insensitive" }; portalProvider?: PropertyPortalProviderId; externalLeadId?: string }>;
  if (input.externalLeadId) filters.push({ portalProvider: provider, externalLeadId: input.externalLeadId });
  if (phone) filters.push({ phone: { contains: phone.slice(-10) } });
  if (input.email) filters.push({ email: { equals: input.email.trim(), mode: "insensitive" } });
  const candidates = filters.length ? await prisma.lead.findMany({ where: { organizationId, OR: filters }, select: { id: true, clientName: true }, take: 3 }) : [];
  const deduped = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  const resolution = resolvePortalLead(deduped);
  const linkedLead = resolution === "MATCHED_EXISTING" ? deduped[0] : null;
  const leadSnapshot = options.snapshot ? JSON.stringify(options.snapshot).slice(0, 4000) : null;
  const listingClient = (prisma as unknown as { portalListing?: { findMany: (args: unknown) => Promise<Array<{ id: string }>> } }).portalListing;
  const listings = input.externalListingId && listingClient
    ? await listingClient.findMany({ where: { organizationId, provider, externalListingId: input.externalListingId, ...(options.connectionId ? { connectionId: options.connectionId } : {}) }, select: { id: true }, take: 2 })
    : [];
  const portalListingId = listings.length === 1 ? listings[0].id : null;
  const listingStatus = !input.externalListingId ? "NOT_PROVIDED" : listings.length === 1 ? "MATCHED" : listings.length === 0 ? "UNKNOWN_LISTING" : "AMBIGUOUS_LISTING";
  // Demand Pool identity check: an exact normalizedPhone match against the
  // long-lived CustomerContact pool (never fuzzy, never created here) so a
  // Lead we create/link never represents a second identity for someone the
  // desk already knows. Read-only lookup - Housing/portal ingestion never
  // creates or mutates a CustomerContact.
  const existingContact = phone
    ? await prisma.customerContact.findUnique({ where: { organizationId_normalizedPhone: { organizationId, normalizedPhone: phone } }, select: { id: true } })
    : null;
  const event = await prisma.externalLeadEvent.create({ data: { organizationId, connectionId: options.connectionId ?? null, portalListingId, provider, externalLeadId: input.externalLeadId ?? null, externalEventId: scopedEventId ?? null, externalListingId: input.externalListingId ?? null, receivedAt: input.receivedAt ?? new Date(), rawPayloadHash, message: input.message?.slice(0, 2000) ?? null, leadSnapshot, leadId: linkedLead?.id ?? null, ingestionStatus: resolution, failureReason: listingStatus === "MATCHED" || listingStatus === "NOT_PROVIDED" ? null : listingStatus } });
  if (resolution !== "NEW") return { status: resolution, event, candidates: deduped };
  const lead = await prisma.lead.create({ data: { organizationId, leadCode: `LEAD-PORTAL-${Date.now()}`, clientName: input.name, phone: phone ?? "UNVERIFIED-PORTAL", email: input.email ?? null, source: leadSource(provider), externalLeadId: input.externalLeadId ?? null, externalListingId: input.externalListingId ?? null, portalProvider: provider, rawPayloadHash, receivedAt: new Date(), requirementType: input.transactionType === "RENT" ? "RENT" : "BUY", transactionType: input.transactionType, assetClass: input.assetClass, preferredLocation: input.locality, minBudget: input.minBudget, maxBudget: input.maxBudget, preferredBhk: input.assetClass === "RESIDENTIAL" ? input.bhk ?? null : null, commercialPropertyType: input.assetClass === "COMMERCIAL" ? input.commercialPropertyType as never : null, minAreaSqft: input.minAreaSqft ?? null, maxAreaSqft: input.maxAreaSqft ?? null, customerContactId: existingContact?.id ?? null } });
  await prisma.externalLeadEvent.update({ where: { id: event.id }, data: { leadId: lead.id, ingestionStatus: "RECEIVED" } });

  // A6 - consistent assignment: every genuinely NEW lead enters the SAME
  // assignment orchestration as a manually-created one (POST /api/leads),
  // not a second algorithm. Best-effort: a webhook delivery must still
  // succeed (and not be retried/dead-lettered) even if assignment fails -
  // a lead that fails to auto-assign is simply left unassigned, exactly
  // like any other lead with no eligible/available field executive, and
  // is discoverable through the existing "unassigned leads" views.
  try {
    await autoAssignLead(lead.id, organizationId);
  } catch (err) {
    logger.error("portal_lead_auto_assign_failed", { leadId: lead.id, provider, message: err instanceof Error ? err.message : String(err) });
  }

  return { status: "NEW" as const, lead, event: { ...event, leadId: lead.id, ingestionStatus: "RECEIVED" } };
}
