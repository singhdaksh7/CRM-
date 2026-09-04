import "server-only";
import { createHash } from "crypto";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import type { CanonicalPortalLead } from "@/integrations/property-portals/ingestion";
import type { OlxLeadPayload } from "./schema";

export interface OlxMappingResult {
  canonical: CanonicalPortalLead;
  /** Safe, staff-facing summary persisted on the ExternalLeadEvent for review-UI display. Never the raw payload, never GPS/exact coordinates. */
  snapshot: Record<string, unknown>;
  needsReview: boolean;
  reviewReasons: string[];
}

/**
 * Parses OLX's documented "DD/MM/YY" lead date unambiguously. A 4-digit year
 * is also accepted (schema.ts's regex allows either). Two-digit years use
 * the conventional 70/30 pivot (00-69 -> 20xx, 70-99 -> 19xx) - leads are
 * never plausibly from the 1900s in this system, but the pivot is applied
 * literally rather than assuming "always 20xx" so a malformed/ancient value
 * cannot silently wrap into the future.
 */
export function parseOlxLeadDate(raw: string): Date | null {
  const match = raw.trim().match(/^([0-3]?\d)\/([0-1]?\d)\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) year = year <= 69 ? 2000 + year : 1900 + year;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject impossible dates (e.g. 31/02) that Date would otherwise silently roll forward.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function findParam(parameters: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!parameters) return null;
  for (const [key, value] of Object.entries(parameters)) {
    const normalizedKey = key.toLowerCase();
    if (keys.some((k) => normalizedKey.includes(k)) && typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function inferAssetClass(parameters: Record<string, unknown> | null | undefined): { assetClass: "RESIDENTIAL" | "COMMERCIAL"; confident: boolean } {
  const raw = findParam(parameters, ["category", "propertytype", "type"]);
  if (!raw) return { assetClass: "RESIDENTIAL", confident: false };
  const normalized = raw.toLowerCase();
  if (/(commercial|office|shop|showroom|warehouse|industrial)/.test(normalized)) return { assetClass: "COMMERCIAL", confident: true };
  if (/(residential|flat|apartment|house|villa|plot)/.test(normalized)) return { assetClass: "RESIDENTIAL", confident: true };
  return { assetClass: "RESIDENTIAL", confident: false };
}

function inferTransactionType(parameters: Record<string, unknown> | null | undefined): { transactionType: "RENT" | "SALE"; confident: boolean } {
  const raw = findParam(parameters, ["adtype", "listingtype", "dealtype"]);
  if (!raw) return { transactionType: "SALE", confident: false };
  const normalized = raw.toLowerCase();
  if (normalized.includes("rent") || normalized.includes("lease")) return { transactionType: "RENT", confident: true };
  if (normalized.includes("sale") || normalized.includes("resale") || normalized.includes("sell")) return { transactionType: "SALE", confident: true };
  return { transactionType: "SALE", confident: false };
}

function inferBhk(parameters: Record<string, unknown> | null | undefined): number | undefined {
  const raw = findParam(parameters, ["bhk", "room", "bedroom"]);
  if (!raw) return undefined;
  const match = raw.match(/(\d{1,2})/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 10 ? value : undefined;
}

function round(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return Math.round(value);
}

/**
 * Deterministic identity for an OLX lead when OLX's own response carries no
 * stable per-lead identifier (see Part F of the task: a provider-supplied id
 * is always preferred - see mapOlxLead below, which only falls back to this
 * derived id when payload.leadId/payload.id is absent). Hashes provider +
 * adId + normalized phone + lead date, per the task's exact spec.
 */
export function deriveOlxEventId(payload: OlxLeadPayload, normalizedPhone: string | null): string {
  const stable = {
    adId: String(payload.adId),
    phone: normalizedPhone ?? payload.phoneNumber.replace(/[^\d]/g, ""),
    date: payload.date,
  };
  return `olx:${createHash("sha256").update(JSON.stringify(stable)).digest("hex")}`;
}

export function mapOlxLead(payload: OlxLeadPayload): OlxMappingResult {
  const reviewReasons: string[] = [];

  const normalizedPhone = normalizeIndianPhone(payload.phoneNumber, "91");
  if (!normalizedPhone) reviewReasons.push(`phoneNumber "${payload.phoneNumber.replace(/\d(?=\d{2})/g, "*")}" did not normalize to a plausible Indian number`);

  const leadDate = parseOlxLeadDate(payload.date);
  if (!leadDate) reviewReasons.push(`date "${payload.date}" could not be parsed as DD/MM/YY`);

  const parameters = payload.ad?.parameters ?? null;
  const locality = findParam(parameters, ["locality", "location", "area", "city", "sector", "neighbourhood", "neighborhood"]) ?? payload.ad?.title?.trim() ?? "Unknown (OLX)";
  if (locality === "Unknown (OLX)") reviewReasons.push("no locality/location parameter found on the OLX ad snapshot");

  const { assetClass, confident: assetConfident } = inferAssetClass(parameters);
  if (!assetConfident) reviewReasons.push("asset class could not be confidently inferred from OLX ad parameters; defaulted to RESIDENTIAL");

  const { transactionType, confident: transactionConfident } = inferTransactionType(parameters);
  if (!transactionConfident) reviewReasons.push("transaction type could not be confidently inferred from OLX ad parameters; defaulted to SALE");

  const bhk = inferBhk(parameters);
  const price = round(payload.ad?.price ?? null);

  // Preferred stable id from OLX's own response (Part F) if present; falls back to the derived hash.
  const providerLeadId = payload.leadId ?? payload.id ?? null;
  const externalLeadId = providerLeadId !== null ? String(providerLeadId) : undefined;
  const externalEventId = externalLeadId ?? deriveOlxEventId(payload, normalizedPhone);

  const canonical: CanonicalPortalLead = {
    externalLeadId,
    externalEventId,
    externalListingId: String(payload.adId),
    name: payload.name,
    phone: normalizedPhone ?? payload.phoneNumber,
    email: payload.emailId ?? undefined,
    locality,
    minBudget: price ?? 0,
    maxBudget: price ?? 0,
    assetClass,
    transactionType,
    bhk: assetClass === "RESIDENTIAL" ? bhk : undefined,
    receivedAt: leadDate ?? undefined,
  };

  // Never GPS/exact coordinates, internal notes, credentials, or tokens - deliberately excludes ad.lat/ad.long.
  const snapshot: Record<string, unknown> = {
    provider: "OLX",
    adId: String(payload.adId),
    adTitle: payload.ad?.title ?? null,
    locality,
    price: price ?? null,
    assetClass,
    transactionType,
    bhk: canonical.bhk ?? null,
    leadDateRaw: payload.date,
    leadDateParsed: leadDate ? leadDate.toISOString() : null,
  };

  return { canonical, snapshot, needsReview: reviewReasons.length > 0, reviewReasons };
}
