import { importCreatePropertySchema, propertySchema } from "./validators";
import { normalizeIndianPhone } from "@/integrations/whatsapp/phone";
import { IMPORTABLE_PROPERTY_FIELDS, normalizeHeader, type ImportablePropertyField, type ImportActionValue } from "./inventory-import-shared";
export { IMPORTABLE_PROPERTY_FIELDS, headerSignature, normalizeHeader } from "./inventory-import-shared";
export type { ImportablePropertyField, ImportActionValue } from "./inventory-import-shared";

export const INVENTORY_IMPORT_MAX_BYTES = Number(process.env.INVENTORY_IMPORT_MAX_BYTES ?? 10 * 1024 * 1024);
export const INVENTORY_IMPORT_MAX_ROWS = Number(process.env.INVENTORY_IMPORT_MAX_ROWS ?? 5000);

export type InventoryImportModeValue = "CREATE_ONLY" | "UPSERT_SAFE" | "UPDATE_EXISTING_ONLY";
export type ImportPartialPolicyValue = "REQUIRE_ALL_ROWS_VALID" | "IMPORT_VALID_ROWS";
export type DuplicateClassValue = "EXACT_DUPLICATE" | "PROBABLE_DUPLICATE" | "POSSIBLE_DUPLICATE" | "NEW";

export interface ImportFieldIssue { field: string; originalValue?: string; message: string; severity: "ERROR" | "WARNING" }
export interface ExistingPropertyCandidate {
  id: string; propertyCode: string; area: string; address: string; floorNumber: number | null; builtUpAreaSqft: number;
  monthlyRent: number | null; salePrice: number | null; bhk: number; ownerPhone: string | null; title: string;
  [key: string]: unknown;
}

const aliases: Record<ImportablePropertyField, string[]> = {
  propertyCode: ["property code", "serial number", "serial no", "s no", "sr no", "sno", "id"],
  title: ["title", "property title", "name"], listingType: ["listing type", "rent sale", "deal type"],
  propertyType: ["property type", "type", "category"], inventorySource: ["dir ind", "direct indirect", "source", "inventory source"],
  partnerName: ["inventory partner", "partner", "broker", "broker name", "company"], area: ["location", "locality", "area", "sector"],
  address: ["address", "specific address", "complete address", "block pocket", "block", "pocket"], buildingName: ["building", "building name", "society"],
  landmark: ["landmark", "near"], pincode: ["pincode", "pin code", "postal code"], monthlyRent: ["rent", "monthly rent", "price rent"],
  salePrice: ["sale price", "selling price", "price"], floorNumber: ["floor", "floor number"], totalFloors: ["total floors", "floors"],
  builtUpAreaSqft: ["sq ft", "sqft", "square feet", "area sqft", "built up area", "builtup area"], carpetAreaSqft: ["carpet area", "carpet sqft"],
  dimension: ["dimension", "dimensions", "size", "dimention size"], possessionNotes: ["possession", "availability", "available"], availableFrom: ["available from", "possession date"],
  bhk: ["bhk", "bedrooms", "beds"], bathrooms: ["bathrooms", "bathroom", "baths"], furnishing: ["furnishing", "furnished"],
  parkingAvailable: ["parking", "parking facility"], liftAvailable: ["lift", "elevator"], status: ["status", "availability status"],
  ownerName: ["owner name", "owner"], ownerPhone: ["owner no", "owner phone", "mobile", "phone", "contact"],
  ownerAlternatePhone: ["alternate phone", "alternate no", "other phone"], internalNotes: ["notes", "remarks", "additional notes"],
  description: ["description", "details"], parkingLift: ["parking lift", "parking elevator", "lift parking"], assetClass: ["asset class", "residential commercial", "segment"], superAreaSqft: ["super area", "super area sqft"], frontageFeet: ["frontage", "frontage feet"], workstations: ["workstations", "seats"], cabins: ["cabins"], commercialFitOut: ["fit out", "fitout", "commercial furnishing"], goodsLiftAvailable: ["goods lift"], leaseTermMonths: ["lease term", "lease months"], lockInPeriodMonths: ["lock in", "lockin"], camCharge: ["cam", "cam charge"], expectedPrice: ["expected price"],
  areaUnit: ["area unit", "unit"], possessionStatus: ["possession status"], parkFacing: ["park facing", "facing park"],
};

/** Header tokens (normalized) recognized as a row's serial-number/S.NO column
 * for the materialize() meaningful-row threshold in inventory-import-parser.ts.
 * Deliberately a superset of aliases.propertyCode's serial-number entries -
 * S.NO is structurally significant (it must not itself count as evidence of a
 * "real" row) even on a sheet where it wasn't mapped to propertyCode. */
export const SERIAL_NUMBER_HEADER_TOKENS = new Set(["serial number", "serial no", "s no", "sr no", "sno"]);

export function suggestColumnMapping(headers: string[]): { mapping: Record<string, string>; ambiguous: Record<string, string[]> } {
  const mapping: Record<string, string> = {};
  const ambiguous: Record<string, string[]> = {};
  const normalized = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  for (const field of IMPORTABLE_PROPERTY_FIELDS) {
    const candidates = normalized.filter((item) => aliases[field].includes(item.normalized));
    if (candidates.length === 1) mapping[field] = candidates[0].header;
    if (candidates.length > 1) ambiguous[field] = candidates.map((item) => item.header);
  }
  return { mapping, ambiguous };
}

export function parseBoolean(raw: unknown): boolean | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (["yes", "y", "true", "1", "available", "included"].includes(value)) return true;
  if (["no", "n", "false", "0", "not available", "none"].includes(value)) return false;
  return null;
}

export function parseInventorySource(raw: unknown): "DIRECT" | "INDIRECT" | null {
  const value = normalizeHeader(String(raw ?? ""));
  if (["dir", "direct"].includes(value)) return "DIRECT";
  if (["ind", "indirect"].includes(value)) return "INDIRECT";
  return null;
}

export function parseMoney(raw: unknown): number | null {
  const value = String(raw ?? "").trim().toLowerCase().replace(/[₹,\s]/g, "");
  const match = value.match(/^(\d+(?:\.\d+)?)(k|thousand|l|lac|lakh|cr|crore)?$/);
  if (!match) return null;
  const multiplier = !match[2] ? 1 : ["k", "thousand"].includes(match[2]) ? 1_000 : ["l", "lac", "lakh"].includes(match[2]) ? 100_000 : 10_000_000;
  const result = Number(match[1]) * multiplier;
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

export function parseArea(raw: unknown): number | null {
  const value = String(raw ?? "").trim().toLowerCase().replace(/,/g, "");
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(sq\.?\s*ft|sqft|square\s*feet)?$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseFloor(raw: unknown): number | null {
  const value = normalizeHeader(String(raw ?? ""));
  const words: Record<string, number> = { ground: 0, basement: -1, first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
  const token = value.replace(/(\d+)(st|nd|rd|th)\b/g, "$1").replace(/\bfloor\b/g, "").trim();
  if (token in words) return words[token];
  const match = token.match(/^-?\d+$/);
  return match ? Number(token) : null;
}

// ---------------------------------------------------------------------------
// Property Inventory V2 - "detailed" parsers. Each preserves the raw source
// text and, where the source text is genuinely ambiguous, returns a null/flag
// rather than guessing - the caller (normalizeMappedRow) decides whether that
// becomes a WARNING (never blocks REQUIRE_ALL_ROWS_VALID) or is simply left
// unset. The older bare parse* functions above are kept as-is (parseMoney is
// used by src/integrations/housing/file-import-adapter.ts; parseArea/
// parseFloor/parseInventorySource remain exported for existing callers/tests)
// and are not rewritten in place - these are additive siblings.
// ---------------------------------------------------------------------------

export interface PriceParseDetail { amount: number | null; raw: string | null; lastPrice: number | null; ambiguous: boolean }

const MONEY_UNIT_MULTIPLIER: Record<string, number> = { cr: 10_000_000, crore: 10_000_000, l: 100_000, lac: 100_000, lakh: 100_000, k: 1_000, thousand: 1_000 };

/**
 * Confidently parses amounts with an explicit unit (k/thousand/lakh/crore -
 * the same units the older parseMoney recognized, kept for backward
 * compatibility with existing "25k"-style data) even when followed by
 * trailing qualifier words ("ASK", "DEMAND", garbled notes like
 * "(CHEQUE 7+)") - those are preserved verbatim in `raw` but never block a
 * confident parse of the leading number+unit. Only ever extracts `lastPrice`
 * from the exact "(<amount><unit> LAST)" parenthetical immediately following
 * the main amount - no other parenthetical shape is treated as a last price.
 * A bare number with no unit at all (e.g. "40 ASK") is never guessed as any
 * unit - it comes back ambiguous with amount null.
 */
export function parsePriceDetailed(raw: unknown): PriceParseDetail {
  const original = String(raw ?? "").trim();
  if (!original) return { amount: null, raw: null, lastPrice: null, ambiguous: false };
  const cleaned = original.replace(/[₹,]/g, "");
  const leadMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*(cr|crore|l|lac|lakh|k|thousand)\b/i);
  if (!leadMatch) return { amount: null, raw: original, lastPrice: null, ambiguous: true };
  const amount = Math.round(Number(leadMatch[1]) * MONEY_UNIT_MULTIPLIER[leadMatch[2].toLowerCase()]);
  let lastPrice: number | null = null;
  const lastMatch = cleaned.match(/\(\s*(\d+(?:\.\d+)?)\s*(cr|crore|l|lac|lakh)\s*last\s*\)/i);
  if (lastMatch) lastPrice = Math.round(Number(lastMatch[1]) * MONEY_UNIT_MULTIPLIER[lastMatch[2].toLowerCase()]);
  return { amount: Number.isSafeInteger(amount) && amount >= 0 ? amount : null, raw: original, lastPrice, ambiguous: false };
}

export interface AreaParseDetail { sqft: number | null; unit: "SQ_FT" | "SQ_YD" | "SQ_M" | "ACRE" | "OTHER"; raw: string | null; ambiguous: boolean }

/**
 * Never averages or picks a side of a range, never treats "L X W" dimension
 * text as an area, and only auto-converts SQ_YD/GAJ (a recognized business
 * alias for square yards) to sqft via the deterministic x9 factor - always
 * keeping the original unit/text alongside the derived number. A bare number
 * with no unit is confident SQ_FT on a residential sheet (matches prior
 * behavior) but ambiguous on a COMMERCIAL/PLOT-like sheet context.
 */
export function parseAreaDetailed(raw: unknown, context?: { sheetAssetClass?: string }): AreaParseDetail {
  const original = String(raw ?? "").trim();
  if (!original) return { sqft: null, unit: "SQ_FT", raw: null, ambiguous: false };
  const value = original.toLowerCase().replace(/,/g, "");
  const rangeMatch = value.match(/^(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|square\s*feet)?\s*to\s*(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|square\s*feet)?$/);
  if (rangeMatch) return { sqft: null, unit: "OTHER", raw: original, ambiguous: true };
  if (/^\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?$/i.test(value)) return { sqft: null, unit: "OTHER", raw: original, ambiguous: true };
  const yardMatch = value.match(/^(\d+(?:\.\d+)?)\s*(sq\.?\s*y(?:ar)?d?s?|square\s*yards?|gaj)$/);
  if (yardMatch) {
    const n = Number(yardMatch[1]);
    return { sqft: Number.isFinite(n) ? Math.round(n * 9) : null, unit: "SQ_YD", raw: original, ambiguous: false };
  }
  const sqftMatch = value.match(/^(\d+(?:\.\d+)?)\s*(sq\.?\s*ft|sqft|square\s*feet)?$/);
  if (sqftMatch) {
    const n = Number(sqftMatch[1]);
    if (!Number.isFinite(n) || n <= 0) return { sqft: null, unit: "OTHER", raw: original, ambiguous: true };
    const hasUnit = !!sqftMatch[2];
    if (!hasUnit && context?.sheetAssetClass && context.sheetAssetClass !== "RESIDENTIAL") {
      return { sqft: null, unit: "OTHER", raw: original, ambiguous: true };
    }
    return { sqft: Math.round(n), unit: "SQ_FT", raw: original, ambiguous: false };
  }
  return { sqft: null, unit: "OTHER", raw: original, ambiguous: true };
}

export interface FloorParseDetail { floorNumber: number | null; raw: string | null }

/**
 * Extracts a leading ordinal token and ignores trailing annotations
 * ("2 ND(Square pattern/2 room)" -> 2, "3 RD WITH ROOF" -> 3), but never
 * picks a side of a multi-floor combo ("1 ST& 2 ND") - floorNumber stays
 * null there so the caller can flag it, while `raw` always preserves the
 * full original text whenever floor data came through at all.
 */
export function parseFloorDetailed(raw: unknown): FloorParseDetail {
  const original = String(raw ?? "").trim();
  if (!original) return { floorNumber: null, raw: null };
  if (/\d\s*(?:st|nd|rd|th)?\s*(?:&|,|\band\b)\s*\d\s*(?:st|nd|rd|th)?/i.test(original)) return { floorNumber: null, raw: original };
  const words: Record<string, number> = { ground: 0, basement: -1, first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
  const normalized = normalizeHeader(original).replace(/\bfloor\b/g, "").trim();
  if (normalized in words) return { floorNumber: words[normalized], raw: original };
  const stripped = normalized.replace(/(\d+)\s*(st|nd|rd|th)\b/, "$1");
  const leading = stripped.match(/^(-?\d+)\b/);
  if (leading) return { floorNumber: Number(leading[1]), raw: original };
  if (/^ground\b/.test(normalized)) return { floorNumber: 0, raw: original };
  if (/^basement\b/.test(normalized)) return { floorNumber: -1, raw: original };
  return { floorNumber: null, raw: original };
}

export interface SourceParseDetail { inventorySource: "DIRECT" | "INDIRECT" | null; sourceRaw: string | null; confident: boolean }

/**
 * Only an exact (case-insensitive, trimmed) literal "direct"/"dir" or
 * "indirect"/"ind" is confident. Anything else (a person's name, a free-text
 * note) is deliberately unresolved. UNKNOWN is an import-resolution state,
 * not a Property.inventorySource business value: creation must wait for a
 * Data Manager to choose DIRECT or INDIRECT. sourceRaw preserves the source
 * text so an existing InventoryPartner can be matched safely in preview.
 */
export function parseSourceDetailed(raw: unknown): SourceParseDetail {
  const original = String(raw ?? "").trim();
  if (!original) return { inventorySource: null, sourceRaw: null, confident: false };
  const normalized = normalizeHeader(original);
  if (["dir", "direct"].includes(normalized)) return { inventorySource: "DIRECT", sourceRaw: original, confident: true };
  if (["ind", "indirect"].includes(normalized)) return { inventorySource: "INDIRECT", sourceRaw: original, confident: true };
  return { inventorySource: null, sourceRaw: original, confident: false };
}

export interface ParkingLiftParseDetail { lift: boolean | null; parking: boolean | null }

/**
 * Negation-aware free-text splitter for a combined "Parking/Lift" column.
 * Negation patterns MUST be checked before the generic positive match -
 * otherwise "WITHOUT LIFT WITH PARKING" would match /lift/ generically and
 * wrongly report lift=true (the historical regression this function fixes).
 * "ONLY LIFT"/"ONLY PARKING" are treated as an explicit negation of the
 * other amenity since "only" unambiguously excludes it here; any other
 * unmatched token yields null (no signal) so the caller can leave the
 * existing non-nullable DB default untouched rather than fabricate a value.
 */
export function parseParkingLift(raw: unknown): ParkingLiftParseDetail {
  const original = String(raw ?? "").trim();
  if (!original) return { lift: null, parking: null };
  // Deliberately NOT normalizeHeader here - it deletes punctuation outright
  // rather than treating it as a word boundary, which would silently merge
  // adjacent words with no surrounding whitespace (e.g. "LIFT(OPEN PARKING)"
  // -> "liftopen parking", breaking the \bLIFT\b word-boundary match below).
  const text = original.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let lift: boolean | null = null;
  let parking: boolean | null = null;
  if (/\b(no|without)\s+(lift|elevator)\b/.test(text)) lift = false;
  else if (/\b(lift|elevator)\b/.test(text)) lift = true;
  if (/\b(no|without)\s+parking\b/.test(text)) parking = false;
  else if (/\bparking\b/.test(text)) parking = true;
  if (/\bonly\s+lift\b/.test(text)) parking = false;
  if (/\bonly\s+parking\b/.test(text)) lift = false;
  return { lift, parking };
}

export interface SheetContext { assetClass?: "RESIDENTIAL" | "COMMERCIAL"; propertyType?: string; bhk?: number; listingType?: "SALE" | "RENT" }

function cleanSheetToken(value: string): string {
  return value
    .replace(/_x0009_/gi, " ")
    .replace(/[\t	]/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
}

/**
 * Derives sheet-level defaults (asset class / property type / bhk / listing
 * type) purely from the Excel tab name and, when available, an in-sheet
 * title - never guesses beyond an unambiguous token match. `inSheetTitle` is
 * checked independently of `sheetName` for the LEASE token specifically,
 * since real workbooks have been observed with a tab named "LEASE FOR SALE"
 * whose actual in-sheet title reads "FLOOR FOR LEASE" - either one saying
 * LEASE is enough to default listingType to RENT.
 */
export function deriveSheetContext(sheetName: string, inSheetTitle?: string): SheetContext {
  const a = cleanSheetToken(sheetName ?? "");
  const b = cleanSheetToken(inSheetTitle ?? "");
  const combined = `${a} ${b}`.trim();
  const result: SheetContext = {};

  const bhkMatch = combined.match(/(\d)\s*BHK/);
  if (bhkMatch) {
    result.assetClass = "RESIDENTIAL";
    result.bhk = Number(bhkMatch[1]);
    result.listingType = /\bLEASE\b|\bRENT\b/.test(combined) ? "RENT" : "SALE";
    return result;
  }

  if (/COMM?ERC?IAL/.test(combined)) {
    result.assetClass = "COMMERCIAL";
    if (/\bSHOP\b/.test(combined)) result.propertyType = "COMMERCIAL_SHOP";
    // Mirrors the BHK branch's rule exactly: SALE unless a LEASE/RENT token
    // is present. A sheet/title saying neither should still not guess - but
    // "COMERCIAL SHOP" / "COMMERCIAL SHOP FOR SALE" (real workbook) says SALE.
    result.listingType = /\bLEASE\b|\bRENT\b/.test(combined) ? "RENT" : "SALE";
    return result;
  }

  if (/\bPLOT\b/.test(combined)) {
    result.propertyType = "PLOT";
    result.assetClass = "RESIDENTIAL"; // matches existing PLOT-as-residential convention (property-form.tsx, requirement-form.tsx)
    result.listingType = /\bLEASE\b|\bRENT\b/.test(combined) ? "RENT" : "SALE";
    return result;
  }

  if (/\bLEASE\b/.test(a) || /\bLEASE\b/.test(b)) {
    result.listingType = "RENT";
    return result;
  }

  return result;
}

/**
 * Fills sheet-derived defaults onto `data` ONLY where that field is not
 * already present/non-null - an explicit per-row mapped value always wins.
 * Deliberately separate from normalizeMappedRow so it stays independently
 * testable and so callers can skip it entirely when no sheet name is known.
 */
export function applySheetDefaults(data: Record<string, unknown>, sheetContext: SheetContext): Record<string, unknown> {
  const next = { ...data };
  const setIfAbsent = (field: string, value: unknown) => {
    if (value === undefined) return;
    if (next[field] === undefined || next[field] === null) next[field] = value;
  };
  setIfAbsent("assetClass", sheetContext.assetClass);
  setIfAbsent("propertyType", sheetContext.propertyType);
  setIfAbsent("bhk", sheetContext.bhk);
  setIfAbsent("listingType", sheetContext.listingType);
  return next;
}

const RESIDENTIAL_PROPERTY_TYPE_FALLBACK = "OTHER";
const COMMERCIAL_PROPERTY_TYPE_FALLBACK = "OTHER_COMMERCIAL";

/**
 * Fills fields required by importCreatePropertySchema (title, propertyType)
 * that a real broker workbook never supplies and that sheet context alone
 * can't always resolve - a bare "3 BHK SALE" tab tells you bhk+assetClass+
 * listingType but genuinely can't distinguish APARTMENT/BUILDER_FLOOR/
 * INDEPENDENT_HOUSE, so guessing a specific residential type would violate
 * the "never guess" rule everywhere else in this file. Both enums already
 * have a designed escape hatch (OTHER / OTHER_COMMERCIAL) for exactly this -
 * using it is not a guess, it's an honest "uncategorized," always flagged
 * WARNING so a human can reclassify later. Must run AFTER applySheetDefaults
 * (so a sheet-derived propertyType like COMMERCIAL_SHOP/PLOT already wins)
 * and BEFORE validateImportedProperty. Never touches `furnishing` - that is
 * relaxed at the schema level (importCreatePropertySchema) instead, since
 * there is no honest non-guess default value to fall back to there.
 */
export function applyImportFallbackDefaults(data: Record<string, unknown>, issues: ImportFieldIssue[]): Record<string, unknown> {
  const next = { ...data };
  if (!valuePresent(next.propertyType)) {
    next.propertyType = next.assetClass === "COMMERCIAL" ? COMMERCIAL_PROPERTY_TYPE_FALLBACK : RESIDENTIAL_PROPERTY_TYPE_FALLBACK;
    issues.push({ field: "propertyType", message: "Property type could not be determined from the sheet - defaulted to Other, please reclassify", severity: "WARNING" });
  }
  if (!valuePresent(next.title)) {
    const parts: string[] = [];
    if (valuePresent(next.bhk) && Number(next.bhk) > 0) parts.push(`${next.bhk} BHK`);
    else if (typeof next.propertyType === "string" && next.propertyType !== RESIDENTIAL_PROPERTY_TYPE_FALLBACK && next.propertyType !== COMMERCIAL_PROPERTY_TYPE_FALLBACK) {
      parts.push(next.propertyType.replace(/_/g, " "));
    } else {
      parts.push("Property");
    }
    if (valuePresent(next.area)) parts.push(`in ${next.area}`);
    next.title = parts.join(" ");
    issues.push({ field: "title", message: "No title in source - auto-generated from available fields, please review", severity: "WARNING" });
  }
  // importCreatePropertySchema deliberately does not hard-require an owner
  // for DIRECT inventory (55% of the real KP workbook has none on file yet -
  // see validators.ts) - flag it as a WARNING instead of silently accepting
  // an ownerless listing with no trace.
  if (next.inventorySource === "DIRECT" && (!valuePresent(next.ownerName) || !valuePresent(next.ownerPhone))) {
    issues.push({ field: "ownerName", message: "No owner on file for this direct listing - add owner details when available", severity: "WARNING" });
  }
  return next;
}

function parseEnum(raw: unknown, values: string[], aliasesMap: Record<string, string> = {}): string | null {
  const normalized = normalizeHeader(String(raw ?? ""));
  const byAlias = aliasesMap[normalized];
  if (byAlias) return byAlias;
  return values.find((v) => normalizeHeader(v) === normalized) ?? null;
}

function valuePresent(value: unknown): boolean { return value !== undefined && value !== null && String(value).trim() !== ""; }

export function normalizeMappedRow(raw: Record<string, unknown>, mapping: Record<string, string>, sheetContext?: SheetContext): { data: Record<string, unknown>; issues: ImportFieldIssue[]; sourceResolutionRequired: boolean } {
  const data: Record<string, unknown> = {};
  const issues: ImportFieldIssue[] = [];
  for (const [field, header] of Object.entries(mapping)) {
    const value = raw[header];
    if (!valuePresent(value)) continue;
    data[field] = typeof value === "string" ? value.trim() : value;
  }
  const convert = (field: string, parser: (value: unknown) => unknown, message: string) => {
    if (!valuePresent(data[field])) return;
    const parsed = parser(data[field]);
    if (parsed === null) issues.push({ field, originalValue: String(data[field]), message, severity: "ERROR" });
    else data[field] = parsed;
  };

  // Source/provenance: only an exact DIR/DIRECT or IND/INDIRECT literal is
  // confident; anything else falls back to the DIRECT default (required by
  // the non-nullable Property.inventorySource column) but raises a WARNING
  // rather than silently asserting a fact - see parseSourceDetailed.
  let sourceResolutionRequired = !Object.prototype.hasOwnProperty.call(mapping, "inventorySource");
  if (Object.prototype.hasOwnProperty.call(mapping, "inventorySource")) {
    const detail = parseSourceDetailed(data.inventorySource);
    data.sourceRaw = detail.sourceRaw;
    if (detail.inventorySource) data.inventorySource = detail.inventorySource;
    else delete data.inventorySource;
    sourceResolutionRequired = !detail.confident;
  }

  // Price fields: amount/lastPrice/raw always preserved together. An
  // ambiguous amount (no lakh/crore unit at all) is a WARNING, never an
  // ERROR - it must not block REQUIRE_ALL_ROWS_VALID.
  // priceRaw/lastPrice are single scalars on Property, but a row can map
  // more than one price column (e.g. a commercial lease row with both
  // monthlyRent and expectedPrice) - first-populated-field-wins (in this
  // priority order) so the primary listing price's provenance is never
  // silently overwritten by a secondary one processed later in the loop.
  for (const field of ["monthlyRent", "salePrice", "expectedPrice"]) {
    if (!valuePresent(data[field])) continue;
    const detail = parsePriceDetailed(data[field]);
    if (detail.raw !== null && !valuePresent(data.priceRaw)) data.priceRaw = detail.raw;
    if (detail.lastPrice !== null && data.lastPrice === undefined) data.lastPrice = detail.lastPrice;
    if (detail.amount !== null) data[field] = detail.amount;
    else delete data[field];
    if (detail.ambiguous) issues.push({ field, originalValue: detail.raw ?? undefined, message: "Amount has no unit (L/Lakh/CR/Crore) so it cannot be parsed confidently - review and re-enter", severity: "WARNING" });
  }
  convert("camCharge", parseMoney, "Enter an unambiguous amount such as 25000 or 25k");

  // Area fields: builtUpAreaSqft/carpetAreaSqft/superAreaSqft each get their
  // own areaUnit/areaRaw provenance via the same parser, targeting whichever
  // field is being parsed. A confidently-derived SQ_YD/GAJ->sqft conversion
  // still raises an informational WARNING so a human can double check it.
  // "PLOT" is passed through as its own sheetAssetClass value (not folded
  // into RESIDENTIAL) specifically so a bare-number area on a plot sheet
  // still gets the ambiguity check below - deriveSheetContext always sets
  // assetClass=RESIDENTIAL for PLOT rows (matches the rest of the app's
  // PLOT-as-residential convention), so that alone can't be used to detect
  // a plot listing here.
  const effectiveAssetClass = sheetContext?.propertyType === "PLOT" ? "PLOT" : (typeof data.assetClass === "string" ? parseEnum(data.assetClass, ["RESIDENTIAL", "COMMERCIAL"], { residential: "RESIDENTIAL", commercial: "COMMERCIAL" }) : null) ?? sheetContext?.assetClass;
  // An areaUnit column mapped explicitly by the user always wins over the
  // unit this loop would otherwise derive from builtUpAreaSqft/carpetAreaSqft/
  // superAreaSqft - captured before the loop so it is never clobbered below.
  const explicitAreaUnit = valuePresent(data.areaUnit);
  // areaRaw/areaUnit are single scalars on Property, but a row can map more
  // than one area column (built-up + carpet are commonly populated
  // together) - first-populated-field-wins (in this priority order) so the
  // primary/required builtUpAreaSqft's provenance is never silently
  // overwritten by carpetAreaSqft/superAreaSqft processed later.
  let areaProvenanceSet = valuePresent(data.areaRaw);
  for (const field of ["builtUpAreaSqft", "carpetAreaSqft", "superAreaSqft"]) {
    if (!valuePresent(data[field])) continue;
    const detail = parseAreaDetailed(data[field], { sheetAssetClass: effectiveAssetClass ?? undefined });
    if (detail.raw !== null && !areaProvenanceSet) { data.areaRaw = detail.raw; if (!explicitAreaUnit) data.areaUnit = detail.unit; areaProvenanceSet = true; }
    if (detail.sqft !== null) data[field] = detail.sqft;
    else delete data[field];
    if (detail.ambiguous) {
      const message = /\d\s*x\s*\d/i.test(String(detail.raw ?? "")) ? "Dimension-shaped value found in area field - not a valid area, review and re-enter" : /to/i.test(String(detail.raw ?? "")) && detail.unit === "OTHER" ? "Ambiguous area range - requires manual review" : "Area unit could not be confirmed - review and re-enter";
      issues.push({ field, originalValue: detail.raw ?? undefined, message, severity: "WARNING" });
    } else if (detail.unit === "SQ_YD") {
      issues.push({ field, originalValue: detail.raw ?? undefined, message: "Converted from square yards/gaj to sqft (x9) - please double check", severity: "WARNING" });
    }
  }

  // Floor: floorRaw is always populated whenever floor data came through
  // import, even for clean unambiguous values - cheap provenance already
  // backed by a dedicated column. A multi-floor combo ("1ST & 2ND") leaves
  // floorNumber unset rather than guessing one side.
  if (valuePresent(data.floorNumber)) {
    const detail = parseFloorDetailed(data.floorNumber);
    data.floorRaw = detail.raw;
    if (detail.floorNumber !== null) data.floorNumber = detail.floorNumber;
    else {
      delete data.floorNumber;
      if (/(&|,|\band\b)/i.test(String(detail.raw ?? ""))) issues.push({ field: "floorNumber", originalValue: detail.raw ?? undefined, message: "Multiple floors specified - floor left unset, see raw value", severity: "WARNING" });
    }
  }
  convert("totalFloors", parseFloor, "Enter a floor number such as 2 or Second Floor");

  for (const field of ["parkingAvailable", "liftAvailable", "parkFacing"]) convert(field, parseBoolean, "Use Yes/Y/Available or No/N");
  // A dedicated BHK column (seen on the real workbook's LEASE sheet) can hold
  // "1BHK"/"2 BHK" rather than a bare number - strip the unit before the
  // generic whole-number check below, same value either way.
  if (valuePresent(data.bhk)) {
    const bhkMatch = String(data.bhk).trim().match(/^(\d+)\s*BHK$/i);
    if (bhkMatch) data.bhk = bhkMatch[1];
  }
  for (const field of ["bhk", "bathrooms", "workstations", "cabins", "leaseTermMonths", "lockInPeriodMonths"]) convert(field, (v) => /^\d+$/.test(String(v).trim()) ? Number(v) : null, "Enter a whole number");

  // Parking/Lift free-text splitter: negation-aware (see parseParkingLift) -
  // a token that gives no signal either way leaves the existing non-nullable
  // DB default untouched rather than fabricating a value.
  if (valuePresent(data.parkingLift)) {
    const { lift, parking } = parseParkingLift(data.parkingLift);
    if (parking !== null) data.parkingAvailable = parking;
    if (lift !== null) data.liftAvailable = lift;
    delete data.parkingLift;
  }

  // Phone splitting: a "/", "," or ";" separated PHONE NO cell yields a
  // primary + alternate, but never overwrites an alternate phone that was
  // already independently mapped from its own column. An unparsable second
  // token is dropped with a WARNING - the primary phone is what matters.
  if (valuePresent(data.ownerPhone)) {
    const tokens = String(data.ownerPhone).split(/[/,;]/).map((token) => token.trim()).filter(Boolean);
    if (tokens.length >= 2) {
      data.ownerPhone = tokens[0];
      if (!valuePresent(data.ownerAlternatePhone)) {
        const alternate = normalizeIndianPhone(tokens[1]);
        if (alternate) data.ownerAlternatePhone = alternate;
        else issues.push({ field: "ownerAlternatePhone", originalValue: tokens[1], message: "Second phone number in the cell could not be validated and was dropped; the primary phone was kept", severity: "WARNING" });
      }
    }
  }
  if (valuePresent(data.ownerPhone)) {
    const phone = normalizeIndianPhone(String(data.ownerPhone));
    if (!phone) issues.push({ field: "ownerPhone", originalValue: String(data.ownerPhone), message: "Invalid Indian mobile number", severity: "ERROR" });
    else data.ownerPhone = phone;
  }
  if (valuePresent(data.ownerAlternatePhone)) {
    const phone = normalizeIndianPhone(String(data.ownerAlternatePhone));
    if (!phone) issues.push({ field: "ownerAlternatePhone", originalValue: String(data.ownerAlternatePhone), message: "Invalid Indian mobile number", severity: "ERROR" });
    else data.ownerAlternatePhone = phone;
  }
  convert("listingType", (v) => parseEnum(v, ["RENT", "SALE"], { rental: "RENT", buy: "SALE" }), "Use RENT or SALE");
  convert("assetClass", (v) => parseEnum(v, ["RESIDENTIAL", "COMMERCIAL"], { residential: "RESIDENTIAL", commercial: "COMMERCIAL" }), "Use RESIDENTIAL or COMMERCIAL");
  convert("commercialFitOut", (v) => parseEnum(v, ["FURNISHED", "SEMI_FURNISHED", "BARE_SHELL"], { "bare shell": "BARE_SHELL", semi: "SEMI_FURNISHED" }), "Unsupported commercial fit-out");
  convert("propertyType", (v) => parseEnum(v, ["APARTMENT", "INDEPENDENT_HOUSE", "VILLA", "BUILDER_FLOOR", "PLOT", "COMMERCIAL_SHOP", "COMMERCIAL_OFFICE", "PG"], { flat: "APARTMENT", floor: "BUILDER_FLOOR" }), "Unsupported property type");
  // STATUS is sometimes used for a free-text broker note instead of an
  // actual status ("YH BNA RHE HAI" / "ABHI NHI DIKHANA" - Hindi/Punjabi
  // notes seen on the real KP workbook), not a classification mistake to
  // hard-block on - same "confidence-based, never force-fit free text into
  // an enum" rule as parseSourceDetailed. An unrecognized value is left
  // unset (falls through to the schema's AVAILABLE default) with a WARNING
  // instead of an ERROR; a recognized value is still applied normally.
  if (valuePresent(data.status)) {
    const parsedStatus = parseEnum(data.status, ["AVAILABLE", "RESERVED", "RENTED", "SOLD", "INACTIVE"], { active: "AVAILABLE", "not available": "INACTIVE", unavailable: "INACTIVE" });
    if (parsedStatus === null) {
      issues.push({ field: "status", originalValue: String(data.status), message: "Status column contains unrecognized text - left unset (defaults to Available), please verify", severity: "WARNING" });
      delete data.status;
    } else data.status = parsedStatus;
  }
  convert("furnishing", (v) => parseEnum(v, ["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"], { semi: "SEMI_FURNISHED", "semi furnished": "SEMI_FURNISHED" }), "Unsupported furnishing value");
  convert("areaUnit", (v) => parseEnum(v, ["SQ_FT", "SQ_YD", "SQ_M", "ACRE", "OTHER"], { sqft: "SQ_FT", "sq ft": "SQ_FT", sqyd: "SQ_YD", "sq yd": "SQ_YD", gaj: "SQ_YD", sqm: "SQ_M", "sq m": "SQ_M" }), "Unsupported area unit");
  convert("possessionStatus", (v) => parseEnum(v, ["READY_TO_MOVE", "UNDER_CONSTRUCTION", "BOOKING", "TENANTED", "UNKNOWN"], { rtm: "READY_TO_MOVE", "ready to move": "READY_TO_MOVE", "ready": "READY_TO_MOVE", "under construction": "UNDER_CONSTRUCTION" }), "Unsupported possession status");
  if (valuePresent(data.availableFrom)) {
    const parsed = new Date(String(data.availableFrom));
    if (Number.isNaN(parsed.getTime())) issues.push({ field: "availableFrom", originalValue: String(data.availableFrom), message: "Use an unambiguous date", severity: "ERROR" });
    else data.availableFrom = parsed.toISOString();
  }
  if (valuePresent(data.possessionNotes)) {
    const possession = normalizeHeader(String(data.possessionNotes));
    if (["ready", "ready to move", "rtm"].includes(possession)) data.possessionNotes = "Ready to Move";
  }
  return { data, issues, sourceResolutionRequired };
}

export function validateImportedProperty(data: Record<string, unknown>, issues: ImportFieldIssue[]): ImportFieldIssue[] {
  const safeData: Record<string, unknown> = { amenities: [], images: [], description: data.description ?? "Imported from inventory spreadsheet", ...data };
  if (safeData.inventorySource === "DIRECT") safeData.partnerId = null;
  const result = importCreatePropertySchema.safeParse(safeData);
  if (!result.success) {
    for (const issue of result.error.issues) issues.push({ field: issue.path.join(".") || "row", message: issue.message, severity: "ERROR" });
  }
  return issues;
}

export function validateImportedPropertyUpdate(data: Record<string, unknown>, issues: ImportFieldIssue[]): ImportFieldIssue[] {
  const result = propertySchema.partial().safeParse(data);
  if (!result.success) for (const issue of result.error.issues) issues.push({ field: issue.path.join(".") || "row", message: issue.message, severity: "ERROR" });
  return issues;
}

function comparable(value: unknown): string { return normalizeHeader(String(value ?? "")); }
function normalizedAddress(data: Record<string, unknown>): string { return comparable(`${data.area ?? ""} ${data.address ?? ""}`); }

export function classifyDuplicate(data: Record<string, unknown>, existing: ExistingPropertyCandidate[]): { duplicateClass: DuplicateClassValue; match: ExistingPropertyCandidate | null; reasons: string[] } {
  let best: { score: number; match: ExistingPropertyCandidate; reasons: string[] } | null = null;
  for (const candidate of existing) {
    let score = 0; const reasons: string[] = [];
    if (valuePresent(data.propertyCode) && comparable(data.propertyCode) === comparable(candidate.propertyCode)) { score += 100; reasons.push("same property code"); }
    if (data.ownerPhone && comparable(data.ownerPhone) === comparable(candidate.ownerPhone)) { score += 45; reasons.push("same owner phone"); }
    if (normalizedAddress(data) && normalizedAddress(data) === normalizedAddress(candidate as Record<string, unknown>)) { score += 55; reasons.push("exact normalized address"); }
    if (comparable(data.area) === comparable(candidate.area)) { score += 12; reasons.push("same locality"); }
    if (data.floorNumber != null && data.floorNumber === candidate.floorNumber) { score += 10; reasons.push("same floor"); }
    if (data.builtUpAreaSqft && data.builtUpAreaSqft === candidate.builtUpAreaSqft) { score += 12; reasons.push("same area"); }
    if ((data.monthlyRent && data.monthlyRent === candidate.monthlyRent) || (data.salePrice && data.salePrice === candidate.salePrice)) { score += 6; reasons.push("same price"); }
    if (data.bhk != null && data.bhk === candidate.bhk) { score += 8; reasons.push("same BHK"); }
    if (!best || score > best.score) best = { score, match: candidate, reasons };
  }
  if (!best || best.score < 18) return { duplicateClass: "NEW", match: null, reasons: [] };
  if (best.score >= 90 || (best.reasons.includes("same owner phone") && best.reasons.includes("exact normalized address"))) return { duplicateClass: "EXACT_DUPLICATE", match: best.match, reasons: best.reasons };
  if (best.score >= 45) return { duplicateClass: "PROBABLE_DUPLICATE", match: best.match, reasons: best.reasons };
  return { duplicateClass: "POSSIBLE_DUPLICATE", match: best.match, reasons: best.reasons };
}

export function defaultImportAction(mode: InventoryImportModeValue, duplicateClass: DuplicateClassValue): ImportActionValue {
  if (mode === "CREATE_ONLY") return duplicateClass === "NEW" ? "CREATE" : "SKIP";
  if (mode === "UPDATE_EXISTING_ONLY") return duplicateClass === "EXACT_DUPLICATE" ? "UPDATE_EXISTING" : "SKIP";
  return duplicateClass === "EXACT_DUPLICATE" ? "UPDATE_EXISTING" : duplicateClass === "NEW" ? "CREATE" : "SKIP";
}

export function fieldDiff(existing: ExistingPropertyCandidate | null, incoming: Record<string, unknown>, allowBlankClear = false) {
  if (!existing) return [];
  return Object.entries(incoming).filter(([field]) => field !== "propertyCode" && field !== "partnerName").flatMap(([field, next]) => {
    if (!allowBlankClear && !valuePresent(next)) return [];
    const before = existing[field];
    return JSON.stringify(before ?? null) === JSON.stringify(next ?? null) ? [] : [{ field, before: before ?? null, after: next ?? null }];
  });
}

export function protectCsvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function errorsToCsv(rows: Array<{ rowNumber: number; issues: ImportFieldIssue[] }>): string {
  const lines = [["Row", "Field", "Original Value", "Error", "Suggested Action"].map(protectCsvCell).join(",")];
  for (const row of rows) for (const issue of row.issues) lines.push([row.rowNumber, issue.field, issue.originalValue ?? "", issue.message, "Correct the cell and re-import"].map(protectCsvCell).join(","));
  return lines.join("\r\n");
}

export const INVENTORY_TEMPLATE_HEADERS = IMPORTABLE_PROPERTY_FIELDS.filter((field) => field !== "parkingLift" && field !== "partnerName").join(",");
