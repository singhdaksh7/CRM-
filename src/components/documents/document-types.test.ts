import { describe, it, expect } from "vitest";
import { categoriesForRole, formatBytes, SENSITIVE_CATEGORIES, CATEGORY_LABELS } from "./document-types";

describe("categoriesForRole", () => {
  it("Admin sees every category", () => {
    expect(categoriesForRole("ADMIN")).toEqual(Object.keys(CATEGORY_LABELS));
  });

  it("Data Manager sees every category except the sensitive ones", () => {
    const categories = categoriesForRole("DATA_MANAGER");
    for (const c of SENSITIVE_CATEGORIES) expect(categories).not.toContain(c);
    expect(categories).toContain("GENERAL");
    expect(categories).toContain("RENT_AGREEMENT");
  });

  it("Field Executive only sees GENERAL - mirrors src/lib/document-access.ts", () => {
    expect(categoriesForRole("FIELD_EXECUTIVE")).toEqual(["GENERAL"]);
  });
});

describe("formatBytes", () => {
  it("formats bytes, KB, and MB", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("returns a dash for null", () => {
    expect(formatBytes(null)).toBe("-");
  });
});
