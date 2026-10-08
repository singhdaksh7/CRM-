import { describe, expect, it } from "vitest";
import { residentialConfigurationLabel, propertySpecSummary } from "./property-categories";
import { leadSchema } from "./validators";
import { matchPropertiesToLead } from "./matching";

describe("1 RK residential configuration", () => {
  it("uses the existing zero-valued residential configuration and never labels it 0 BHK", () => {
    expect(residentialConfigurationLabel(0)).toBe("1 RK");
    expect(propertySpecSummary({ assetClass: "RESIDENTIAL", propertyType: "APARTMENT", bhk: 0 })).toBe("1 RK");
  });

  it("matches a 1 RK lead to a 1 RK property", () => {
    const matches = matchPropertiesToLead(
      [{ id: "property-1", assetClass: "RESIDENTIAL", propertyType: "APARTMENT", listingType: "RENT", status: "AVAILABLE", area: "Dwarka", bhk: 0, bathrooms: 1, monthlyRent: 20_000, salePrice: null, builtUpAreaSqft: 350, furnishing: null, parkingAvailable: false, liftAvailable: false, availableFrom: null }] as never,
      { id: "lead-1", assetClass: "RESIDENTIAL", requirementType: "RENT", transactionType: "RENT", preferredLocation: "Dwarka", minBudget: 15_000, maxBudget: 25_000, preferredBhk: 0, furnishingPref: null, commercialPropertyType: null, minAreaSqft: null, maxAreaSqft: null, commercialFitOutPref: null, parkingRequired: false, liftRequired: false, status: "NEW" } as never
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].reasons).toContainEqual(expect.objectContaining({ label: "BHK", detail: "1 RK matches requirement" }));
  });
});

describe("OLX lead source", () => {
  it("is accepted by the canonical lead validator", () => {
    expect(leadSchema.parse({ clientName: "OLX customer", phone: "9876543210", source: "OLX", requirementType: "RENT", preferredLocation: "Dwarka", minBudget: 10_000, maxBudget: 20_000 }).source).toBe("OLX");
  });
});
