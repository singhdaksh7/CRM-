export const IMPORTABLE_PROPERTY_FIELDS = [
  "propertyCode", "title", "listingType", "propertyType", "inventorySource", "partnerName", "area", "address",
  "buildingName", "landmark", "pincode", "monthlyRent", "salePrice", "floorNumber", "totalFloors", "builtUpAreaSqft",
  "carpetAreaSqft", "dimension", "possessionNotes", "availableFrom", "bhk", "bathrooms", "furnishing", "parkingAvailable",
  "liftAvailable", "status", "ownerName", "ownerPhone", "ownerAlternatePhone", "internalNotes", "description", "parkingLift", "assetClass", "superAreaSqft", "frontageFeet", "workstations", "cabins", "commercialFitOut", "goodsLiftAvailable", "leaseTermMonths", "lockInPeriodMonths", "camCharge", "expectedPrice",
] as const;
export type ImportablePropertyField = (typeof IMPORTABLE_PROPERTY_FIELDS)[number];
export type ImportActionValue = "CREATE" | "UPDATE_EXISTING" | "SKIP";

export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[_/\\-]+/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
export function headerSignature(headers: string[]): string {
  return [...new Set(headers.map(normalizeHeader).filter(Boolean))].sort().join("|");
}
