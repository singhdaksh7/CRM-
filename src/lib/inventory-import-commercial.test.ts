import { describe, it, expect } from "vitest";
import { applyImportFallbackDefaults, normalizeMappedRow, type ImportFieldIssue } from "./inventory-import-core";

describe("inventory import - commercial types", () => {
  it("accepts every commercial type, not just the pre-AssetClass COMMERCIAL_SHOP/COMMERCIAL_OFFICE", () => {
    for (const [cell, expected] of [["Showroom", "SHOWROOM"], ["Warehouse", "WAREHOUSE"], ["Office", "OFFICE"], ["Commercial Plot", "COMMERCIAL_LAND"], ["Godown", "WAREHOUSE"], ["Co-working", "CO_WORKING"]]) {
      const { data, issues } = normalizeMappedRow({ Type: cell }, { propertyType: "Type" });
      expect(data.propertyType, cell).toBe(expected);
      expect(issues.some((i) => i.field === "propertyType" && i.severity === "ERROR"), cell).toBe(false);
    }
  });

  it("still parses the residential and legacy values exactly as before", () => {
    expect(normalizeMappedRow({ Type: "flat" }, { propertyType: "Type" }).data.propertyType).toBe("APARTMENT");
    expect(normalizeMappedRow({ Type: "COMMERCIAL_SHOP" }, { propertyType: "Type" }).data.propertyType).toBe("COMMERCIAL_SHOP");
  });

  it("infers the COMMERCIAL category from an unambiguously commercial type when no category is given", () => {
    const issues: ImportFieldIssue[] = [];
    const data = applyImportFallbackDefaults({ propertyType: "WAREHOUSE", area: "Naraina" }, issues);
    expect(data.assetClass).toBe("COMMERCIAL");
  });

  it("never overrides an explicit RESIDENTIAL category (the mismatch is left for validation to reject)", () => {
    const data = applyImportFallbackDefaults({ assetClass: "RESIDENTIAL", propertyType: "WAREHOUSE" }, []);
    expect(data.assetClass).toBe("RESIDENTIAL");
  });

  it("leaves residential rows without a category untouched (schema default RESIDENTIAL applies)", () => {
    const data = applyImportFallbackDefaults({ propertyType: "APARTMENT" }, []);
    expect(data).not.toHaveProperty("assetClass");
  });
});
