/**
 * Single source of truth for the Residential/Commercial category split over
 * the existing `PropertyType` enum (see prisma/schema.prisma). The schema
 * already carries `AssetClass` on Property/Lead/LeadRequirement/
 * CustomerRequirement and every commercial PropertyType value - this module
 * only centralizes WHICH types belong to which category so the form, the
 * validators, the filters, the import pipeline and the matchers all agree,
 * instead of each keeping its own hand-copied list (they had already
 * drifted: the property form, requirement panel and validators each listed
 * a slightly different set).
 *
 * Pure and dependency-free (no Prisma runtime import) so it is safe in
 * client components and unit tests alike.
 */

export type PropertyCategory = "RESIDENTIAL" | "COMMERCIAL";

/** Residential types offered for new/edited residential inventory. PLOT stays residential (existing convention - see inventory-import-core.ts deriveSheetContext). */
export const RESIDENTIAL_PROPERTY_TYPES = ["APARTMENT", "INDEPENDENT_HOUSE", "VILLA", "BUILDER_FLOOR", "PLOT", "STUDIO", "FARM_HOUSE", "PG", "CO_LIVING", "OTHER"] as const;

/** Commercial types offered for new commercial inventory/requirements. COMMERCIAL_LAND is presented as "Commercial Plot / Land". */
export const COMMERCIAL_PROPERTY_TYPES = ["SHOP", "OFFICE", "SHOWROOM", "WAREHOUSE", "COMMERCIAL_LAND", "INDUSTRIAL", "CO_WORKING", "RESTAURANT_SPACE", "SCO", "OTHER_COMMERCIAL"] as const;

/**
 * Pre-AssetClass commercial values. Still valid enum members (and still
 * produced by the inventory importer's sheet-context detection), so they
 * stay accepted everywhere - they are just not offered as a fresh choice,
 * and are treated as equivalent to their modern counterpart for matching
 * and filtering (see canonicalPropertyType).
 */
export const LEGACY_COMMERCIAL_PROPERTY_TYPES = ["COMMERCIAL_SHOP", "COMMERCIAL_OFFICE"] as const;

export const ALL_COMMERCIAL_PROPERTY_TYPES = [...COMMERCIAL_PROPERTY_TYPES, ...LEGACY_COMMERCIAL_PROPERTY_TYPES] as const;

/** Every PropertyType enum value, in a tuple zod's z.enum() accepts. Must stay in sync with `enum PropertyType` in schema.prisma (asserted by property-categories.test.ts). */
export const PROPERTY_TYPE_VALUES = [...RESIDENTIAL_PROPERTY_TYPES, ...ALL_COMMERCIAL_PROPERTY_TYPES] as const;

const COMMERCIAL_SET = new Set<string>(ALL_COMMERCIAL_PROPERTY_TYPES);
const RESIDENTIAL_SET = new Set<string>(RESIDENTIAL_PROPERTY_TYPES);

const LEGACY_TO_CANONICAL: Record<string, string> = { COMMERCIAL_SHOP: "SHOP", COMMERCIAL_OFFICE: "OFFICE" };

const LABELS: Record<string, string> = {
  COMMERCIAL_LAND: "Commercial Plot / Land",
  SCO: "SCO (Shop-cum-Office)",
  OTHER_COMMERCIAL: "Other Commercial",
  CO_WORKING: "Co-working",
  CO_LIVING: "Co-living",
  PG: "PG",
  COMMERCIAL_SHOP: "Shop",
  COMMERCIAL_OFFICE: "Office",
};

export function isCommercialPropertyType(type: string | null | undefined): boolean {
  return !!type && COMMERCIAL_SET.has(type);
}

export function isResidentialPropertyType(type: string | null | undefined): boolean {
  return !!type && RESIDENTIAL_SET.has(type);
}

/** The category a property type belongs to - never a guess: every enum member is in exactly one of the two lists. */
export function categoryForPropertyType(type: string): PropertyCategory {
  return isCommercialPropertyType(type) ? "COMMERCIAL" : "RESIDENTIAL";
}

/** Whether `type` is a valid choice for `category`. Used by the zod refines so a residential type can never be saved on commercial inventory (or vice versa). */
export function isPropertyTypeAllowedForCategory(category: string | null | undefined, type: string | null | undefined): boolean {
  if (!type) return true;
  return category === "COMMERCIAL" ? isCommercialPropertyType(type) : isResidentialPropertyType(type);
}

/**
 * Options for a Property Type <select> under `category`. A legacy value
 * already stored on the record being edited is kept in the list so opening
 * an old COMMERCIAL_SHOP listing never silently rewrites it to the first
 * option on save.
 */
export function propertyTypeOptionsForCategory(category: string, currentValue?: string | null): string[] {
  const base: string[] = category === "COMMERCIAL" ? [...COMMERCIAL_PROPERTY_TYPES] : [...RESIDENTIAL_PROPERTY_TYPES];
  if (currentValue && !base.includes(currentValue) && isPropertyTypeAllowedForCategory(category, currentValue)) base.push(currentValue);
  return base;
}

export function propertyTypeLabel(type: string | null | undefined): string {
  if (!type) return "-";
  return LABELS[type] ?? type.toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Collapses the legacy COMMERCIAL_SHOP/COMMERCIAL_OFFICE spellings onto SHOP/OFFICE; identity for everything else. */
export function canonicalPropertyType(type: string): string {
  return LEGACY_TO_CANONICAL[type] ?? type;
}

/** Type equality for matching - a "Shop" requirement must still match a listing stored under the legacy COMMERCIAL_SHOP value. */
export function propertyTypesEquivalent(a: string, b: string): boolean {
  return canonicalPropertyType(a) === canonicalPropertyType(b);
}

/** Every stored value a "type = X" filter should match (X plus its legacy alias, if any). */
export function propertyTypeFilterValues(type: string): string[] {
  const canonical = canonicalPropertyType(type);
  return [...new Set([canonical, ...Object.entries(LEGACY_TO_CANONICAL).filter(([, v]) => v === canonical).map(([k]) => k)])];
}

/** Short spec phrase for list rows/cards: "2 BHK" for residential, the commercial type for commercial (which stores bhk = 0 by design and must never render "0 BHK"). */
export function propertySpecSummary(property: { assetClass?: string | null; propertyType: string; bhk: number }): string {
  if (property.assetClass === "COMMERCIAL" || isCommercialPropertyType(property.propertyType)) return propertyTypeLabel(property.propertyType);
  if (property.propertyType === "PLOT") return "Plot";
  return `${property.bhk} BHK`;
}
