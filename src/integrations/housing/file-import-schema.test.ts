import { describe, expect, it } from "vitest";
import { extractHousingRow, missingRequiredColumns, suggestHousingFileMapping } from "./file-import-schema";

describe("suggestHousingFileMapping", () => {
  it("maps common Housing export header spellings", () => {
    const mapping = suggestHousingFileMapping(["Lead Name", "Lead Phone Number", "Locality", "City", "Configuration", "Price"]);
    expect(mapping["Lead Name"]).toBe("Lead Name");
    expect(mapping["Lead Phone Number"]).toBe("Lead Phone Number");
    expect(mapping["Locality"]).toBe("Locality");
  });

  it("ignores headers it does not recognize (extra columns are never rejected)", () => {
    const mapping = suggestHousingFileMapping(["Lead Name", "Some Unrelated Column"]);
    expect(Object.values(mapping)).not.toContain("Some Unrelated Column");
  });
});

describe("missingRequiredColumns", () => {
  it("flags when required columns are unmapped", () => {
    expect(missingRequiredColumns({})).toEqual(expect.arrayContaining(["Lead Name", "Lead Phone Number", "Locality"]));
  });

  it("is empty once every required column is mapped", () => {
    expect(missingRequiredColumns({ "Lead Name": "Lead Name", "Lead Phone Number": "Lead Phone Number", Locality: "Locality" })).toEqual([]);
  });
});

describe("extractHousingRow", () => {
  it("pulls only mapped columns and ignores unexpected extra columns", () => {
    const row = { "Lead Name": "Asha", "Random Extra Column": "ignored", Phone: "9876543210" };
    const mapping = { "Lead Name": "Lead Name", "Lead Phone Number": "Phone" } as const;
    const out = extractHousingRow(row, mapping);
    expect(out).toEqual({ "Lead Name": "Asha", "Lead Phone Number": "9876543210" });
  });

  it("drops blank cells rather than passing through empty strings", () => {
    const row = { "Lead Name": "   " };
    const out = extractHousingRow(row, { "Lead Name": "Lead Name" });
    expect(out["Lead Name"]).toBeUndefined();
  });
});
