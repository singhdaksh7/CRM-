import { describe, expect, it } from "vitest";
import { requirementMessage, sanitizeRequirement } from "./requirement-network";

describe("requirement broadcast privacy", () => {
  const lead = {
    requirementType: "RENT" as const, preferredLocation: "Rajouri Garden",
    minBudget: 30000, maxBudget: 45000, preferredBhk: 2,
    furnishingPref: "SEMI_FURNISHED" as const, moveInDate: new Date("2026-09-01T00:00:00.000Z"),
  };

  it("contains only requirement fields and no client identity", () => {
    const snapshot = sanitizeRequirement(lead);
    expect(Object.keys(snapshot).sort()).toEqual([
      "areaSqft", "assetClass", "bhk", "budget", "commercialPropertyType", "furnishing", "locality", "moveInDate", "requirementType",
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/client|phone|email|notes|score/i);
  });

  it("renders a useful, sanitized partner message", () => {
    const message = requirementMessage(sanitizeRequirement(lead));
    expect(message).toContain("2 BHK");
    expect(message).toContain("Rajouri Garden");
    expect(message).toContain("₹30,000–₹45,000");
  });

  it("defaults a lead without an explicit asset class to residential", () => {
    expect(sanitizeRequirement(lead).assetClass).toBe("RESIDENTIAL");
    expect(requirementMessage(sanitizeRequirement(lead)).startsWith("PROPERTY REQUIREMENT")).toBe(true);
  });
});

/**
 * Regression: a commercial requirement broadcast used to be indistinguishable
 * from a residential one - the snapshot carried no asset class, and BHK is
 * null for commercial by design, so the partner-facing message silently
 * dropped every distinguishing detail (asset class, commercial property type,
 * area range).
 */
describe("commercial requirement broadcast", () => {
  const commercialLead = {
    requirementType: "RENT" as const,
    preferredLocation: "Nehru Place",
    minBudget: 150000,
    maxBudget: 250000,
    preferredBhk: null,
    furnishingPref: null,
    moveInDate: null,
    assetClass: "COMMERCIAL" as never,
    commercialPropertyType: "COMMERCIAL_OFFICE" as never,
    minAreaSqft: 2000,
    maxAreaSqft: 3500,
  };

  it("keeps the asset class on the sanitized snapshot", () => {
    const snapshot = sanitizeRequirement(commercialLead);
    expect(snapshot.assetClass).toBe("COMMERCIAL");
    expect(snapshot.commercialPropertyType).toBe("COMMERCIAL_OFFICE");
    expect(snapshot.areaSqft).toEqual({ min: 2000, max: 3500 });
    expect(snapshot.bhk).toBeNull();
  });

  it("renders a commercial-specific partner message with no BHK claim", () => {
    const message = requirementMessage(sanitizeRequirement(commercialLead));
    expect(message).toContain("COMMERCIAL PROPERTY REQUIREMENT");
    expect(message).toContain("COMMERCIAL OFFICE");
    expect(message).toContain("2000-3500 sqft");
    expect(message).not.toMatch(/BHK/);
  });

  it("never leaks residential BHK into a commercial broadcast even if the lead still carries one", () => {
    const snapshot = sanitizeRequirement({ ...commercialLead, preferredBhk: 3 });
    expect(snapshot.bhk).toBeNull();
    expect(requirementMessage(snapshot)).not.toMatch(/BHK/);
  });

  it("renders an open-ended area range when only one bound is set", () => {
    expect(requirementMessage(sanitizeRequirement({ ...commercialLead, maxAreaSqft: null }))).toContain("2000+ sqft");
    expect(requirementMessage(sanitizeRequirement({ ...commercialLead, minAreaSqft: null }))).toContain("Up to 3500 sqft");
  });

  it("omits the area line entirely when no area bound is captured", () => {
    const message = requirementMessage(sanitizeRequirement({ ...commercialLead, minAreaSqft: null, maxAreaSqft: null }));
    expect(message).not.toMatch(/sqft/);
    expect(message).toContain("Nehru Place");
  });

  it("still hides client identity for commercial broadcasts", () => {
    expect(JSON.stringify(sanitizeRequirement(commercialLead))).not.toMatch(/client|phone|email|notes|score/i);
  });
});
