import { describe, expect, it } from "vitest";
import {
  UNIT_TO_INR,
  allowedUnitsForListingType,
  fromINR,
  formatIndianMoney,
  pickDefaultUnit,
  toINR,
} from "@/lib/money";

describe("toINR", () => {
  it("converts Thousand amounts", () => {
    expect(toINR(35, "thousand")).toBe(35_000);
  });

  it("converts Lakh amounts with decimals", () => {
    expect(toINR(1.2, "lakh")).toBe(120_000);
    expect(toINR(75, "lakh")).toBe(7_500_000);
  });

  it("converts Crore amounts", () => {
    expect(toINR(1.5, "crore")).toBe(15_000_000);
  });

  it("rounds to the nearest whole rupee without float drift", () => {
    // 1.2 * 100000 is 120000.00000000001 in raw IEEE754 arithmetic.
    expect(Number.isInteger(toINR(1.2, "lakh"))).toBe(true);
    expect(toINR(0.1 + 0.2, "lakh")).toBe(30_000);
  });

  it("round-trips through fromINR without drifting", () => {
    for (const [amount, unit] of [
      [35, "thousand"],
      [1.2, "lakh"],
      [75, "lakh"],
      [1.5, "crore"],
      [1.75, "crore"],
    ] as const) {
      const inr = toINR(amount, unit);
      expect(fromINR(inr, unit)).toBeCloseTo(amount, 6);
      // Repeated round trips should be stable, not drift further.
      const again = toINR(fromINR(inr, unit), unit);
      expect(again).toBe(inr);
    }
  });
});

describe("allowedUnitsForListingType", () => {
  it("offers Thousand/Lakh for RENT", () => {
    expect(allowedUnitsForListingType("RENT")).toEqual(["thousand", "lakh"]);
  });

  it("offers Lakh/Crore for SALE", () => {
    expect(allowedUnitsForListingType("SALE")).toEqual(["lakh", "crore"]);
  });
});

describe("pickDefaultUnit", () => {
  it("picks the largest allowed unit the value clears", () => {
    expect(pickDefaultUnit(7_500_000, ["lakh", "crore"])).toBe("lakh");
    expect(pickDefaultUnit(15_000_000, ["lakh", "crore"])).toBe("crore");
    expect(pickDefaultUnit(40_000, ["thousand", "lakh"])).toBe("thousand");
    expect(pickDefaultUnit(150_000, ["thousand", "lakh"])).toBe("lakh");
  });

  it("falls back to the smallest allowed unit for tiny/null values", () => {
    expect(pickDefaultUnit(null, ["thousand", "lakh"])).toBe("thousand");
    expect(pickDefaultUnit(0, ["lakh", "crore"])).toBe("lakh");
  });
});

describe("formatIndianMoney", () => {
  it("picks Crore/Lakh/Thousand automatically", () => {
    expect(formatIndianMoney(15_000_000)).toBe("₹1.5 Crore");
    expect(formatIndianMoney(7_500_000)).toBe("₹75 Lakh");
    expect(formatIndianMoney(35_000)).toBe("₹35 Thousand");
  });

  it("falls back to plain rupees below a thousand", () => {
    expect(formatIndianMoney(500)).toBe("₹500");
  });

  it("handles null/undefined", () => {
    expect(formatIndianMoney(null)).toBe("-");
    expect(formatIndianMoney(undefined)).toBe("-");
  });
});

describe("UNIT_TO_INR", () => {
  it("matches the documented conversions", () => {
    expect(UNIT_TO_INR.thousand).toBe(1_000);
    expect(UNIT_TO_INR.lakh).toBe(100_000);
    expect(UNIT_TO_INR.crore).toBe(10_000_000);
  });
});
