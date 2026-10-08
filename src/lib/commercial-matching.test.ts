import { describe, it, expect } from "vitest";
import type { Lead, Property } from "@prisma/client";
import { normalizeExplicitLeadRequirement, normalizeLeadRequirement, scoreDemandCandidate, type ExplicitLeadRequirementInput } from "./demand-matching";
import { matchPropertyToLead } from "./matching";
import { matchPropertyToRequirement, type RequirementForMatching } from "./lead-requirement-matching";

/**
 * Commercial demand vs inventory across all three existing matchers - the
 * canonical demand engine behind Property "Best Matching Leads"
 * (scoreDemandCandidate), the lead workspace matcher (matchPropertyToLead)
 * and the per-brief matcher (matchPropertyToRequirement). No new matching
 * path exists for commercial; these pin that the shared gates hold.
 */

function property(overrides: Partial<Property>): Property {
  return {
    id: "p1",
    organizationId: "org_default",
    status: "AVAILABLE",
    listingType: "RENT",
    assetClass: "RESIDENTIAL",
    propertyType: "APARTMENT",
    area: "Rajouri Garden",
    address: "Private address",
    localityId: "loc-rg",
    monthlyRent: 50000,
    salePrice: null,
    bhk: 2,
    bathrooms: 2,
    builtUpAreaSqft: 1000,
    furnishing: "SEMI_FURNISHED",
    parkingAvailable: true,
    liftAvailable: true,
    commercialFitOut: null,
    floorNumber: 1,
    possessionStatus: null,
    images: "[]",
    coverImage: null,
    availableFrom: null,
    latitude: null,
    longitude: null,
    ...overrides,
  } as Property;
}

const shop = property({ id: "shop", assetClass: "COMMERCIAL", propertyType: "SHOP", bhk: 0, bathrooms: 0, furnishing: null, builtUpAreaSqft: 400, monthlyRent: 90000, washrooms: 1 });
const office = property({ id: "office", assetClass: "COMMERCIAL", propertyType: "OFFICE", bhk: 0, bathrooms: 0, furnishing: null, builtUpAreaSqft: 2000, monthlyRent: 150000 });
const flat = property({ id: "flat" });

function explicitBrief(overrides: Partial<ExplicitLeadRequirementInput> = {}): ExplicitLeadRequirementInput {
  return {
    assetClass: "COMMERCIAL",
    transactionType: "RENT",
    propertyType: "SHOP",
    minBudget: 50000,
    maxBudget: 100000,
    minAreaSqft: 300,
    maxAreaSqft: 600,
    furnishingPreference: null,
    parkingPreference: "NO_PREFERENCE",
    liftPreference: "NO_PREFERENCE",
    status: "ACTIVE",
    ...overrides,
  };
}

const activeLead = { id: "lead1", status: "NEW" } as Pick<Lead, "id" | "status">;

describe("Best Matching Leads (canonical demand engine) - commercial", () => {
  it("matches a commercial shop requirement to a commercial shop", () => {
    const req = normalizeExplicitLeadRequirement(activeLead, explicitBrief(), ["Rajouri Garden"], []);
    const result = scoreDemandCandidate(shop, req);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
  });

  it("never matches a commercial requirement to residential inventory", () => {
    const req = normalizeExplicitLeadRequirement(activeLead, explicitBrief({ propertyType: null, minAreaSqft: null, maxAreaSqft: null }), ["Rajouri Garden"], []);
    expect(scoreDemandCandidate(flat, req)).toBeNull();
  });

  it("never matches a residential requirement to commercial inventory", () => {
    const req = normalizeExplicitLeadRequirement(activeLead, explicitBrief({ assetClass: "RESIDENTIAL", propertyType: null, minAreaSqft: null, maxAreaSqft: null, maxBudget: 200000 }), ["Rajouri Garden"], [2]);
    expect(scoreDemandCandidate(shop, req)).toBeNull();
    expect(scoreDemandCandidate(flat, req)).not.toBeNull();
  });

  it("does not match a shop requirement to an office (commercial subtype is a hard gate)", () => {
    const req = normalizeExplicitLeadRequirement(activeLead, explicitBrief({ maxBudget: 200000, minAreaSqft: null, maxAreaSqft: null }), ["Rajouri Garden"], []);
    expect(scoreDemandCandidate(office, req)).toBeNull();
  });

  it("matches a SHOP requirement against a listing stored under the legacy COMMERCIAL_SHOP value", () => {
    const legacyShop = property({ ...shop, id: "legacy", propertyType: "COMMERCIAL_SHOP" });
    const req = normalizeExplicitLeadRequirement(activeLead, explicitBrief(), ["Rajouri Garden"], []);
    expect(scoreDemandCandidate(legacyShop, req)).not.toBeNull();
  });

  it("respects the commercial area range and transaction type", () => {
    const req = normalizeExplicitLeadRequirement(activeLead, explicitBrief({ minAreaSqft: 1000 }), [], []);
    expect(scoreDemandCandidate(shop, req)).toBeNull();
    const saleReq = normalizeExplicitLeadRequirement(activeLead, explicitBrief({ transactionType: "SALE" }), [], []);
    expect(scoreDemandCandidate(shop, saleReq)).toBeNull();
  });

  it("falls back to legacy Lead commercial fields the same way (no separate path)", () => {
    const lead = { id: "lead2", status: "NEW", assetClass: "COMMERCIAL", transactionType: "RENT", requirementType: "RENT", preferredLocation: "Rajouri Garden", minBudget: 0, maxBudget: 100000, preferredBhk: null, commercialPropertyType: "SHOP", minAreaSqft: null, maxAreaSqft: null, furnishingPref: null, parkingRequired: null, liftRequired: null, commercialFitOutPref: null } as unknown as Lead;
    const req = normalizeLeadRequirement(lead);
    expect(scoreDemandCandidate(shop, req)).not.toBeNull();
    expect(scoreDemandCandidate(flat, req)).toBeNull();
  });
});

describe("matchPropertyToLead / matchPropertyToRequirement - commercial", () => {
  const commercialLead = { id: "lead3", assetClass: "COMMERCIAL", transactionType: "RENT", requirementType: "RENT", preferredLocation: "Rajouri Garden", minBudget: 0, maxBudget: 100000, preferredBhk: null, commercialPropertyType: "SHOP", minAreaSqft: null, maxAreaSqft: null, furnishingPref: null, parkingRequired: null, liftRequired: null, commercialFitOutPref: null, moveInDate: null } as unknown as Lead;

  it("lead workspace matcher: commercial lead matches the shop but not the flat", () => {
    expect(matchPropertyToLead(shop, commercialLead)).not.toBeNull();
    expect(matchPropertyToLead(flat, commercialLead)).toBeNull();
  });

  it("per-brief matcher: commercial brief matches the shop, rejects the flat and the office", () => {
    const brief: RequirementForMatching = {
      id: "r1", status: "ACTIVE", assetClass: "COMMERCIAL", transactionType: "RENT", propertyType: "SHOP",
      minBudget: null, maxBudget: 100000, minAreaSqft: null, maxAreaSqft: null, floorPreference: null,
      liftPreference: "NO_PREFERENCE", parkingPreference: "NO_PREFERENCE", furnishingPreference: null, possessionPreference: null, notes: null,
      localities: [{ localityId: "loc-rg", locality: { id: "loc-rg", name: "Rajouri Garden" } }], bhkValues: [],
    };
    expect(matchPropertyToRequirement(shop, brief)).not.toBeNull();
    expect(matchPropertyToRequirement(flat, brief)).toBeNull();
    expect(matchPropertyToRequirement(office, brief)).toBeNull();
    expect(matchPropertyToRequirement(property({ ...shop, propertyType: "COMMERCIAL_SHOP" }), brief)).not.toBeNull();
  });
});
