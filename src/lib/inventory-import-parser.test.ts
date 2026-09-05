import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseInventoryFile, validateInventoryFile } from "./inventory-import-parser";

describe("inventory file parser", () => {
  it("parses quoted CSV and detects a non-first header row", async () => {
    const file = new File(["KP Properties inventory export\nLocation,Square Feet,Owner Phone\n\"Janakpuri, Delhi\",850,9876543210\n"], "inventory.csv", { type: "text/csv" });
    const parsed = await parseInventoryFile(file); expect(parsed.headerRow).toBe(2); expect(parsed.rows[0].Location).toBe("Janakpuri, Delhi"); expect(parsed.suggestedMapping.builtUpAreaSqft).toBe("Square Feet");
  });
  it("parses xlsx and exposes multiple sheet names", async () => {
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet("Rent").addRows([["Location", "Rent"], ["Janakpuri", "25k"]]); workbook.addWorksheet("Sale").addRows([["Location", "Sale Price"], ["Dwarka", "1cr"]]);
    const buffer = await workbook.xlsx.writeBuffer(); const file = new File([buffer], "inventory.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const parsed = await parseInventoryFile(file, "Sale"); expect(parsed.sheetNames).toEqual(["Rent", "Sale"]); expect(parsed.selectedSheet).toBe("Sale"); expect(parsed.rows[0].Location).toBe("Dwarka");
  });
  it("rejects unsupported executable files", () => expect(() => validateInventoryFile({ name: "inventory.exe", size: 10, type: "application/octet-stream" })).toThrow(/Only/));
  it("rejects legacy xls with conversion guidance", () => expect(() => validateInventoryFile({ name: "inventory.xls", size: 10, type: "application/vnd.ms-excel" })).toThrow(/Save.*xlsx/));
  it("rejects MIME mismatch", () => expect(() => validateInventoryFile({ name: "inventory.csv", size: 10, type: "application/x-msdownload" })).toThrow(/MIME/));
  it("rejects empty files", () => expect(() => validateInventoryFile({ name: "inventory.csv", size: 0, type: "text/csv" })).toThrow(/empty/));
  it("rejects files above the configured limit", () => expect(() => validateInventoryFile({ name: "inventory.csv", size: 11 * 1024 * 1024, type: "text/csv" })).toThrow(/limit/));

  // Regression: every validateInventoryFile rejection must carry a numeric
  // `status` (handleApiError in ./api-auth duck-types on this - see
  // OrganizationResolutionError in ./organization.ts for the established
  // pattern this file deliberately mirrors instead of importing ApiError
  // directly). Before this fix these threw plain Error with no `status`,
  // so handleApiError's real implementation (not the simplified mocks used
  // by some route tests) silently turned every one of them into a generic
  // 500 "Internal server error" instead of the actual validation message -
  // reproduced in production via a legacy .xls upload to the Housing lead
  // importer (/api/imports/housing/parse).
  it.each([
    { name: "inventory.exe", size: 10, type: "application/octet-stream" },
    { name: "inventory.xls", size: 10, type: "application/vnd.ms-excel" },
    { name: "inventory.csv", size: 10, type: "application/x-msdownload" },
    { name: "inventory.csv", size: 0, type: "text/csv" },
    { name: "inventory.csv", size: 11 * 1024 * 1024, type: "text/csv" },
  ])("carries status 400 so handleApiError never treats it as an unhandled 500 (%o)", (file) => {
    try {
      validateInventoryFile(file);
      throw new Error("expected validateInventoryFile to throw");
    } catch (error) {
      expect((error as { status?: number }).status).toBe(400);
    }
  });
  it("tracks the actual spreadsheet row number", async () => { const file = new File(["Title,Location\n\nFlat,Delhi\n"], "x.csv", { type: "text/csv" }); const parsed = await parseInventoryFile(file); expect(parsed.rows[0].__spreadsheetRowNumber).toBe("3"); });
});
