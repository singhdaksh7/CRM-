import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_COMMERCIAL_PROPERTY_TYPES,
  COMMERCIAL_PROPERTY_TYPES,
  PROPERTY_TYPE_VALUES,
  RESIDENTIAL_PROPERTY_TYPES,
  canonicalPropertyType,
  categoryForPropertyType,
  isPropertyTypeAllowedForCategory,
  propertySpecSummary,
  propertyTypeFilterValues,
  propertyTypeLabel,
  propertyTypeOptionsForCategory,
  propertyTypesEquivalent,
} from "./property-categories";

function prismaEnumValues(name: string): string[] {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const block = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  if (!block) throw new Error(`enum ${name} not found`);
  return block[1].split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
}

describe("property-categories - enum coverage", () => {
  it("PROPERTY_TYPE_VALUES covers exactly the Prisma PropertyType enum (no value missing, none invented)", () => {
    expect([...PROPERTY_TYPE_VALUES].sort()).toEqual(prismaEnumValues("PropertyType").sort());
  });

  it("every PropertyType belongs to exactly one category", () => {
    const residential = new Set<string>(RESIDENTIAL_PROPERTY_TYPES);
    for (const type of ALL_COMMERCIAL_PROPERTY_TYPES) expect(residential.has(type)).toBe(false);
  });

  it("offers the required commercial types: Shop, Office, Showroom, Warehouse, Commercial Plot, Industrial, Other", () => {
    for (const type of ["SHOP", "OFFICE", "SHOWROOM", "WAREHOUSE", "COMMERCIAL_LAND", "INDUSTRIAL", "OTHER_COMMERCIAL"]) {
      expect(COMMERCIAL_PROPERTY_TYPES).toContain(type);
    }
    expect(propertyTypeLabel("COMMERCIAL_LAND")).toBe("Commercial Plot / Land");
  });

  it("leaves the residential type list unchanged", () => {
    expect([...RESIDENTIAL_PROPERTY_TYPES]).toEqual(["APARTMENT", "INDEPENDENT_HOUSE", "VILLA", "BUILDER_FLOOR", "PLOT", "STUDIO", "FARM_HOUSE", "PG", "CO_LIVING", "OTHER"]);
  });
});

describe("property-categories - contextual type options", () => {
  it("only offers commercial types under Commercial and residential types under Residential", () => {
    expect(propertyTypeOptionsForCategory("COMMERCIAL").every((t) => categoryForPropertyType(t) === "COMMERCIAL")).toBe(true);
    expect(propertyTypeOptionsForCategory("RESIDENTIAL").every((t) => categoryForPropertyType(t) === "RESIDENTIAL")).toBe(true);
  });

  it("keeps a legacy stored commercial value selectable when editing, but never offers it fresh", () => {
    expect(propertyTypeOptionsForCategory("COMMERCIAL")).not.toContain("COMMERCIAL_SHOP");
    expect(propertyTypeOptionsForCategory("COMMERCIAL", "COMMERCIAL_SHOP")).toContain("COMMERCIAL_SHOP");
    // ...but never a value from the other category.
    expect(propertyTypeOptionsForCategory("RESIDENTIAL", "COMMERCIAL_SHOP")).not.toContain("COMMERCIAL_SHOP");
  });

  it("validates category/type combinations in both directions", () => {
    expect(isPropertyTypeAllowedForCategory("COMMERCIAL", "SHOP")).toBe(true);
    expect(isPropertyTypeAllowedForCategory("COMMERCIAL", "APARTMENT")).toBe(false);
    expect(isPropertyTypeAllowedForCategory("RESIDENTIAL", "APARTMENT")).toBe(true);
    expect(isPropertyTypeAllowedForCategory("RESIDENTIAL", "WAREHOUSE")).toBe(false);
    expect(isPropertyTypeAllowedForCategory("RESIDENTIAL", null)).toBe(true);
  });
});

describe("property-categories - legacy aliases", () => {
  it("treats COMMERCIAL_SHOP/COMMERCIAL_OFFICE as SHOP/OFFICE for matching and filtering", () => {
    expect(canonicalPropertyType("COMMERCIAL_SHOP")).toBe("SHOP");
    expect(propertyTypesEquivalent("COMMERCIAL_OFFICE", "OFFICE")).toBe(true);
    expect(propertyTypesEquivalent("SHOP", "OFFICE")).toBe(false);
    expect(propertyTypesEquivalent("APARTMENT", "APARTMENT")).toBe(true);
    expect(propertyTypeFilterValues("SHOP").sort()).toEqual(["COMMERCIAL_SHOP", "SHOP"]);
    expect(propertyTypeFilterValues("WAREHOUSE")).toEqual(["WAREHOUSE"]);
  });

  it("never renders '0 BHK' for commercial inventory", () => {
    expect(propertySpecSummary({ assetClass: "COMMERCIAL", propertyType: "SHOP", bhk: 0 })).toBe("Shop");
    expect(propertySpecSummary({ assetClass: "RESIDENTIAL", propertyType: "APARTMENT", bhk: 2 })).toBe("2 BHK");
  });
});
