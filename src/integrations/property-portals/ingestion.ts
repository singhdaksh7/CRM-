import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import type { PropertyPortalProviderId } from "./registry";

export type CanonicalPortalLead = {
  externalLeadId?: string; externalEventId?: string; externalListingId?: string;
  name: string; phone?: string; email?: string; locality: string; minBudget: number; maxBudget: number;
  assetClass: "RESIDENTIAL" | "COMMERCIAL"; transactionType: "RENT" | "SALE";
  bhk?: number; commercialPropertyType?: string; message?: string;
};

export async function ingestPortalLead(organizationId: string, provider: PropertyPortalProviderId, input: CanonicalPortalLead, rawPayload: unknown) {
  const rawPayloadHash = createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex");
  const existingEvent = input.externalEventId ? await prisma.externalLeadEvent.findUnique({ where: { organizationId_provider_externalEventId: { organizationId, provider, externalEventId: input.externalEventId } } }) : null;
  if (existingEvent) return { status: "DUPLICATE" as const, event: existingEvent };
  const phone = input.phone ? normalizeIndianPhone(input.phone) : null;
  const candidates = phone ? await prisma.lead.findMany({ where: { organizationId, phone: { contains: phone.slice(-10) } }, take: 2 }) : [];
  const confident = candidates.length === 1 ? candidates[0] : null;
  const lead = confident ?? await prisma.lead.create({ data: {
    organizationId, leadCode: `LEAD-PORTAL-${Date.now()}`, clientName: input.name, phone: phone ?? "UNVERIFIED-PORTAL",
    email: input.email ?? null, source: provider === "NINETY_NINE_ACRES" ? "ACRES_99" : provider === "HOUSING" ? "HOUSING_COM" : provider,
    externalLeadId: input.externalLeadId ?? null, externalListingId: input.externalListingId ?? null, portalProvider: provider,
    rawPayloadHash, receivedAt: new Date(), requirementType: input.transactionType === "RENT" ? "RENT" : "BUY", transactionType: input.transactionType,
    assetClass: input.assetClass, preferredLocation: input.locality, minBudget: input.minBudget, maxBudget: input.maxBudget,
    preferredBhk: input.assetClass === "RESIDENTIAL" ? input.bhk ?? null : null, commercialPropertyType: input.assetClass === "COMMERCIAL" ? input.commercialPropertyType as never : null,
  } });
  const event = await prisma.externalLeadEvent.create({ data: { organizationId, provider, externalLeadId: input.externalLeadId ?? null, externalEventId: input.externalEventId ?? null, externalListingId: input.externalListingId ?? null, rawPayloadHash, message: input.message ?? null, leadId: lead.id, ingestionStatus: confident ? "MATCHED_EXISTING" : candidates.length > 1 ? "NEEDS_REVIEW" : "RECEIVED" } });
  return { status: event.ingestionStatus, lead, event };
}
