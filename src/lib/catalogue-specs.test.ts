import { describe, expect, it } from "vitest";
import { catalogueSpecChips } from "./catalogue-specs";
import { budgetSummary } from "./catalogue-dto";

const residential = { assetClass: "RESIDENTIAL", propertyType: "APARTMENT", bhk: 2, bathrooms: 2, builtUpAreaSqft: 900 };
const commercial = { assetClass: "COMMERCIAL", propertyType: "OFFICE_SPACE", bhk: 0, bathrooms: 0, builtUpAreaSqft: 2400, workstations: 40, cabins: 4 };

describe("catalogue spec chips", () => {
  it("keeps the residential BHK/bath/area trio unchanged", () => {
    expect(catalogueSpecChips(residential).map((c) => c.label)).toEqual(["2 BHK", "2 Bath", "900 sqft"]);
  });

  /**
   * Regression: commercial properties store bhk = 0 and bathrooms = 0, and the
   * public catalogue rendered the residential trio unconditionally - publishing
   * a literal "0 BHK / 0 Bath" to the client for every commercial listing.
   */
  it("never claims BHK or bathrooms for a commercial listing", () => {
    const labels = catalogueSpecChips(commercial).map((c) => c.label);
    expect(labels.join(" ")).not.toMatch(/BHK|Bath|\b0\b/);
    expect(labels).toContain("Office Space");
    expect(labels).toContain("2400 sqft");
  });

  it("includes captured workstation and cabin counts", () => {
    expect(catalogueSpecChips(commercial).map((c) => c.label)).toEqual(["Office Space", "40 workstations", "4 cabins", "2400 sqft"]);
  });

  it("omits workstation/cabin chips when those counts are absent", () => {
    const labels = catalogueSpecChips({ ...commercial, workstations: null, cabins: null }).map((c) => c.label);
    expect(labels).toEqual(["Office Space", "2400 sqft"]);
  });

  it("emits no commercial chip kind for residential and no bhk/bath kind for commercial", () => {
    expect(catalogueSpecChips(residential).some((c) => c.kind === "commercial")).toBe(false);
    expect(catalogueSpecChips(commercial).some((c) => c.kind === "bhk" || c.kind === "bath")).toBe(false);
  });
});

describe("catalogue requirement summary", () => {
  const base = { requirementType: "RENT", preferredLocation: "Nehru Place", minBudget: 150000, maxBudget: 250000 };

  it("describes a commercial requirement as commercial and drops BHK", () => {
    const summary = budgetSummary({ ...base, preferredBhk: null, assetClass: "COMMERCIAL" });
    expect(summary).toContain("commercial property");
    expect(summary).not.toMatch(/BHK/);
  });

  it("leaves the residential phrasing unchanged", () => {
    expect(budgetSummary({ ...base, preferredBhk: 2, assetClass: "RESIDENTIAL" })).toContain("a 2 BHK rental property in Nehru Place");
  });

  it("treats a missing asset class as residential", () => {
    expect(budgetSummary({ ...base, preferredBhk: 2 })).toContain("a 2 BHK rental property");
  });

  it("uses sale wording for a commercial sale requirement", () => {
    const summary = budgetSummary({ ...base, requirementType: "BUY", preferredBhk: null, assetClass: "COMMERCIAL" });
    expect(summary).toContain("sale commercial property");
  });
});
