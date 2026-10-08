import { describe, expect, it } from "vitest";
import { parsePropertyBhkFilter, propertyListBhkWhere, resolvePropertyListBhkFilter } from "./property-list-filters";

describe("Property Inventory BHK query filters", () => {
  it("keeps 1 RK (bhk=0) as a valid residential filter", () => {
    expect(resolvePropertyListBhkFilter({ bhk: "0", assetClass: undefined })).toEqual({
      bhk: 0,
      assetClass: "RESIDENTIAL",
    });
  });

  it("filters a positive BHK value", () => {
    expect(resolvePropertyListBhkFilter({ bhk: "1", assetClass: "RESIDENTIAL" })).toEqual({
      bhk: 1,
      assetClass: "RESIDENTIAL",
    });
  });

  it("does not filter BHK when it is absent or invalid", () => {
    expect(parsePropertyBhkFilter(undefined)).toBeNull();
    expect(parsePropertyBhkFilter("")).toBeNull();
    expect(parsePropertyBhkFilter("not-a-number")).toBeNull();
    expect(parsePropertyBhkFilter("0.5")).toBeNull();
    expect(resolvePropertyListBhkFilter({ bhk: "not-a-number", assetClass: undefined })).toEqual({
      bhk: null,
      assetClass: undefined,
    });
  });

  it("does not apply residential BHK filtering to commercial inventory", () => {
    expect(resolvePropertyListBhkFilter({ bhk: "0", assetClass: "COMMERCIAL" })).toEqual({
      bhk: null,
      assetClass: "COMMERCIAL",
    });
  });

  it("invalid BHK never becomes 0", () => {
    for (const raw of ["abc", "-1", "1e1", " ", "0x1", "99999999999999999999"]) {
      expect(parsePropertyBhkFilter(raw)).toBeNull();
    }
    expect(propertyListBhkWhere(resolvePropertyListBhkFilter({ bhk: "abc", assetClass: undefined }))).toEqual({});
  });

  it("parses 0, 1, 2 as distinct numeric filters", () => {
    expect([parsePropertyBhkFilter("0"), parsePropertyBhkFilter("1"), parsePropertyBhkFilter("2")]).toEqual([0, 1, 2]);
  });

  it("no bhk param applies no BHK or asset-class filter", () => {
    expect(propertyListBhkWhere(resolvePropertyListBhkFilter({ bhk: undefined, assetClass: undefined }))).toEqual({});
  });

  it("bhk=0 where scopes to RESIDENTIAL so commercial bhk=0 rows are excluded", () => {
    expect(propertyListBhkWhere(resolvePropertyListBhkFilter({ bhk: "0", assetClass: undefined }))).toEqual({
      assetClass: "RESIDENTIAL",
      bhk: 0,
    });
  });

  it("commercial asset class stays commercial with no BHK clause", () => {
    expect(propertyListBhkWhere(resolvePropertyListBhkFilter({ bhk: "0", assetClass: "COMMERCIAL" }))).toEqual({
      assetClass: "COMMERCIAL",
    });
  });
});
