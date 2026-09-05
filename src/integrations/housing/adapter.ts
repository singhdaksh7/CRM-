import "server-only";
import { createHash } from "crypto";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import type { CanonicalPortalLead } from "@/integrations/property-portals/ingestion";
import type { HousingLeadPayload } from "./schema";

export interface HousingMappingResult {
  canonical: CanonicalPortalLead;
  /** Safe, staff-facing summary persisted on the ExternalLeadEvent for review-UI display. Never the raw payload. */
  snapshot: Record<string, unknown>;
  /** True when a value in the payload could not be mapped to a canonical field with confidence and was preserved raw instead of guessed. */
  needsReview: boolean;
  reviewReasons: string[];
}

/** "3 BHK" / "3BHK" / "3 bhk" -> 3. Anything else is left unmapped rather than guessed. */
export function parseBhk(apartmentNames: string): number | undefined {
  const match = apartmentNames.trim().match(/^(\d{1,2})\s*BHK$/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 10 ? value : undefined;
}

/**
 * category_type -> AssetClass. Housing's documented value in the sample
 * payload is "residential"; "commercial" is the only other value this maps
 * with confidence. Anything else defaults to RESIDENTIAL (Lead.assetClass is
 * non-nullable so *some* value must be chosen to create the lead) but is
 * flagged via needsReview and the raw value is always preserved in the
 * snapshot so staff can correct it.
 */
export function mapAssetClass(categoryType: string): { assetClass: "RESIDENTIAL" | "COMMERCIAL"; confident: boolean } {
  const normalized = categoryType.trim().toLowerCase();
  if (normalized === "residential") return { assetClass: "RESIDENTIAL", confident: true };
  if (normalized === "commercial") return { assetClass: "COMMERCIAL", confident: true };
  return { assetClass: "RESIDENTIAL", confident: false };
}

/**
 * service_type -> TransactionType. Housing's "new-projects" and "resale"
 * service types are for-sale enquiries; anything containing "rent" is a
 * rental enquiry. Any other value defaults to SALE (the more common Housing
 * lead type) but is flagged via needsReview with the raw value preserved.
 */
export function mapTransactionType(serviceType: string): { transactionType: "RENT" | "SALE"; confident: boolean } {
  const normalized = serviceType.trim().toLowerCase();
  if (normalized.includes("rent")) return { transactionType: "RENT", confident: true };
  if (normalized === "new-projects" || normalized === "resale" || normalized.includes("sale")) return { transactionType: "SALE", confident: true };
  return { transactionType: "SALE", confident: false };
}

export function round(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return Math.round(value);
}

/** Deterministic identity for a single Housing delivery - Housing's sample payload carries no lead/event id of its own. */
export function deriveHousingEventId(payload: HousingLeadPayload): string {
  const normalizedPhone = normalizeIndianPhone(payload.lead_phone, payload.country_code.replace(/[^\d]/g, "")) ?? payload.lead_phone.replace(/[^\d]/g, "");
  const stable = {
    project_id: String(payload.project_id),
    lead_phone: normalizedPhone,
    lead_email: payload.lead_email?.toLowerCase() ?? null,
    lead_date: payload.lead_date,
    min_price: payload.min_price,
    max_price: payload.max_price,
    locality_name: payload.locality_name.trim().toLowerCase(),
    city_name: payload.city_name.trim().toLowerCase(),
    apartment_names: payload.apartment_names.trim().toLowerCase(),
  };
  return `housing:${createHash("sha256").update(JSON.stringify(stable)).digest("hex")}`;
}

export function mapHousingLead(payload: HousingLeadPayload): HousingMappingResult {
  const reviewReasons: string[] = [];
  const { assetClass, confident: assetClassConfident } = mapAssetClass(payload.category_type);
  if (!assetClassConfident) reviewReasons.push(`Unrecognized category_type "${payload.category_type}" defaulted to RESIDENTIAL`);
  const { transactionType, confident: transactionConfident } = mapTransactionType(payload.service_type);
  if (!transactionConfident) reviewReasons.push(`Unrecognized service_type "${payload.service_type}" defaulted to SALE`);
  const bhk = parseBhk(payload.apartment_names);
  if (bhk === undefined) reviewReasons.push(`apartment_names "${payload.apartment_names}" is not a deterministic BHK count`);

  const normalizedPhone = normalizeIndianPhone(payload.lead_phone, payload.country_code.replace(/[^\d]/g, ""));
  const eventId = deriveHousingEventId(payload);

  const canonical: CanonicalPortalLead = {
    externalEventId: eventId,
    name: payload.lead_name,
    phone: normalizedPhone ?? payload.lead_phone,
    email: payload.lead_email ?? undefined,
    locality: payload.city_name && payload.locality_name !== payload.city_name ? `${payload.locality_name}, ${payload.city_name}` : payload.locality_name,
    minBudget: round(payload.min_price) ?? 0,
    maxBudget: round(payload.max_price) ?? round(payload.min_price) ?? 0,
    assetClass,
    transactionType,
    bhk: assetClass === "RESIDENTIAL" ? bhk : undefined,
    minAreaSqft: round(payload.min_area),
    maxAreaSqft: round(payload.max_area),
  };

  const snapshot: Record<string, unknown> = {
    provider: "HOUSING",
    leadName: payload.lead_name,
    leadPhone: normalizedPhone ?? payload.lead_phone,
    leadEmail: payload.lead_email ?? null,
    projectId: payload.project_id,
    projectName: payload.project_name,
    localityName: payload.locality_name,
    cityName: payload.city_name,
    minBudget: canonical.minBudget,
    maxBudget: canonical.maxBudget,
    minAreaSqft: canonical.minAreaSqft ?? null,
    maxAreaSqft: canonical.maxAreaSqft ?? null,
    bhk: canonical.bhk ?? null,
    apartmentNamesRaw: payload.apartment_names,
    propertyField: payload.property_field,
    serviceTypeRaw: payload.service_type,
    categoryTypeRaw: payload.category_type,
    leadDate: new Date(payload.lead_date * 1000).toISOString(),
  };

  return { canonical, snapshot, needsReview: reviewReasons.length > 0, reviewReasons };
}
