import "server-only";
import { createHash } from "crypto";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { normalizeLocality } from "@/lib/locality";
import { parseMoney } from "@/lib/inventory-import-core";
import { mapAssetClass, mapTransactionType, parseBhk, round } from "./adapter";
import type { CanonicalPortalLead } from "@/integrations/property-portals/ingestion";
import type { HousingFileImportColumn } from "./file-import-schema";

/**
 * Dedicated Housing lead EXPORT FILE adapter/normalizer. Deliberately
 * separate from ./adapter.ts (the live webhook mapper) because the file
 * export uses a different, staff-uploaded column set (a single "Price"
 * instead of min/max_price, a free-text "Configuration" instead of
 * "apartment_names", epoch-less "Lead Date", plus Seller/status/address
 * columns the webhook payload doesn't carry) - but it deliberately REUSES
 * the webhook adapter's asset-class/transaction-type/BHK mapping helpers
 * (mapAssetClass, mapTransactionType, parseBhk) so "residential"/"rent"/
 * "3 BHK"-shaped values are interpreted identically everywhere in the app,
 * per the "architecturally compatible with the existing Housing webhook"
 * requirement. Nothing here writes to the DB - see ../../lib/housing-import.ts
 * for orchestration (dedup lookups, ImportJob/ImportRecord, ingestPortalLead).
 */

export type HousingFileRow = Partial<Record<HousingFileImportColumn, string>>;

export interface HousingFileMappingResult {
  /** Present only when the row could be turned into a lead at all (name + a plausible phone + a non-empty locality). */
  canonical?: CanonicalPortalLead;
  /** Deterministic identity for this row - see deriveHousingFileEventId. Always present, even for rows that fail validation, so preview-time "duplicate in this file" detection works uniformly. */
  dedupeEventId: string;
  /** Safe, staff-facing summary for ExternalLeadEvent.leadSnapshot / preview table. Never includes Address (spec: Address must never become public/exact-address info) and is capped in size before persistence by the caller. */
  snapshot: Record<string, unknown>;
  /** Housing Notes text, if present - the caller decides whether/how to copy it into Lead.notes with a "Housing Import" provenance marker. */
  notes: string | null;
  /** Hard validation failures - row cannot be imported at all. */
  errors: string[];
  /** Soft findings - row IS imported, but a value could not be mapped with confidence and was preserved raw rather than guessed. */
  reviewReasons: string[];
  needsReview: boolean;
}

function normalizeEmail(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Explicit, non-guessing date parse. Accepts ISO (yyyy-mm-dd[...]) and the
 * documented Housing export convention of dd/mm/yyyy or dd-mm-yyyy -
 * deliberately does NOT attempt to disambiguate mm/dd/yyyy-shaped input
 * (that would be a silent misinterpretation of an ambiguous date, which the
 * spec explicitly forbids). Anything else is left unparsed: the raw string
 * is always preserved regardless of whether parsing succeeded.
 */
export function parseHousingLeadDate(raw: string): { iso: string | null; ambiguous: boolean } {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return { iso: parsed.toISOString(), ambiguous: false };
  }
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(parsed.getTime()) && parsed.getUTCDate() === day) return { iso: parsed.toISOString(), ambiguous: false };
    }
  }
  return { iso: null, ambiguous: true };
}

/**
 * Deterministic dedup identity for one Housing FILE-import row. Per spec:
 * Property/Project ID is a LISTING identifier, not a lead identifier, so it
 * is never used alone - it is combined with the normalized phone, the
 * (raw, never-reparsed) lead date string, and locality/configuration as
 * additional stable attributes. The exact same row re-uploaded (same file
 * uploaded twice, or the same row appearing in a later overlapping export)
 * always produces the same id; two rows that differ in any of these
 * attributes (e.g. same phone enquiring about a different property, or on a
 * different date) always produce a different id, so they are never
 * silently collapsed into one lead. Namespaced "housing-import:" (distinct
 * from the webhook's "housing:" ids in ./adapter.ts) so a file-imported row
 * and a webhook delivery are never mistaken for the exact same delivery,
 * even though ingestPortalLead's phone-based matching can still associate
 * them with the same underlying Lead.
 */
export function deriveHousingFileEventId(row: HousingFileRow): string {
  const normalizedPhone = row["Lead Phone Number"] ? normalizeIndianPhone(row["Lead Phone Number"]) ?? row["Lead Phone Number"].replace(/[^\d]/g, "") : "";
  const stable = {
    phone: normalizedPhone,
    projectId: (row["Property/Project ID"] ?? "").trim().toLowerCase(),
    leadDateRaw: (row["Lead Date"] ?? "").trim().toLowerCase(),
    locality: (row["Locality"] ?? "").trim().toLowerCase(),
    city: (row["City"] ?? "").trim().toLowerCase(),
    configuration: (row["Configuration"] ?? "").trim().toLowerCase(),
  };
  return `housing-import:${createHash("sha256").update(JSON.stringify(stable)).digest("hex")}`;
}

export function normalizeHousingFileRow(row: HousingFileRow): HousingFileMappingResult {
  const errors: string[] = [];
  const reviewReasons: string[] = [];
  const dedupeEventId = deriveHousingFileEventId(row);

  const name = (row["Lead Name"] ?? "").trim();
  if (!name) errors.push("Lead Name is required");

  const phoneRaw = (row["Lead Phone Number"] ?? "").trim();
  const normalizedPhone = phoneRaw ? normalizeIndianPhone(phoneRaw) : null;
  if (!phoneRaw) errors.push("Lead Phone Number is required");
  else if (!normalizedPhone) errors.push(`Lead Phone Number "${phoneRaw}" is not a plausible Indian mobile number`);

  const localityRaw = (row["Locality"] ?? "").trim();
  if (!localityRaw) errors.push("Locality is required"); // never auto-create an empty/blank locality
  const locality = normalizeLocality(localityRaw);
  const cityRaw = (row["City"] ?? "").trim();

  const email = normalizeEmail(row["Lead Email"]);
  if (row["Lead Email"]?.trim() && !email) reviewReasons.push(`Lead Email "${row["Lead Email"]}" is not a plausible email address - dropped, not guessed`);

  const { iso: leadDateIso, ambiguous: leadDateAmbiguous } = row["Lead Date"] ? parseHousingLeadDate(row["Lead Date"]) : { iso: null, ambiguous: false };
  if (row["Lead Date"] && leadDateAmbiguous) reviewReasons.push(`Lead Date "${row["Lead Date"]}" is not an unambiguous ISO or dd/mm/yyyy date - original value preserved, not guessed`);

  const propertyTypeRaw = (row["Property Type"] ?? "").trim();
  const { assetClass, confident: assetClassConfident } = propertyTypeRaw ? mapAssetClass(propertyTypeRaw) : { assetClass: "RESIDENTIAL" as const, confident: true };
  if (propertyTypeRaw && !assetClassConfident) reviewReasons.push(`Unrecognized Property Type "${propertyTypeRaw}" defaulted to RESIDENTIAL - original value preserved`);

  const serviceTypeRaw = (row["Service Type"] ?? "").trim();
  const { transactionType, confident: transactionConfident } = serviceTypeRaw ? mapTransactionType(serviceTypeRaw) : { transactionType: "SALE" as const, confident: true };
  if (serviceTypeRaw && !transactionConfident) reviewReasons.push(`Unrecognized Service Type "${serviceTypeRaw}" defaulted to SALE - original value preserved`);

  const configurationRaw = (row["Configuration"] ?? "").trim();
  const bhk = configurationRaw ? parseBhk(configurationRaw) : undefined;
  if (configurationRaw && bhk === undefined && assetClass === "RESIDENTIAL") reviewReasons.push(`Configuration "${configurationRaw}" is not a deterministic BHK count - original value preserved`);

  const priceRaw = (row["Price"] ?? "").trim();
  const parsedPrice = priceRaw ? parseMoney(priceRaw) : null;
  if (priceRaw && parsedPrice === null) reviewReasons.push(`Price "${priceRaw}" could not be parsed to a numeric budget - original value preserved, budget left unset`);
  const budget = round(parsedPrice ?? undefined) ?? 0;

  const primaryStatusRaw = (row["primary_lead_status"] ?? "").trim();
  const secondaryStatusRaw = (row["secondary_lead_status"] ?? "").trim();
  const notes = (row["Notes"] ?? "").trim() || null;

  const snapshot: Record<string, unknown> = {
    provider: "HOUSING",
    source: "HOUSING_FILE_IMPORT",
    leadName: name || null,
    leadPhone: normalizedPhone ?? (phoneRaw || null),
    leadEmail: email,
    localityName: locality.canonical,
    localityRaw: locality.matched ? undefined : localityRaw,
    cityName: cityRaw || null,
    projectName: (row["Building/Project Name"] ?? "").trim() || null,
    projectId: (row["Property/Project ID"] ?? "").trim() || null,
    sellerId: (row["Seller Id"] ?? "").trim() || null,
    sellerName: (row["Seller Name"] ?? "").trim() || null,
    configurationRaw: configurationRaw || null,
    bhk: assetClass === "RESIDENTIAL" ? bhk ?? null : null,
    priceRaw: priceRaw || null,
    budget,
    propertyTypeRaw: propertyTypeRaw || null,
    serviceTypeRaw: serviceTypeRaw || null,
    primaryStatusRaw: primaryStatusRaw || null,
    secondaryStatusRaw: secondaryStatusRaw || null,
    leadDateRaw: row["Lead Date"] ?? null,
    leadDateIso: leadDateIso,
    // Deliberately no `address` field - Address is source metadata ONLY,
    // never persisted onto this staff-facing snapshot's public-shaped
    // surface (see runHousingImport for where it is, and is not, stored).
  };

  if (errors.length > 0) {
    return { dedupeEventId, snapshot, notes, errors, reviewReasons, needsReview: reviewReasons.length > 0 };
  }

  const canonical: CanonicalPortalLead = {
    externalEventId: dedupeEventId,
    name,
    phone: normalizedPhone ?? phoneRaw,
    email: email ?? undefined,
    locality: cityRaw && locality.canonical !== cityRaw ? `${locality.canonical}, ${cityRaw}` : locality.canonical,
    minBudget: budget,
    maxBudget: budget,
    assetClass,
    transactionType,
    bhk: assetClass === "RESIDENTIAL" ? bhk : undefined,
  };

  return { canonical, dedupeEventId, snapshot, notes, errors, reviewReasons, needsReview: reviewReasons.length > 0 };
}
