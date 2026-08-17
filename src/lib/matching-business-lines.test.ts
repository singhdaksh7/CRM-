import { describe, it, expect } from "vitest";
import { matchPropertyToLead, matchPropertiesToLead } from "./matching";
import type { Property, Lead } from "@prisma/client";

/**
 * Cross-business-line isolation for the four supported flows:
 * Residential Rent, Residential Sale, Commercial Rent, Commercial Sale.
 *
 * These are the hard gates the whole product depends on - a commercial
 * enquiry must never be shown a flat, a rental enquiry must never be shown a
 * sale listing, and commercial matching must never depend on BHK (commercial
 * properties store bhk = 0 by design).
 */

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop1",
    organizationId: "org_default",
    propertyCode: "PROP-0001",
    title: "Test Apartment",
    propertyType: "APARTMENT",
    listingType: "RENT",
    assetClass: "RESIDENTIAL",
    status: "AVAILABLE",
    description: "A test property",
    city: "Delhi",
    area: "Janakpuri",
    address: "123 Test Street",
    landmark: null,
    latitude: null,
    longitude: null,
    monthlyRent: 20000,
    securityDeposit: 40000,
    maintenanceCharge: 1000,
    rentBrokerage: 20000,
    salePrice: null,
    negotiable: false,
    bhk: 2,
    bathrooms: 2,
    balconies: 1,
    furnishing: "SEMI_FURNISHED",
    builtUpAreaSqft: 900,
    parkingAvailable: true,
    liftAvailable: true,
    availableFrom: null,
    amenities: "[]",
    images: "[]",
    coverImage: null,
    commercialFitOut: null,
    workstations: null,
    cabins: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Property;
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead1",
    organizationId: "org_default",
    leadCode: "LEAD-0001",
    clientName: "Test Client",
    phone: "+919876543210",
    email: null,
    source: "WEBSITE",
    assetClass: "RESIDENTIAL",
    transactionType: "RENT",
    requirementType: "RENT",
    preferredLocation: "Janakpuri",
    minBudget: 18000,
    maxBudget: 20000,
    preferredBhk: 2,
    furnishingPref: "SEMI_FURNISHED",
    moveInDate: null,
    commercialPropertyType: null,
    minAreaSqft: null,
    maxAreaSqft: null,
    commercialFitOutPref: null,
    parkingRequired: null,
    liftRequired: null,
    status: "NEW",
    priority: "WARM",
    score: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Lead;
}

const residentialRentProperty = property({ assetClass: "RESIDENTIAL", listingType: "RENT", monthlyRent: 19000 });
const residentialSaleProperty = property({ id: "prop2", assetClass: "RESIDENTIAL", listingType: "SALE", monthlyRent: null, salePrice: 9000000 });
const commercialRentProperty = property({
  id: "prop3", assetClass: "COMMERCIAL", listingType: "RENT", propertyType: "COMMERCIAL_OFFICE",
  bhk: 0, bathrooms: 0, builtUpAreaSqft: 2400, monthlyRent: 190000, area: "Janakpuri",
});
const commercialSaleProperty = property({
  id: "prop4", assetClass: "COMMERCIAL", listingType: "SALE", propertyType: "COMMERCIAL_OFFICE",
  bhk: 0, bathrooms: 0, builtUpAreaSqft: 2400, monthlyRent: null, salePrice: 19000000, area: "Janakpuri",
});

const residentialRentLead = lead({ assetClass: "RESIDENTIAL", transactionType: "RENT", requirementType: "RENT", minBudget: 18000, maxBudget: 20000 });
const residentialSaleLead = lead({ id: "lead2", assetClass: "RESIDENTIAL", transactionType: "SALE", requirementType: "BUY", minBudget: 8000000, maxBudget: 9500000 });
const commercialRentLead = lead({
  id: "lead3", assetClass: "COMMERCIAL", transactionType: "RENT", requirementType: "RENT",
  minBudget: 180000, maxBudget: 200000, preferredBhk: null, commercialPropertyType: "COMMERCIAL_OFFICE" as never,
});
const commercialSaleLead = lead({
  id: "lead4", assetClass: "COMMERCIAL", transactionType: "SALE", requirementType: "BUY",
  minBudget: 18000000, maxBudget: 20000000, preferredBhk: null, commercialPropertyType: "COMMERCIAL_OFFICE" as never,
});

describe("each business line matches its own inventory", () => {
  it("matches a residential rental lead to a residential rental property", () => {
    expect(matchPropertyToLead(residentialRentProperty, residentialRentLead)).not.toBeNull();
  });

  it("matches a residential sale lead to a residential sale property", () => {
    expect(matchPropertyToLead(residentialSaleProperty, residentialSaleLead)).not.toBeNull();
  });

  it("matches a commercial rental lead to a commercial rental property", () => {
    expect(matchPropertyToLead(commercialRentProperty, commercialRentLead)).not.toBeNull();
  });

  it("matches a commercial sale lead to a commercial sale property", () => {
    expect(matchPropertyToLead(commercialSaleProperty, commercialSaleLead)).not.toBeNull();
  });
});

describe("asset class never crosses over", () => {
  it("never shows a commercial property to a residential lead", () => {
    expect(matchPropertyToLead(commercialRentProperty, residentialRentLead)).toBeNull();
    expect(matchPropertyToLead(commercialSaleProperty, residentialSaleLead)).toBeNull();
  });

  it("never shows a residential property to a commercial lead", () => {
    expect(matchPropertyToLead(residentialRentProperty, commercialRentLead)).toBeNull();
    expect(matchPropertyToLead(residentialSaleProperty, commercialSaleLead)).toBeNull();
  });
});

describe("transaction type never crosses over", () => {
  it("never shows a sale listing to a rental lead", () => {
    expect(matchPropertyToLead(residentialSaleProperty, residentialRentLead)).toBeNull();
    expect(matchPropertyToLead(commercialSaleProperty, commercialRentLead)).toBeNull();
  });

  it("never shows a rental listing to a sale lead", () => {
    expect(matchPropertyToLead(residentialRentProperty, residentialSaleLead)).toBeNull();
    expect(matchPropertyToLead(commercialRentProperty, commercialSaleLead)).toBeNull();
  });

  it("derives the transaction from requirementType for a legacy lead with no transactionType", () => {
    const legacyRent = lead({ transactionType: undefined as never, requirementType: "RENT" });
    expect(matchPropertyToLead(residentialRentProperty, legacyRent)).not.toBeNull();
    expect(matchPropertyToLead(residentialSaleProperty, legacyRent)).toBeNull();
  });
});

describe("commercial matching never depends on BHK", () => {
  it("matches a commercial lead with no BHK preference against a zero-BHK property", () => {
    const result = matchPropertyToLead(commercialRentProperty, commercialRentLead);
    expect(result).not.toBeNull();
    expect(result!.reasons.some((r) => r.label === "BHK")).toBe(false);
  });

  it("ignores a stray BHK preference left on a commercial lead", () => {
    const strayBhk = lead({ ...commercialRentLead, preferredBhk: 3 } as Partial<Lead>);
    expect(matchPropertyToLead(commercialRentProperty, strayBhk)).not.toBeNull();
  });

  it("scores identically whether or not the commercial lead carries a BHK value", () => {
    const withBhk = matchPropertyToLead(commercialRentProperty, lead({ ...commercialRentLead, preferredBhk: 4 } as Partial<Lead>));
    const withoutBhk = matchPropertyToLead(commercialRentProperty, commercialRentLead);
    expect(withBhk!.score).toBe(withoutBhk!.score);
  });
});

describe("commercial-specific hard gates", () => {
  it("rejects a mismatched commercial property type", () => {
    const warehouseLead = lead({ ...commercialRentLead, commercialPropertyType: "WAREHOUSE" } as Partial<Lead>);
    expect(matchPropertyToLead(commercialRentProperty, warehouseLead)).toBeNull();
  });

  it("rejects a property below the required minimum area", () => {
    const bigAreaLead = lead({ ...commercialRentLead, minAreaSqft: 5000 } as Partial<Lead>);
    expect(matchPropertyToLead(commercialRentProperty, bigAreaLead)).toBeNull();
  });

  it("rejects a property above the required maximum area", () => {
    const smallAreaLead = lead({ ...commercialRentLead, maxAreaSqft: 1000 } as Partial<Lead>);
    expect(matchPropertyToLead(commercialRentProperty, smallAreaLead)).toBeNull();
  });

  it("rejects a property with no parking when parking is required", () => {
    const parkingLead = lead({ ...commercialRentLead, parkingRequired: true } as Partial<Lead>);
    expect(matchPropertyToLead(property({ ...commercialRentProperty, parkingAvailable: false } as Partial<Property>), parkingLead)).toBeNull();
    expect(matchPropertyToLead(commercialRentProperty, parkingLead)).not.toBeNull();
  });

  it("rejects a property with no lift when a lift is required", () => {
    const liftLead = lead({ ...commercialRentLead, liftRequired: true } as Partial<Lead>);
    expect(matchPropertyToLead(property({ ...commercialRentProperty, liftAvailable: false } as Partial<Property>), liftLead)).toBeNull();
  });

  it("still requires the property to be AVAILABLE", () => {
    expect(matchPropertyToLead(property({ ...commercialRentProperty, status: "RENTED" } as Partial<Property>), commercialRentLead)).toBeNull();
  });
});

describe("mixed inventory is filtered per business line", () => {
  const inventory = [residentialRentProperty, residentialSaleProperty, commercialRentProperty, commercialSaleProperty];

  it("returns only the residential rental property for a residential rental lead", () => {
    expect(matchPropertiesToLead(inventory, residentialRentLead).map((m) => m.property.id)).toEqual(["prop1"]);
  });

  it("returns only the residential sale property for a residential sale lead", () => {
    expect(matchPropertiesToLead(inventory, residentialSaleLead).map((m) => m.property.id)).toEqual(["prop2"]);
  });

  it("returns only the commercial rental property for a commercial rental lead", () => {
    expect(matchPropertiesToLead(inventory, commercialRentLead).map((m) => m.property.id)).toEqual(["prop3"]);
  });

  it("returns only the commercial sale property for a commercial sale lead", () => {
    expect(matchPropertiesToLead(inventory, commercialSaleLead).map((m) => m.property.id)).toEqual(["prop4"]);
  });
});
