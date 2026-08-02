import { describe, it, expect } from "vitest";
import { matchPropertyToLead, matchPropertiesToLead } from "./matching";
import type { Property, Lead } from "@prisma/client";

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop1",
    organizationId: "org_default",
    propertyCode: "PROP-0001",
    title: "Test Apartment",
    propertyType: "APARTMENT",
    listingType: "RENT",
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
    pricePerSqft: null,
    saleBrokeragePct: null,
    saleBrokerageAmount: null,
    negotiable: false,
    bhk: 2,
    bathrooms: 2,
    balconies: 1,
    furnishing: "SEMI_FURNISHED",
    floorNumber: 2,
    totalFloors: 5,
    propertyAgeYears: 5,
    builtUpAreaSqft: 900,
    carpetAreaSqft: 750,
    facing: "NORTH",
    parkingAvailable: true,
    tenantPreference: "FAMILY",
    availableFrom: null,
    amenities: "[]",
    images: "[]",
    coverImage: null,
    videoUrl: null,
    virtualTourUrl: null,
    floorPlanImage: null,
    ownerName: "Test Owner",
    ownerPhone: "+919999999999",
    ownerAlternatePhone: null,
    ownerNotes: null,
    createdById: null,
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
    externalLeadId: null,
    requirementType: "RENT",
    preferredLocation: "Janakpuri",
    minBudget: 18000,
    maxBudget: 20000,
    preferredBhk: 2,
    furnishingPref: "SEMI_FURNISHED",
    moveInDate: null,
    additionalRequirements: null,
    assignedToId: null,
    status: "NEW",
    priority: "WARM",
    assignmentStrategy: null,
    assignmentReason: null,
    autoAssignedAt: null,
    score: 0,
    scoreExplanation: null,
    scoreUpdatedAt: null,
    lastContactedAt: null,
    nextFollowUpAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Lead;
}

describe("matchPropertyToLead - hard filters", () => {
  it("rejects a property with the wrong listing type", () => {
    const result = matchPropertyToLead(property({ listingType: "SALE" }), lead({ requirementType: "RENT" }));
    expect(result).toBeNull();
  });

  it("rejects a property that is not AVAILABLE", () => {
    const result = matchPropertyToLead(property({ status: "RENTED" }), lead());
    expect(result).toBeNull();
  });
});

describe("matchPropertyToLead - budget tolerance", () => {
  it("matches a property exactly within budget with full budget score", () => {
    const result = matchPropertyToLead(property({ monthlyRent: 19000 }), lead({ minBudget: 18000, maxBudget: 20000 }));
    expect(result).not.toBeNull();
    expect(result!.aboveBudget).toBe(false);
  });

  it("allows a property up to 10% above budget and labels it as such", () => {
    // 20000 max budget, 10% over = 22000
    const result = matchPropertyToLead(property({ monthlyRent: 21500 }), lead({ minBudget: 15000, maxBudget: 20000 }), 0.2);
    expect(result).not.toBeNull();
    expect(result!.aboveBudget).toBe(true);
    expect(result!.budgetTier).toBe("Up to 10% above budget");
  });

  it("allows a property up to 20% above budget when tolerance is 0.2", () => {
    const result = matchPropertyToLead(property({ monthlyRent: 23500 }), lead({ minBudget: 15000, maxBudget: 20000 }), 0.2);
    expect(result).not.toBeNull();
    expect(result!.budgetTier).toBe("Up to 20% above budget");
  });

  it("rejects a property beyond the configured tolerance", () => {
    const result = matchPropertyToLead(property({ monthlyRent: 30000 }), lead({ minBudget: 15000, maxBudget: 20000 }), 0.2);
    expect(result).toBeNull();
  });

  it("respects a stricter tolerance when the caller passes 0 (exact budget only)", () => {
    const result = matchPropertyToLead(property({ monthlyRent: 20500 }), lead({ minBudget: 15000, maxBudget: 20000 }), 0);
    expect(result).toBeNull();
  });
});

describe("matchPropertyToLead - location matching", () => {
  it("scores a location match higher than a location mismatch", () => {
    const inArea = matchPropertyToLead(property({ area: "Janakpuri" }), lead({ preferredLocation: "Janakpuri" }));
    const outOfArea = matchPropertyToLead(property({ area: "Rohini" }), lead({ preferredLocation: "Janakpuri" }));
    expect(inArea!.score).toBeGreaterThan(outOfArea!.score);
  });
});

describe("matchPropertiesToLead - sorting", () => {
  it("sorts results by descending match score", () => {
    const properties = [
      property({ id: "far", area: "Rohini", monthlyRent: 19000 }),
      property({ id: "perfect", area: "Janakpuri", monthlyRent: 19000, bhk: 2, furnishing: "SEMI_FURNISHED" }),
    ];
    const results = matchPropertiesToLead(properties, lead());
    expect(results[0].property.id).toBe("perfect");
  });
});
