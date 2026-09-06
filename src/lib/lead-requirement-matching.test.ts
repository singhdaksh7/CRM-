import { describe, expect, it } from "vitest";
import { matchPropertiesToRequirements, matchPropertyToRequirement, type RequirementForMatching, type RequirementMatchableProperty } from "./lead-requirement-matching";

const property = (overrides: Partial<RequirementMatchableProperty> = {}): RequirementMatchableProperty => ({
  id: "property-1", status: "AVAILABLE", assetClass: "RESIDENTIAL", listingType: "SALE", propertyType: "APARTMENT", localityId: "rn", area: "Ramesh Nagar", bhk: 3, builtUpAreaSqft: 1000, salePrice: 20_000_000, monthlyRent: null, liftAvailable: true, parkingAvailable: true, furnishing: "SEMI_FURNISHED", floorNumber: 2, ...overrides,
});
const requirement = (overrides: Partial<RequirementForMatching> = {}): RequirementForMatching => ({
  id: "requirement-a", status: "ACTIVE", assetClass: "RESIDENTIAL", transactionType: "SALE", propertyType: null, minBudget: 18_000_000, maxBudget: 22_000_000, minAreaSqft: null, maxAreaSqft: null, floorPreference: null, liftPreference: "NO_PREFERENCE", parkingPreference: "NO_PREFERENCE", furnishingPreference: null, possessionPreference: null, notes: null, localities: [{ localityId: "rn", locality: { id: "rn", name: "Ramesh Nagar" } }], bhkValues: [{ bhk: 3 }], ...overrides,
});

describe("Lead Requirement V2 matching", () => {
  it("matches any selected canonical locality", () => {
    const result = matchPropertyToRequirement(property({ localityId: "mg", area: "Mansarovar Garden" }), requirement({ localities: [{ localityId: "rn", locality: { id: "rn", name: "Ramesh Nagar" } }, { localityId: "mg", locality: { id: "mg", name: "Mansarovar Garden" } }] }));
    expect(result?.reasons).toContainEqual(expect.objectContaining({ label: "Locality", matched: true }));
  });
  it("does not flatten arbitrary BHK selections", () => {
    expect(matchPropertyToRequirement(property({ bhk: 3 }), requirement({ bhkValues: [{ bhk: 2 }, { bhk: 4 }] }))).toBeNull();
  });
  it("excludes paused and fulfilled requirements", () => {
    expect(matchPropertyToRequirement(property(), requirement({ status: "PAUSED" }))).toBeNull();
    expect(matchPropertyToRequirement(property(), requirement({ status: "FULFILLED" }))).toBeNull();
  });
  it("uses REQUIRED lift as a gate but PREFERRED lift only affects score", () => {
    expect(matchPropertyToRequirement(property({ liftAvailable: false }), requirement({ liftPreference: "REQUIRED" }))).toBeNull();
    const preferredMissing = matchPropertyToRequirement(property({ liftAvailable: false }), requirement({ liftPreference: "PREFERRED" }));
    const preferredPresent = matchPropertyToRequirement(property({ liftAvailable: true }), requirement({ liftPreference: "PREFERRED" }));
    expect(preferredMissing).not.toBeNull(); expect(preferredPresent!.score).toBeGreaterThan(preferredMissing!.score);
  });
  it("uses REQUIRED parking as a gate while missing optional data remains safe", () => {
    expect(matchPropertyToRequirement(property({ parkingAvailable: false }), requirement({ parkingPreference: "REQUIRED" }))).toBeNull();
    expect(matchPropertyToRequirement(property({ parkingAvailable: null }), requirement({ parkingPreference: "PREFERRED" }))).not.toBeNull();
  });
  it("retains the best matching independent requirement", () => {
    const matches = matchPropertiesToRequirements([property()], [requirement({ id: "near", localities: [] }), requirement({ id: "best" })]);
    expect(matches).toHaveLength(1); expect(matches[0].matchedRequirement.id).toBe("best");
  });
  it("returns a locality mismatch explanation without pretending it matched", () => {
    const result = matchPropertyToRequirement(property({ localityId: "kn" }), requirement());
    expect(result?.reasons).toContainEqual(expect.objectContaining({ label: "Locality", matched: false }));
  });
});
