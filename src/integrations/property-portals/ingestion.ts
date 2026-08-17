import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import type { PropertyPortalProviderId } from "./registry";

export type CanonicalPortalLead = { externalLeadId?: string; externalEventId?: string; externalListingId?: string; name: string; phone?: string; email?: string; locality: string; minBudget: number; maxBudget: number; assetClass: "RESIDENTIAL" | "COMMERCIAL"; transactionType: "RENT" | "SALE"; bhk?: number; commercialPropertyType?: string; message?: string };
export type PortalCandidate = { id: string; clientName: string };

/** Pure decision point: ambiguous people are never auto-created or merged. */
export function resolvePortalLead(candidates: PortalCandidate[]) {
  if (candidates.length === 1) return "MATCHED_EXISTING" as const;
  if (candidates.length > 1) return "AMBIGUOUS" as const;
  return "NEW" as const;
}

function leadSource(provider: PropertyPortalProviderId) { return provider === "NINETY_NINE_ACRES" ? "ACRES_99" : provider === "HOUSING" ? "HOUSING_COM" : provider; }

export async function ingestPortalLead(organizationId: string, provider: PropertyPortalProviderId, input: CanonicalPortalLead, rawPayload: unknown) {
  const rawPayloadHash = createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex");
  const existingEvent = input.externalEventId
    ? await prisma.externalLeadEvent.findUnique({ where: { organizationId_provider_externalEventId: { organizationId, provider, externalEventId: input.externalEventId } } })
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
  const event = await prisma.externalLeadEvent.create({ data: { organizationId, provider, externalLeadId: input.externalLeadId ?? null, externalEventId: input.externalEventId ?? null, externalListingId: input.externalListingId ?? null, rawPayloadHash, message: input.message?.slice(0, 2000) ?? null, leadId: linkedLead?.id ?? null, ingestionStatus: resolution } });
  if (resolution !== "NEW") return { status: resolution, event, candidates: deduped };
  const lead = await prisma.lead.create({ data: { organizationId, leadCode: `LEAD-PORTAL-${Date.now()}`, clientName: input.name, phone: phone ?? "UNVERIFIED-PORTAL", email: input.email ?? null, source: leadSource(provider), externalLeadId: input.externalLeadId ?? null, externalListingId: input.externalListingId ?? null, portalProvider: provider, rawPayloadHash, receivedAt: new Date(), requirementType: input.transactionType === "RENT" ? "RENT" : "BUY", transactionType: input.transactionType, assetClass: input.assetClass, preferredLocation: input.locality, minBudget: input.minBudget, maxBudget: input.maxBudget, preferredBhk: input.assetClass === "RESIDENTIAL" ? input.bhk ?? null : null, commercialPropertyType: input.assetClass === "COMMERCIAL" ? input.commercialPropertyType as never : null } });
  await prisma.externalLeadEvent.update({ where: { id: event.id }, data: { leadId: lead.id, ingestionStatus: "RECEIVED" } });
  return { status: "NEW" as const, lead, event: { ...event, leadId: lead.id, ingestionStatus: "RECEIVED" } };
}
