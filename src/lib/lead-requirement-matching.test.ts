import { describe, expect, it } from "vitest";
import { matchPropertiesToRequirements, matchPropertyToRequirement, type RequirementForMatching, type RequirementMatchableProperty } from "./lead-requirement-matching";
import { toINR } from "./money";

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
  it("matches a property in ANY of 3+ selected localities (B out of A/B/C), and rejects a property in an unselected locality (D)", () => {
    const threeLocalities = [
      { localityId: "a", locality: { id: "a", name: "Locality A" } },
      { localityId: "b", locality: { id: "b", name: "Locality B" } },
      { localityId: "c", locality: { id: "c", name: "Locality C" } },
    ];
    const inB = matchPropertyToRequirement(property({ localityId: "b", area: "Locality B" }), requirement({ localities: threeLocalities }));
    expect(inB).not.toBeNull();
    expect(inB?.reasons).toContainEqual(expect.objectContaining({ label: "Locality", matched: true, detail: expect.stringContaining("Locality B") }));

    const inD = matchPropertyToRequirement(property({ localityId: "d", area: "Locality D" }), requirement({ localities: threeLocalities }));
    expect(inD?.reasons).toContainEqual(expect.objectContaining({ label: "Locality", matched: false }));
  });
});

describe("Lead Requirement V2 - Indian money unit end-to-end (form unit input -> toINR -> matching)", () => {
  // Regression coverage proving the LeadRequirement budget chain - not just
  // the already-covered legacy Lead/Property path in src/lib/matching.test.ts
  // - end to end: a unit-aware amount entered in the requirements panel is
  // converted via toINR() before persisting (this mirrors exactly what
  // src/components/leads/lead-requirements-panel.tsx's save() now does),
  // and matchPropertyToRequirement operates on that normalized raw-INR Int.
  it("matches a property at 1.25 Crore against a requirement entered as '1.5' Crore max budget", () => {
    // Simulates: user typed "1.5" in the Maximum budget field with the
    // Crore unit selected, and "0.5" with Crore for the minimum.
    const persistedMaxBudget = toINR(1.5, "crore");
    const persistedMinBudget = toINR(0.5, "crore");
    expect(persistedMaxBudget).toBe(15_000_000);

    const result = matchPropertyToRequirement(
      property({ listingType: "SALE", salePrice: toINR(1.25, "crore") }),
      requirement({ transactionType: "SALE", minBudget: persistedMinBudget, maxBudget: persistedMaxBudget }),
    );
    expect(result).not.toBeNull();
    expect(result?.reasons).toContainEqual(expect.objectContaining({ label: "Budget", matched: true, detail: "Within budget" }));
  });

  it("excludes a property at 1.75 Crore when the requirement's max budget was entered as '1.5' Crore (over the 20% tolerance)", () => {
    const persistedMaxBudget = toINR(1.5, "crore");
    const result = matchPropertyToRequirement(
      property({ listingType: "SALE", salePrice: toINR(2, "crore") }),
      requirement({ transactionType: "SALE", minBudget: null, maxBudget: persistedMaxBudget }),
    );
    // 2cr vs a 1.5cr max is ~33% over - outside the default 20% tolerance.
    expect(result).toBeNull();
  });

  it("matches a RENT requirement entered as '40' Thousand max budget against a property renting at 35 Thousand", () => {
    const persistedMaxBudget = toINR(40, "thousand");
    const persistedMinBudget = toINR(25, "thousand");
    expect(persistedMaxBudget).toBe(40_000);

    const result = matchPropertyToRequirement(
      property({ listingType: "RENT", monthlyRent: toINR(35, "thousand"), salePrice: null }),
      requirement({ transactionType: "RENT", minBudget: persistedMinBudget, maxBudget: persistedMaxBudget }),
    );
    expect(result).not.toBeNull();
    expect(result?.reasons).toContainEqual(expect.objectContaining({ label: "Budget", matched: true }));
  });
});
