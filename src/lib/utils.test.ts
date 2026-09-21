import { describe, expect, it } from "vitest";
import { enumToLabel, formatPropertyAgeRange } from "./utils";

describe("enumToLabel", () => {
  it("safely renders nullable furnishing used by both matching components", () => {
    expect(enumToLabel(null)).toBe("-");
    expect(enumToLabel(undefined)).toBe("-");
    expect(enumToLabel("SEMI_FURNISHED")).toBe("Semi Furnished");
  });
});

describe("formatPropertyAgeRange", () => {
  it("renders a real range as \"min-max years\"", () => {
    expect(formatPropertyAgeRange(10, 15)).toBe("10–15 years");
  });

  it("renders an exact age (min === max) as a single value, not a range", () => {
    expect(formatPropertyAgeRange(10, 10)).toBe("10 years");
  });

  it("renders both null as \"-\" (age not specified)", () => {
    expect(formatPropertyAgeRange(null, null)).toBe("-");
    expect(formatPropertyAgeRange(undefined, undefined)).toBe("-");
  });

  it("uses singular \"year\" for a value of exactly 1", () => {
    expect(formatPropertyAgeRange(1, 1)).toBe("1 year");
  });

  it("falls back to whichever single value is set when the other is null (legacy/imported data)", () => {
    expect(formatPropertyAgeRange(5, null)).toBe("5 years");
    expect(formatPropertyAgeRange(null, 5)).toBe("5 years");
  });
});
