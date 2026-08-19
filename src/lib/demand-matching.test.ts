import { describe, it, expect } from "vitest";
import type { Property, CustomerRequirement, Lead } from "@prisma/client";
import {
  scoreDemandCandidate,
  scoreDemandCandidates,
  classifyTier,
  normalizeCustomerRequirement,
  normalizeLeadRequirement,
  leadIsMatchEligible,
  candidateKeyFor,
  DEFAULT_MATCH_TIER_CONFIG,
  type NormalizedRequirement,
} from "./demand-matching";

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
    liftAvailable: true,
    tenantPreference: "FAMILY",
    availableFrom: null,
    amenities: "[]",
    images: "[]",
    tags: "[]",
    coverImage: null,
    videoUrl: null,
    virtualTourUrl: null,
    floorPlanImage: null,
    ownerName: "Test Owner",
    ownerPhone: "+919999999999",
    ownerAlternatePhone: null,
    ownerNotes: null,
    commercialFitOut: null,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Property;
}

function requirement(overrides: Partial<NormalizedRequirement> = {}): NormalizedRequirement {
  return {
    source: "CONTACT",
    candidateId: "contact1",
    requirementId: "req1",
    assetClass: "RESIDENTIAL",
    transactionType: "RENT",
    preferredLocalities: ["Janakpuri"],
    minBudget: 15000,
    maxBudget: 22000,
    bhk: 2,
    commercialPropertyType: null,
    minArea: null,
    maxArea: null,
    furnishing: "SEMI_FURNISHED",
    parkingRequired: null,
    liftRequired: null,
    commercialFitOutPref: null,
    contactable: true,
    ...overrides,
  };
}

describe("scoreDemandCandidate - hard filters", () => {
  it("excludes a mismatched asset class", () => {
    expect(scoreDemandCandidate(property({ assetClass: "COMMERCIAL" }), requirement({ assetClass: "RESIDENTIAL" }))).toBeNull();
  });
  it("excludes a mismatched transaction type (RENT property vs SALE requirement)", () => {
    expect(scoreDemandCandidate(property({ listingType: "RENT" }), requirement({ transactionType: "SALE" }))).toBeNull();
  });
  it("excludes a non-AVAILABLE property", () => {
    expect(scoreDemandCandidate(property({ status: "RENTED" }), requirement())).toBeNull();
  });
  it("excludes a non-contactable requirement (DNC/opt-out/stale)", () => {
    expect(scoreDemandCandidate(property(), requirement({ contactable: false }))).toBeNull();
  });
  it("excludes when budget overage exceeds the stretch tolerance", () => {
    const result = scoreDemandCandidate(property({ monthlyRent: 30000 }), requirement({ maxBudget: 20000 }), { budgetStretchPct: 0.2 });
    expect(result).toBeNull(); // 50% over > 20% tolerance
  });
  it("never penalizes a property priced below the requirement's max (rule 15)", () => {
    const result = scoreDemandCandidate(property({ monthlyRent: 10000 }), requirement({ maxBudget: 22000 }));
    expect(result).not.toBeNull();
    expect(result!.overagePct).toBe(0);
  });
});

describe("scoreDemandCandidate - commercial isolation (rule 16)", () => {
  it("never sends office space to a residential BHK requirement", () => {
    const officeProperty = property({ assetClass: "COMMERCIAL", propertyType: "COMMERCIAL_OFFICE", listingType: "SALE", salePrice: 5000000, builtUpAreaSqft: 1000 });
    const residentialReq = requirement({ assetClass: "RESIDENTIAL" });
    expect(scoreDemandCandidate(officeProperty, residentialReq)).toBeNull();
  });
  it("commercial requirements never depend on bhk", () => {
    const officeProperty = property({ assetClass: "COMMERCIAL", propertyType: "COMMERCIAL_OFFICE", listingType: "SALE", salePrice: 5000000, builtUpAreaSqft: 1000, bhk: 0 });
    const commercialReq = requirement({ assetClass: "COMMERCIAL", transactionType: "SALE", commercialPropertyType: "COMMERCIAL_OFFICE", maxBudget: 6000000, bhk: null });
    const result = scoreDemandCandidate(officeProperty, commercialReq);
    expect(result).not.toBeNull();
  });
  it("excludes a commercial requirement when property area is outside min/max", () => {
    const officeProperty = property({ assetClass: "COMMERCIAL", propertyType: "COMMERCIAL_OFFICE", listingType: "SALE", salePrice: 5000000, builtUpAreaSqft: 500 });
    const commercialReq = requirement({ assetClass: "COMMERCIAL", transactionType: "SALE", commercialPropertyType: "COMMERCIAL_OFFICE", maxBudget: 6000000, minArea: 800 });
    expect(scoreDemandCandidate(officeProperty, commercialReq)).toBeNull();
  });
  it("excludes a commercial requirement when required parking is unavailable", () => {
    const officeProperty = property({ assetClass: "COMMERCIAL", propertyType: "COMMERCIAL_OFFICE", listingType: "SALE", salePrice: 5000000, builtUpAreaSqft: 1000, parkingAvailable: false });
    const commercialReq = requirement({ assetClass: "COMMERCIAL", transactionType: "SALE", commercialPropertyType: "COMMERCIAL_OFFICE", maxBudget: 6000000, parkingRequired: true });
    expect(scoreDemandCandidate(officeProperty, commercialReq)).toBeNull();
  });
});

describe("classifyTier - tier boundaries", () => {
  const cfg = DEFAULT_MATCH_TIER_CONFIG; // 20% stretch
  it("EXACT: in budget, exact locality, high score", () => {
    expect(classifyTier(90, 0, "exact", cfg)).toBe("EXACT");
  });
  it("STRONG: modest overage within half the stretch tolerance", () => {
    expect(classifyTier(70, 0.08, "exact", cfg)).toBe("STRONG"); // 8% <= 10% half-stretch
  });
  it("STRETCH: overage in the upper half of the stretch tolerance", () => {
    expect(classifyTier(70, 0.15, "exact", cfg)).toBe("STRETCH"); // 15% > 10% half-stretch
  });
  it("LOW: in budget but weak secondary fit", () => {
    expect(classifyTier(40, 0, "none", cfg)).toBe("LOW");
  });
  it("in-budget with a middling score classifies as STRONG, not EXACT, when locality isn't exact", () => {
    expect(classifyTier(70, 0, "nearby", cfg)).toBe("STRONG");
  });
});

describe("scoreDemandCandidate - end-to-end tier examples (spec section 14)", () => {
  // ~1cr property, matching spec section 14's worked example shape.
  const expensiveSale = property({ listingType: "SALE", salePrice: 10_000_000, assetClass: "RESIDENTIAL", bhk: 3, area: "Rajouri Garden" });
  it("customer max 9,500,000 (5% over) -> STRONG or better", () => {
    const result = scoreDemandCandidate(expensiveSale, requirement({ transactionType: "SALE", maxBudget: 9_500_000, preferredLocalities: ["Rajouri Garden"], bhk: 3 }));
    expect(result).not.toBeNull();
    expect(["EXACT", "STRONG"]).toContain(result!.tier);
  });
  it("customer max 8,000,000 (25% over, beyond default 20% stretch) -> excluded entirely", () => {
    const result = scoreDemandCandidate(expensiveSale, requirement({ transactionType: "SALE", maxBudget: 8_000_000, preferredLocalities: ["Rajouri Garden"], bhk: 3 }));
    expect(result).toBeNull();
  });
  it("customer max 6,000,000 (67% over) -> excluded, never LOW", () => {
    const result = scoreDemandCandidate(expensiveSale, requirement({ transactionType: "SALE", maxBudget: 6_000_000, preferredLocalities: ["Rajouri Garden"], bhk: 3 }));
    expect(result).toBeNull();
  });
});

describe("scoreDemandCandidate - explanation reasons (rule 18)", () => {
  it("always returns at least one reason per scored dimension", () => {
    const result = scoreDemandCandidate(property(), requirement());
    expect(result).not.toBeNull();
    expect(result!.reasons.length).toBeGreaterThan(0);
    expect(result!.reasons.every((r) => typeof r.detail === "string" && r.detail.length > 0)).toBe(true);
  });
  it("explains an above-budget match with the overage percentage", () => {
    const result = scoreDemandCandidate(property({ monthlyRent: 24000 }), requirement({ maxBudget: 20000 }));
    expect(result).not.toBeNull();
    const budgetReason = result!.reasons.find((r) => r.label === "Budget");
    expect(budgetReason?.detail).toMatch(/above max budget/);
  });
});

describe("scoreDemandCandidates batch + sort", () => {
  it("sorts results by score descending", () => {
    const results = scoreDemandCandidates(
      [property({ id: "a", monthlyRent: 25000 }), property({ id: "b", monthlyRent: 20000 })],
      requirement({ maxBudget: 26000 })
    );
    expect(results.length).toBe(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });
  it("excludes non-matching properties from the batch, keeps the rest", () => {
    const results = scoreDemandCandidates(
      [property({ id: "a", status: "RENTED" }), property({ id: "b" })],
      requirement()
    );
    expect(results.length).toBe(1);
  });
});

describe("normalizeCustomerRequirement", () => {
  const baseRequirement = {
    id: "req1", organizationId: "org_default", customerContactId: "contact1", assetClass: "RESIDENTIAL", transactionType: "RENT",
    propertyType: null, commercialPropertyType: null, preferredLocalities: '["Janakpuri"]', minBudget: 15000, maxBudget: 22000,
    minArea: null, maxArea: null, bhk: 2, floorPreference: null, furnishing: "SEMI_FURNISHED", parkingRequired: null, liftRequired: null,
    commercialFitOutPref: null, workstations: null, cabins: null, possession: null, notes: null, active: true, priority: "MEDIUM",
    lastConfirmedAt: new Date(), createdById: null, convertedLeadId: null, createdAt: new Date(), updatedAt: new Date(),
  } as unknown as CustomerRequirement;

  it("maps an active requirement on a contactable contact to contactable: true", () => {
    const normalized = normalizeCustomerRequirement(baseRequirement, { id: "contact1", doNotContact: false, whatsAppOptOut: false, status: "ACTIVE" }, false);
    expect(normalized.contactable).toBe(true);
    expect(normalized.preferredLocalities).toEqual(["Janakpuri"]);
  });
  it("excludes a doNotContact contact", () => {
    const normalized = normalizeCustomerRequirement(baseRequirement, { id: "contact1", doNotContact: true, whatsAppOptOut: false, status: "ACTIVE" }, false);
    expect(normalized.contactable).toBe(false);
  });
  it("excludes a whatsAppOptOut contact", () => {
    const normalized = normalizeCustomerRequirement(baseRequirement, { id: "contact1", doNotContact: false, whatsAppOptOut: true, status: "ACTIVE" }, false);
    expect(normalized.contactable).toBe(false);
  });
  it("excludes a stale (unconfirmed) requirement", () => {
    const normalized = normalizeCustomerRequirement(baseRequirement, { id: "contact1", doNotContact: false, whatsAppOptOut: false, status: "ACTIVE" }, true);
    expect(normalized.contactable).toBe(false);
  });
  it("excludes an inactive requirement", () => {
    const normalized = normalizeCustomerRequirement({ ...baseRequirement, active: false }, { id: "contact1", doNotContact: false, whatsAppOptOut: false, status: "ACTIVE" }, false);
    expect(normalized.contactable).toBe(false);
  });
  it("excludes an ARCHIVED or DO_NOT_CONTACT contact status", () => {
    expect(normalizeCustomerRequirement(baseRequirement, { id: "c", doNotContact: false, whatsAppOptOut: false, status: "ARCHIVED" }, false).contactable).toBe(false);
    expect(normalizeCustomerRequirement(baseRequirement, { id: "c", doNotContact: false, whatsAppOptOut: false, status: "DO_NOT_CONTACT" }, false).contactable).toBe(false);
  });
});

describe("normalizeLeadRequirement + leadIsMatchEligible (rule 31)", () => {
  function lead(overrides: Partial<Lead> = {}): Lead {
    return {
      id: "lead1", organizationId: "org_default", leadCode: "LEAD-1", clientName: "Test", phone: "+919999999999", email: null,
      source: "MANUAL", externalLeadId: null, assetClass: "RESIDENTIAL", transactionType: "RENT", portalProvider: null,
      externalListingId: null, rawPayloadHash: null, receivedAt: null, requirementType: "RENT", preferredLocation: "Janakpuri",
      minBudget: 15000, maxBudget: 22000, preferredBhk: 2, furnishingPref: null, moveInDate: null, additionalRequirements: null,
      commercialPropertyType: null, minAreaSqft: null, maxAreaSqft: null, floorPreference: null, commercialFitOutPref: null,
      parkingRequired: null, liftRequired: null, suitableForTags: "[]", assignedToId: null, status: "NEW", priority: "WARM",
      assignmentStrategy: null, assignmentReason: null, autoAssignedAt: null, score: 0, scoreExplanation: null, scoreUpdatedAt: null,
      lastContactedAt: null, nextFollowUpAt: null, notes: null, customerContactId: null, createdAt: new Date(), updatedAt: new Date(),
      ...overrides,
    } as Lead;
  }

  it("a NEW lead is match-eligible", () => {
    expect(leadIsMatchEligible(lead({ status: "NEW" }))).toBe(true);
    expect(normalizeLeadRequirement(lead({ status: "NEW" })).contactable).toBe(true);
  });
  it("a CLOSED_WON lead (already bought) is excluded from automatic matching", () => {
    expect(leadIsMatchEligible(lead({ status: "CLOSED_WON" }))).toBe(false);
    expect(normalizeLeadRequirement(lead({ status: "CLOSED_WON" })).contactable).toBe(false);
  });
  it("a CLOSED_LOST, NOT_INTERESTED, or INVALID lead is excluded", () => {
    expect(leadIsMatchEligible(lead({ status: "CLOSED_LOST" }))).toBe(false);
    expect(leadIsMatchEligible(lead({ status: "NOT_INTERESTED" }))).toBe(false);
    expect(leadIsMatchEligible(lead({ status: "INVALID" }))).toBe(false);
  });
  it("an older but still-open lead (e.g. PROPERTIES_SHARED) remains eligible", () => {
    expect(leadIsMatchEligible(lead({ status: "PROPERTIES_SHARED" }))).toBe(true);
  });
});

describe("candidateKeyFor (idempotency key)", () => {
  it("produces a distinct, deterministic key per source+candidate", () => {
    expect(candidateKeyFor({ source: "CONTACT", candidateId: "c1" })).toBe("CONTACT:c1");
    expect(candidateKeyFor({ source: "LEAD", candidateId: "c1" })).toBe("LEAD:c1");
    expect(candidateKeyFor({ source: "CONTACT", candidateId: "c1" })).not.toBe(candidateKeyFor({ source: "LEAD", candidateId: "c1" }));
  });
});
