import "server-only";
import { createHash } from "crypto";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import type { CanonicalPortalLead } from "@/integrations/property-portals/ingestion";
import { flattenPayload, pick, type FlatEntry } from "./payload";

/**
 * 99acres payload adapter.
 *
 * 99acres has not given us API documentation, so NOTHING here is an official
 * field name. These are common aliases, matched case-insensitively and
 * ignoring punctuation (`Lead_Name` = `leadName` = `lead name`), looked up
 * through nested objects too. The raw (sanitised) payload is always stored
 * regardless of how much of it is recognised, so once the first real request
 * arrives this alias table can be corrected without losing anything.
 */

export const ALIASES = {
  name: ["name", "customername", "leadname", "clientname", "fullname", "buyername", "enquirername", "inquirername", "contactname", "username", "senderName"],
  firstName: ["firstname", "fname"],
  lastName: ["lastname", "lname", "surname"],
  phone: ["phone", "mobile", "mobilenumber", "contactnumber", "phonenumber", "mobileno", "contactno", "customerphone", "customermobile", "leadphone", "leadmobile", "cell", "whatsapp", "telephone"],
  countryCode: ["countrycode", "isd", "isdcode", "dialcode"],
  email: ["email", "emailid", "emailaddress", "customeremail", "leademail", "mail"],
  message: ["message", "comments", "comment", "enquiry", "inquiry", "enquirymessage", "remarks", "description", "query", "notes", "requirement"],
  listingId: ["listingid", "propertyid", "propid", "listid", "propertyref", "propertyreference", "productid", "listingcode", "propertycode"],
  projectName: ["projectname", "project", "propertytitle", "listingtitle", "propertyname", "societyname", "buildername"],
  locality: ["locality", "location", "localityname", "microlocation", "micromarket", "areaname", "sector"],
  city: ["city", "cityname", "town"],
  budget: ["budget", "price", "expectedprice", "budgetrange", "pricerange"],
  budgetMin: ["budgetmin", "minbudget", "minprice", "pricemin", "budgetfrom", "pricefrom", "frombudget", "budgetlow"],
  budgetMax: ["budgetmax", "maxbudget", "maxprice", "pricemax", "budgetto", "priceto", "tobudget", "budgethigh"],
  bhk: ["bhk", "bedrooms", "bedroom", "beds", "noofbedrooms", "bhkconfig", "configuration", "unittype"],
  propertyType: ["propertytype", "propertysubtype", "subtype", "unitcategory", "propertykind"],
  propertyCategory: ["propertycategory", "category", "assetclass", "propertyclass", "segment", "categorytype", "residentialcommercial"],
  transactionType: ["transactiontype", "purpose", "listingtype", "intent", "servicetype", "enquirytype", "inquirytype", "dealtype", "forrentorsale", "rentorbuy"],
  externalLeadId: ["leadid", "enquiryid", "inquiryid", "externalleadid", "responseid", "queryid", "referenceid", "enquiryno", "leadno", "leadreference", "enquirynumber"],
  createdAt: ["createdat", "timestamp", "leadtime", "leaddate", "enquirydate", "inquirydate", "createdon", "datetime", "responsedate", "receivedat", "submittedat", "date"],
  minArea: ["minarea", "areamin", "minareasqft", "areafrom"],
  maxArea: ["maxarea", "areamax", "maxareasqft", "areato"],
  area: ["areasqft", "size", "sizesqft", "builtuparea", "carpetarea", "superbuiltuparea"],
} as const satisfies Record<string, readonly string[]>;

export type Acres99CommercialType = "OFFICE" | "SHOP" | "SHOWROOM" | "WAREHOUSE" | "INDUSTRIAL" | "COMMERCIAL_LAND" | "CO_WORKING" | "RESTAURANT_SPACE" | "SCO" | "OTHER_COMMERCIAL";

export interface Acres99Mapping {
  /** Identity for idempotency: `99acres:<their id>` when supplied, otherwise a conservative fingerprint. */
  eventId: string;
  externalLeadId?: string;
  externalListingId?: string;
  receivedAt?: Date;
  message?: string;
  /** Present only when the payload carries enough to create a Lead. */
  canonical?: CanonicalPortalLead;
  /** Why no Lead could be created (payload is still captured and acknowledged as "received"). */
  unmappableReason?: string;
  /** Staff-facing summary persisted on the ExternalLeadEvent (the sanitised raw payload is added by the caller). */
  snapshot: Record<string, unknown>;
  needsReview: boolean;
  reviewReasons: string[];
  hasPhone: boolean;
  hasEmail: boolean;
}

// ---------------------------------------------------------------------------
// Value parsers (pure, exported for tests)
// ---------------------------------------------------------------------------

const UNIT: Record<string, number> = { cr: 1e7, crore: 1e7, crores: 1e7, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, k: 1e3, thousand: 1e3 };

function moneyParts(raw: string): Array<{ value: number; unit?: string }> {
  const cleaned = raw.toLowerCase().replace(/[₹,]/g, "").replace(/\b(rs|inr|rupees?)\.?/g, " ");
  const parts: Array<{ value: number; unit?: string }> = [];
  for (const match of cleaned.matchAll(/(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l|thousand|k)?\b/g)) {
    parts.push({ value: Number(match[1]), unit: match[2] });
  }
  return parts;
}

/** "50 Lac", "1.2 Cr", "₹ 50,00,000", "45000", "50-80 Lac" -> rupees. A trailing unit applies to a unit-less range start. */
export function parseBudget(raw: string | undefined): { min?: number; max?: number } {
  if (!raw) return {};
  const parts = moneyParts(raw);
  if (!parts.length) return {};
  const rupees = (part: { value: number; unit?: string }, fallbackUnit?: string) => Math.round(part.value * (UNIT[part.unit ?? fallbackUnit ?? ""] ?? 1));
  if (parts.length >= 2) {
    const fallback = parts[1].unit;
    const first = rupees(parts[0], fallback);
    const second = rupees(parts[1]);
    return { min: Math.min(first, second), max: Math.max(first, second) };
  }
  return { max: rupees(parts[0]) };
}

function parseMoneySingle(raw: string | undefined): number | undefined {
  const parsed = parseBudget(raw);
  return parsed.max;
}

/** "3 BHK" / "3BHK" / "3" / "3 Bedroom" -> 3. Only a deterministic single count in 0..10; otherwise left unmapped. */
export function parseBhk(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const numbers = [...raw.matchAll(/\d{1,2}/g)].map((m) => Number(m[0]));
  if (numbers.length !== 1) return undefined;
  return numbers[0] >= 0 && numbers[0] <= 10 ? numbers[0] : undefined;
}

export function parseTransactionType(raw: string | undefined): "RENT" | "SALE" | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  if (/rent|lease/.test(value)) return "RENT";
  if (/(buy|sale|sell|purchase|resale|new[- ]?project|ownership)/.test(value)) return "SALE";
  return undefined;
}

const COMMERCIAL_TYPES: Array<[RegExp, Acres99CommercialType]> = [
  [/co[- ]?working|coworking|shared office/, "CO_WORKING"],
  [/showroom/, "SHOWROOM"],
  [/\bshop\b|\bshops\b|retail/, "SHOP"],
  [/restaurant|cafe|café|food court/, "RESTAURANT_SPACE"],
  [/warehouse|godown|storage/, "WAREHOUSE"],
  [/industrial|factory|manufactur|shed/, "INDUSTRIAL"],
  [/commercial (land|plot)|institutional/, "COMMERCIAL_LAND"],
  [/\bsco\b|shop[- ]cum[- ]office/, "SCO"],
  [/office|business center|it park/, "OFFICE"],
];

export function parseCommercialType(raw: string | undefined): Acres99CommercialType | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  for (const [pattern, type] of COMMERCIAL_TYPES) if (pattern.test(value)) return type;
  return undefined;
}

/** Epoch seconds/ms, ISO-8601, or dd/mm/yyyy[ hh:mm]. Anything outside 2000..tomorrow is rejected rather than trusted. */
export function parseTimestamp(raw: string | undefined, now = new Date()): Date | undefined {
  if (!raw) return undefined;
  let date: Date | undefined;
  if (/^\d{10}(\.\d+)?$/.test(raw)) date = new Date(Number(raw) * 1000);
  else if (/^\d{13}$/.test(raw)) date = new Date(Number(raw));
  else {
    const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw);
    date = dmy ? new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4] ?? 0), Number(dmy[5] ?? 0), Number(dmy[6] ?? 0))) : new Date(raw);
  }
  if (!date || Number.isNaN(date.getTime())) return undefined;
  if (date.getFullYear() < 2000 || date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return undefined;
  return date;
}

function parseArea(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = /(\d+(?:\.\d+)?)/.exec(raw.replace(/,/g, ""));
  const value = match ? Math.round(Number(match[1])) : NaN;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function validEmail(raw: string | undefined): string | undefined {
  return raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && raw.length <= 254 ? raw : undefined;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** Deterministic fallback identity when 99acres sends no lead/enquiry id. Conservative on purpose: a retry must never create a second lead. */
export function deriveFingerprint(parts: { phone?: string; email?: string; listing?: string; timestamp?: string; message?: string }): string {
  const stable = {
    phone: parts.phone ?? null,
    email: parts.email?.toLowerCase() ?? null,
    listing: parts.listing?.trim().toLowerCase() ?? null,
    timestamp: parts.timestamp ?? null,
    message: parts.message?.trim().toLowerCase().replace(/\s+/g, " ") ?? null,
  };
  return `99acres:fp:${createHash("sha256").update(JSON.stringify(stable)).digest("hex")}`;
}

const MAX_ID_LENGTH = 128;

export function mapAcres99Lead(payload: Record<string, unknown>, now = new Date()): Acres99Mapping {
  const entries: FlatEntry[] = flattenPayload(payload);
  const reviewReasons: string[] = [];
  const used = new Set<string>();
  const take = (aliases: readonly string[]) => {
    const hit = pick(entries, aliases);
    if (hit) used.add(hit.key);
    return hit?.value;
  };

  const first = take(ALIASES.firstName);
  const last = take(ALIASES.lastName);
  const name = (take(ALIASES.name) ?? [first, last].filter(Boolean).join(" ")).slice(0, 120) || undefined;
  const rawPhone = take(ALIASES.phone);
  const countryCode = take(ALIASES.countryCode);
  const email = validEmail(take(ALIASES.email));
  const message = take(ALIASES.message)?.slice(0, 2000);
  const listingId = take(ALIASES.listingId)?.slice(0, MAX_ID_LENGTH);
  const projectName = take(ALIASES.projectName)?.slice(0, 200);
  const localityRaw = take(ALIASES.locality)?.slice(0, 200);
  const city = take(ALIASES.city)?.slice(0, 100);
  const budgetRaw = take(ALIASES.budget);
  const budgetMinRaw = take(ALIASES.budgetMin);
  const budgetMaxRaw = take(ALIASES.budgetMax);
  const bhkRaw = take(ALIASES.bhk);
  const propertyTypeRaw = take(ALIASES.propertyType);
  const categoryRaw = take(ALIASES.propertyCategory);
  const transactionRaw = take(ALIASES.transactionType);
  const leadIdRaw = take(ALIASES.externalLeadId)?.slice(0, MAX_ID_LENGTH);
  const createdRaw = take(ALIASES.createdAt);
  const minAreaRaw = take(ALIASES.minArea);
  const maxAreaRaw = take(ALIASES.maxArea);
  const areaRaw = take(ALIASES.area);

  // Phone: Indian mobile numbers only - the same rule the rest of the CRM uses for contactability.
  const phone = rawPhone ? normalizeIndianPhone(rawPhone, countryCode?.replace(/\D/g, "") || undefined) ?? undefined : undefined;
  if (rawPhone && !phone) reviewReasons.push("Phone number is not a valid Indian mobile number");

  const timestamp = parseTimestamp(createdRaw, now);
  if (createdRaw && !timestamp) reviewReasons.push("Lead timestamp could not be parsed; receipt time used");

  // Budget
  let minBudget = parseMoneySingle(budgetMinRaw);
  let maxBudget = parseMoneySingle(budgetMaxRaw);
  if (minBudget === undefined && maxBudget === undefined && budgetRaw) {
    const range = parseBudget(budgetRaw);
    minBudget = range.min ?? (range.max !== undefined ? 0 : undefined);
    maxBudget = range.max;
  }
  if (maxBudget === undefined && minBudget !== undefined) maxBudget = minBudget;
  if (maxBudget === undefined) reviewReasons.push("No budget supplied");
  if (minBudget !== undefined && maxBudget !== undefined && minBudget > maxBudget) [minBudget, maxBudget] = [maxBudget, minBudget];

  // Asset class + commercial type
  const typeFromType = parseCommercialType(propertyTypeRaw);
  const typeFromCategory = parseCommercialType(categoryRaw);
  const commercialByCategory = /commercial/i.test(categoryRaw ?? "") || /commercial/i.test(propertyTypeRaw ?? "");
  const assetClass: "RESIDENTIAL" | "COMMERCIAL" = typeFromType || typeFromCategory || commercialByCategory ? "COMMERCIAL" : "RESIDENTIAL";
  const commercialType = assetClass === "COMMERCIAL" ? typeFromType ?? typeFromCategory ?? "OTHER_COMMERCIAL" : undefined;
  if (assetClass === "COMMERCIAL" && !typeFromType && !typeFromCategory) reviewReasons.push("Commercial lead with an unrecognised property type; set to OTHER_COMMERCIAL");
  if (!propertyTypeRaw && !categoryRaw) reviewReasons.push("No property type/category supplied; assumed residential");

  const transactionType = parseTransactionType(transactionRaw) ?? "SALE";
  if (!parseTransactionType(transactionRaw)) reviewReasons.push(transactionRaw ? `Unrecognised transaction type "${transactionRaw}"; assumed SALE` : "No transaction type supplied; assumed SALE");

  const bhk = assetClass === "RESIDENTIAL" ? parseBhk(bhkRaw) : undefined;
  if (assetClass === "RESIDENTIAL" && bhkRaw && bhk === undefined) reviewReasons.push(`BHK value "${bhkRaw}" is not a single deterministic count`);

  const locality = [localityRaw, city].filter((part, index, all) => part && all.indexOf(part) === index).join(", ") || undefined;
  if (!locality) reviewReasons.push("No locality/city supplied");

  // Idempotency identity
  const externalLeadId = leadIdRaw ? `99acres:${leadIdRaw}` : undefined;
  const eventId = externalLeadId ?? deriveFingerprint({ phone, email, listing: listingId ?? projectName, timestamp: timestamp?.toISOString() ?? createdRaw, message });

  const unmappedFields = entries.filter((entry) => entry.depth === 0 && !used.has(entry.key)).map((entry) => entry.key).slice(0, 100);

  const snapshot: Record<string, unknown> = {
    provider: "NINETY_NINE_ACRES",
    leadName: name ?? null,
    leadPhone: phone ?? rawPhone ?? null,
    leadEmail: email ?? null,
    projectName: projectName ?? null,
    listingId: listingId ?? null,
    localityName: localityRaw ?? null,
    cityName: city ?? null,
    minBudget: minBudget ?? null,
    maxBudget: maxBudget ?? null,
    bhk: bhk ?? null,
    bhkRaw: bhkRaw ?? null,
    propertyTypeRaw: propertyTypeRaw ?? null,
    categoryRaw: categoryRaw ?? null,
    transactionTypeRaw: transactionRaw ?? null,
    assetClass,
    commercialPropertyType: commercialType ?? null,
    externalLeadId: leadIdRaw ?? null,
    leadDate: timestamp?.toISOString() ?? null,
    unmappedFields,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
  };

  const base = { eventId, externalLeadId, externalListingId: listingId, receivedAt: timestamp, message, snapshot, needsReview: reviewReasons.length > 0, reviewReasons, hasPhone: Boolean(phone), hasEmail: Boolean(email) };

  // Minimum safe data to create a CRM Lead: a valid, contactable Indian mobile number. Name, locality and budget
  // have safe placeholders (flagged for review); a lead nobody can call is not a lead, it is a captured event.
  if (!phone) return { ...base, unmappableReason: rawPhone ? "invalid_phone" : "missing_phone" };

  const canonical: CanonicalPortalLead = {
    provider: "NINETY_NINE_ACRES",
    externalLeadId,
    externalEventId: eventId,
    externalListingId: listingId,
    name: name && name.length >= 2 ? name : "99acres Enquiry",
    phone,
    email,
    message,
    receivedAt: timestamp,
    locality: locality ?? "Not specified",
    minBudget: minBudget ?? 0,
    maxBudget: maxBudget ?? 0,
    assetClass,
    transactionType,
    bhk,
    commercialPropertyType: commercialType,
    minAreaSqft: parseArea(minAreaRaw) ?? (assetClass === "COMMERCIAL" ? parseArea(areaRaw) : undefined),
    maxAreaSqft: parseArea(maxAreaRaw) ?? (assetClass === "COMMERCIAL" ? parseArea(areaRaw) : undefined),
  };
  if (!name || name.length < 2) reviewReasons.push("No usable lead name; placeholder used");
  base.needsReview = reviewReasons.length > 0;
  snapshot.needsReview = base.needsReview;
  snapshot.reviewReasons = reviewReasons;
  return { ...base, canonical };
}

