/**
 * Pure, dependency-free spec formatting shared by the public catalogue DTO
 * (server) and the public catalogue view (client). Kept out of
 * `catalogue-dto.ts` deliberately: that module pulls in the WhatsApp service
 * graph, which must never reach the client bundle.
 */

export interface CatalogueSpecSource {
  assetClass: string;
  propertyType: string;
  bhk: number;
  bathrooms: number;
  builtUpAreaSqft: number;
  workstations?: number | null;
  cabins?: number | null;
}

export type CatalogueSpecChip = { kind: "bhk" | "bath" | "area" | "commercial"; label: string };

function titleCase(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Client-safe spec chips for one catalogue property.
 *
 * Residential keeps the historical BHK / Bath / sqft trio. Commercial
 * properties store `bhk = 0` and `bathrooms = 0` by design, so rendering the
 * residential trio for them published a literal "0 BHK - 0 Bath" to the
 * client. Commercial instead shows the commercial property type and any
 * captured workstation/cabin counts alongside the built-up area.
 */
export function catalogueSpecChips(property: CatalogueSpecSource): CatalogueSpecChip[] {
  if (property.assetClass === "COMMERCIAL") {
    const chips: CatalogueSpecChip[] = [{ kind: "commercial", label: titleCase(property.propertyType) }];
    if (property.workstations) chips.push({ kind: "commercial", label: `${property.workstations} workstations` });
    if (property.cabins) chips.push({ kind: "commercial", label: `${property.cabins} cabins` });
    chips.push({ kind: "area", label: `${property.builtUpAreaSqft} sqft` });
    return chips;
  }
  return [
    { kind: "bhk", label: `${property.bhk} BHK` },
    { kind: "bath", label: `${property.bathrooms} Bath` },
    { kind: "area", label: `${property.builtUpAreaSqft} sqft` },
  ];
}
