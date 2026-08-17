import { createPropertySchema, propertySchema } from "./validators";
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
  propertyCode: ["property code", "serial number", "serial no", "s no", "sr no", "id"],
  title: ["title", "property title", "name"], listingType: ["listing type", "rent sale", "deal type"],
  propertyType: ["property type", "type", "category"], inventorySource: ["dir ind", "direct indirect", "source", "inventory source"],
  partnerName: ["inventory partner", "partner", "broker", "broker name", "company"], area: ["location", "locality", "area", "sector"],
  address: ["address", "specific address", "complete address", "block pocket", "block", "pocket"], buildingName: ["building", "building name", "society"],
  landmark: ["landmark", "near"], pincode: ["pincode", "pin code", "postal code"], monthlyRent: ["rent", "monthly rent", "price rent"],
  salePrice: ["sale price", "selling price", "price"], floorNumber: ["floor", "floor number"], totalFloors: ["total floors", "floors"],
  builtUpAreaSqft: ["sq ft", "sqft", "square feet", "area sqft", "built up area", "builtup area"], carpetAreaSqft: ["carpet area", "carpet sqft"],
  dimension: ["dimension", "dimensions", "size"], possessionNotes: ["possession", "availability", "available"], availableFrom: ["available from", "possession date"],
  bhk: ["bhk", "bedrooms", "beds"], bathrooms: ["bathrooms", "bathroom", "baths"], furnishing: ["furnishing", "furnished"],
  parkingAvailable: ["parking", "parking facility"], liftAvailable: ["lift", "elevator"], status: ["status", "availability status"],
  ownerName: ["owner name", "owner"], ownerPhone: ["owner no", "owner phone", "mobile", "phone", "contact"],
  ownerAlternatePhone: ["alternate phone", "alternate no", "other phone"], internalNotes: ["notes", "remarks", "additional notes"],
  description: ["description", "details"], parkingLift: ["parking lift", "parking elevator"], assetClass: ["asset class", "residential commercial", "segment"], superAreaSqft: ["super area", "super area sqft"], frontageFeet: ["frontage", "frontage feet"], workstations: ["workstations", "seats"], cabins: ["cabins"], commercialFitOut: ["fit out", "fitout", "commercial furnishing"], goodsLiftAvailable: ["goods lift"], leaseTermMonths: ["lease term", "lease months"], lockInPeriodMonths: ["lock in", "lockin"], camCharge: ["cam", "cam charge"], expectedPrice: ["expected price"],
};

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

function parseEnum(raw: unknown, values: string[], aliasesMap: Record<string, string> = {}): string | null {
  const normalized = normalizeHeader(String(raw ?? ""));
  const byAlias = aliasesMap[normalized];
  if (byAlias) return byAlias;
  return values.find((v) => normalizeHeader(v) === normalized) ?? null;
}

function valuePresent(value: unknown): boolean { return value !== undefined && value !== null && String(value).trim() !== ""; }

export function normalizeMappedRow(raw: Record<string, unknown>, mapping: Record<string, string>): { data: Record<string, unknown>; issues: ImportFieldIssue[] } {
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
  convert("inventorySource", parseInventorySource, "Use DIR/DIRECT or IND/INDIRECT");
  for (const field of ["monthlyRent", "salePrice", "camCharge", "expectedPrice"]) convert(field, parseMoney, "Enter an unambiguous amount such as 25000 or 25k");
  for (const field of ["builtUpAreaSqft", "carpetAreaSqft", "superAreaSqft"]) convert(field, parseArea, "Enter square feet such as 850 or 850 sq ft");
  for (const field of ["floorNumber", "totalFloors"]) convert(field, parseFloor, "Enter a floor number such as 2 or Second Floor");
  for (const field of ["parkingAvailable", "liftAvailable"]) convert(field, parseBoolean, "Use Yes/Y/Available or No/N");
  for (const field of ["bhk", "bathrooms", "workstations", "cabins", "leaseTermMonths", "lockInPeriodMonths"]) convert(field, (v) => /^\d+$/.test(String(v).trim()) ? Number(v) : null, "Enter a whole number");
  if (valuePresent(data.parkingLift)) {
    const text = normalizeHeader(String(data.parkingLift));
    data.parkingAvailable = /parking/.test(text) && !/no parking/.test(text);
    data.liftAvailable = /(lift|elevator)/.test(text) && !/(no lift|no elevator)/.test(text);
    delete data.parkingLift;
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
  convert("status", (v) => parseEnum(v, ["AVAILABLE", "RESERVED", "RENTED", "SOLD", "INACTIVE"], { active: "AVAILABLE" }), "Unsupported property status");
  convert("furnishing", (v) => parseEnum(v, ["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"], { semi: "SEMI_FURNISHED", "semi furnished": "SEMI_FURNISHED" }), "Unsupported furnishing value");
  if (valuePresent(data.availableFrom)) {
    const parsed = new Date(String(data.availableFrom));
    if (Number.isNaN(parsed.getTime())) issues.push({ field: "availableFrom", originalValue: String(data.availableFrom), message: "Use an unambiguous date", severity: "ERROR" });
    else data.availableFrom = parsed.toISOString();
  }
  if (valuePresent(data.possessionNotes)) {
    const possession = normalizeHeader(String(data.possessionNotes));
    if (["ready", "ready to move", "rtm"].includes(possession)) data.possessionNotes = "Ready to Move";
  }
  return { data, issues };
}

export function validateImportedProperty(data: Record<string, unknown>, issues: ImportFieldIssue[]): ImportFieldIssue[] {
  const safeData: Record<string, unknown> = { amenities: [], images: [], description: data.description ?? "Imported from inventory spreadsheet", ...data };
  if (safeData.inventorySource === "DIRECT") safeData.partnerId = null;
  const result = createPropertySchema.safeParse(safeData);
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
