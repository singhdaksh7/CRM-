import { describe, it, expect } from "vitest";
import { toPublicCatalogueDTO, budgetSummary } from "./catalogue-dto";
import { catalogueSpecChips } from "./catalogue-specs";
import { PUBLIC_PROPERTY_SELECT } from "./public-property-select";

/**
 * Commercial listings go through the SAME public catalogue DTO and the same
 * /p/[id] select as residential - no separate share path. These pin that a
 * commercial listing renders commercial specs (never "0 BHK") and that its
 * private location data (shop/unit number, exact address, GPS, entry
 * instructions, internal notes) never reaches the client, even when staff
 * ticked "include address".
 */

const SENTINELS = {
  address: "Shop 4, Ground Floor, 12 Main Market Road",
  flatNumber: "SHOP-4-SECRET",
  buildingName: "Trade Tower Private",
  gateNumber: "Service Gate 3",
  entryInstructions: "Collect shutter key from guard",
  internalNotes: "Owner open to 10% lower",
  negotiationNotes: "Floor is 85k",
  hiddenRemarks: "Water seepage at rear",
  ownerName: "Commercial Owner Secret",
  ownerPhone: "+917777777777",
  latitude: 28.65123,
  longitude: 77.12345,
};

const commercialShop = {
  id: "shop1",
  title: "Main road shop",
  area: "Rajouri Garden",
  assetClass: "COMMERCIAL",
  propertyType: "SHOP",
  listingType: "RENT",
  status: "AVAILABLE",
  monthlyRent: 90000,
  salePrice: null,
  rentBrokerage: 90000,
  saleBrokerageAmount: null,
  bhk: 0,
  bathrooms: 0,
  furnishing: null,
  builtUpAreaSqft: 400,
  workstations: null,
  cabins: null,
  washrooms: 1,
  amenities: "[]",
  images: "[]",
  coverImage: null,
  availableFrom: null,
  possessionStatus: "READY_TO_MOVE",
  liftAvailable: false,
  parkFacing: null,
  ...SENTINELS,
};

function catalogue(overrides: Record<string, unknown> = {}) {
  return {
    id: "cat1",
    token: "tok",
    title: "Commercial shortlist",
    introMessage: null,
    status: "ACTIVE",
    expiresAt: null,
    includePrice: true,
    includeAddress: true, // staff opted in - must still not leak
    includeBrokerage: false,
    organization: { name: "KP Properties", phone: null, logoUrl: null },
    lead: { clientName: "Asha Retail", requirementType: "RENT", preferredBhk: null, preferredLocation: "Rajouri Garden", minBudget: 50000, maxBudget: 100000, assetClass: "COMMERCIAL" },
    properties: [{ property: commercialShop, customNote: null, priceVisible: true, addressVisible: true, brokerageVisible: false, removedAt: null }],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("public catalogue - commercial", () => {
  it("renders commercial specs, never 0 BHK / 0 Bath", () => {
    const dto = toPublicCatalogueDTO(catalogue());
    const [p] = dto.properties;
    expect(p.assetClass).toBe("COMMERCIAL");
    expect(p.propertyType).toBe("SHOP");
    const labels = catalogueSpecChips(p).map((c) => c.label);
    expect(labels).toEqual(["Shop", "1 washroom", "400 sqft"]);
    expect(labels.join(" ")).not.toMatch(/BHK|Bath/);
  });

  it("describes the requirement as commercial without a BHK clause", () => {
    expect(budgetSummary(catalogue().lead)).toMatch(/rental commercial property in Rajouri Garden/);
  });

  it("never leaks shop/unit number, exact address, GPS, entry instructions, internal notes or owner contact", () => {
    const serialized = JSON.stringify(toPublicCatalogueDTO(catalogue()));
    for (const [field, value] of Object.entries(SENTINELS)) {
      expect(serialized, `${field} leaked`).not.toContain(String(value));
    }
    const [p] = toPublicCatalogueDTO(catalogue()).properties;
    expect(p.address).toBeNull();
    expect(p.latitude).toBeNull();
    expect(p.longitude).toBeNull();
    expect(p.locationDisclosure).toBe("HIDDEN");
    // Locality stays public per existing policy.
    expect(p.area).toBe("Rajouri Garden");
  });
});

describe("public /p/[id] select - commercial", () => {
  it("selects commercial specs but none of the private location/contact fields", () => {
    for (const field of ["assetClass", "propertyType", "washrooms", "workstations", "cabins", "carpetAreaSqft"]) {
      expect(PUBLIC_PROPERTY_SELECT).toHaveProperty(field, true);
    }
    for (const field of ["address", "flatNumber", "buildingName", "gateNumber", "entryInstructions", "internalNotes", "latitude", "longitude", "ownerPhone"]) {
      expect(PUBLIC_PROPERTY_SELECT).not.toHaveProperty(field);
    }
  });
});
