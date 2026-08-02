import { describe, it, expect } from "vitest";
import { normalizeIndianPhone, isValidIndianPhone } from "./phone";

describe("normalizeIndianPhone", () => {
  it("normalizes a plain 10-digit Indian mobile number", () => {
    expect(normalizeIndianPhone("9876543210")).toBe("919876543210");
  });

  it("normalizes a number already prefixed with +91", () => {
    expect(normalizeIndianPhone("+919876543210")).toBe("919876543210");
  });

  it("normalizes a number with spaces and dashes", () => {
    expect(normalizeIndianPhone("+91 98765-43210")).toBe("919876543210");
    expect(normalizeIndianPhone("98765 43210")).toBe("919876543210");
  });

  it("normalizes a number with a leading 0 (STD-style)", () => {
    expect(normalizeIndianPhone("09876543210")).toBe("919876543210");
  });

  it("returns null for a number that is too short", () => {
    expect(normalizeIndianPhone("98765")).toBeNull();
  });

  it("returns null for a number starting with an invalid digit (landline-style)", () => {
    expect(normalizeIndianPhone("1234567890")).toBeNull();
  });

  it("returns null for an empty or missing number", () => {
    expect(normalizeIndianPhone("")).toBeNull();
  });

  it("returns null for a non-Indian country code", () => {
    expect(normalizeIndianPhone("+14155552671")).toBeNull();
  });
});

describe("isValidIndianPhone", () => {
  it("is true for a valid number and false for an invalid one", () => {
    expect(isValidIndianPhone("9876543210")).toBe(true);
    expect(isValidIndianPhone("123")).toBe(false);
  });
});
