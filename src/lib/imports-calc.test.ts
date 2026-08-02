import { describe, it, expect } from "vitest";
import { sanitizeCell, mapRow, coerceTypes } from "./imports";

describe("sanitizeCell", () => {
  it("prefixes a leading = with a quote", () => {
    expect(sanitizeCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
  });

  it("prefixes a leading + with a quote", () => {
    expect(sanitizeCell("+1234567890")).toBe("'+1234567890");
  });

  it("prefixes a leading - with a quote", () => {
    expect(sanitizeCell("-cmd|' /C calc'!A1")).toBe("'-cmd|' /C calc'!A1");
  });

  it("prefixes a leading @ with a quote", () => {
    expect(sanitizeCell("@SUM(1+1)")).toBe("'@SUM(1+1)");
  });

  it("leaves an ordinary value untouched", () => {
    expect(sanitizeCell("Ramesh Gupta")).toBe("Ramesh Gupta");
  });

  it("leaves a plain numeric-looking string untouched", () => {
    expect(sanitizeCell("9876543210")).toBe("9876543210");
  });
});

describe("mapRow", () => {
  it("maps source columns onto target field names", () => {
    const result = mapRow({ Name: "Ramesh Gupta", Phone: "9876543210" }, { name: "Name", phone: "Phone" });
    expect(result).toEqual({ name: "Ramesh Gupta", phone: "9876543210" });
  });

  it("omits fields whose source column is empty or missing", () => {
    const result = mapRow({ Name: "Ramesh Gupta", Phone: "" }, { name: "Name", phone: "Phone", email: "Email" });
    expect(result).toEqual({ name: "Ramesh Gupta" });
  });
});

describe("coerceTypes", () => {
  it("coerces known numeric fields for PROPERTIES", () => {
    const result = coerceTypes({ bhk: "3", monthlyRent: "25000" }, "PROPERTIES");
    expect(result.bhk).toBe(3);
    expect(result.monthlyRent).toBe(25000);
  });

  it("coerces known boolean fields for EMPLOYEES", () => {
    const result = coerceTypes({ isAvailable: "true", autoAssignEnabled: "false" }, "EMPLOYEES");
    expect(result.isAvailable).toBe(true);
    expect(result.autoAssignEnabled).toBe(false);
  });

  it("leaves non-numeric garbage in a numeric field unchanged rather than coercing to NaN", () => {
    const result = coerceTypes({ bhk: "three" }, "PROPERTIES");
    expect(result.bhk).toBe("three");
  });

  it("sanitizes remaining string fields against formula injection after coercion", () => {
    const result = coerceTypes({ name: "=cmd|'/C calc'", phone: "9876543210" }, "OWNERS");
    expect(result.name).toBe("'=cmd|'/C calc'");
    expect(result.phone).toBe("9876543210");
  });
});
