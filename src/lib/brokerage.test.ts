import { describe, it, expect } from "vitest";
import { calculateBrokerage } from "./brokerage-calc";

describe("calculateBrokerage", () => {
  it("defaults rental brokerage to one month's rent", () => {
    const result = calculateBrokerage({ type: "RENTAL", baseAmount: 20000 });
    expect(result.grossBrokerage).toBe(20000);
    expect(result.netBrokerage).toBe(20000);
  });

  it("defaults sale brokerage to 2% of sale price", () => {
    const result = calculateBrokerage({ type: "SALE", baseAmount: 5000000 });
    expect(result.grossBrokerage).toBe(100000);
  });

  it("applies a custom brokerage percentage", () => {
    const result = calculateBrokerage({ type: "SALE", baseAmount: 1000000, brokeragePct: 1.5 });
    expect(result.grossBrokerage).toBe(15000);
  });

  it("splits brokerage between two brokers before discount/tax", () => {
    const result = calculateBrokerage({ type: "RENTAL", baseAmount: 30000, splitPct: 50 });
    expect(result.splitAmount).toBe(15000);
    expect(result.netBrokerage).toBe(15000);
  });

  it("applies a discount off the (post-split) brokerage", () => {
    const result = calculateBrokerage({ type: "RENTAL", baseAmount: 30000, discountPct: 10 });
    expect(result.discountAmount).toBe(3000);
    expect(result.netBrokerage).toBe(27000);
  });

  it("applies tax on top of the post-discount brokerage", () => {
    const result = calculateBrokerage({ type: "SALE", baseAmount: 1000000, brokeragePct: 2, taxPct: 18 });
    // gross 20000, no split/discount, tax 18% = 3600 -> net 23600
    expect(result.taxAmount).toBe(3600);
    expect(result.netBrokerage).toBe(23600);
  });

  it("computes employee incentive as a percentage of net brokerage without reducing it", () => {
    const result = calculateBrokerage({ type: "RENTAL", baseAmount: 20000, employeeIncentivePct: 25 });
    expect(result.employeeIncentiveAmount).toBe(5000);
    expect(result.netBrokerage).toBe(20000);
  });

  it("combines split, discount, tax and incentive in the documented order", () => {
    const result = calculateBrokerage({
      type: "SALE",
      baseAmount: 5000000,
      brokeragePct: 2, // gross 100000
      splitPct: 50, // split 50000, after-split 50000
      discountPct: 10, // discount 5000, after-discount 45000
      taxPct: 18, // tax 8100, net 53100
      employeeIncentivePct: 20, // incentive 10620
    });
    expect(result.grossBrokerage).toBe(100000);
    expect(result.splitAmount).toBe(50000);
    expect(result.discountAmount).toBe(5000);
    expect(result.taxAmount).toBe(8100);
    expect(result.netBrokerage).toBe(53100);
    expect(result.employeeIncentiveAmount).toBe(10620);
  });

  it("rejects a non-positive base amount", () => {
    expect(() => calculateBrokerage({ type: "RENTAL", baseAmount: 0 })).toThrow();
    expect(() => calculateBrokerage({ type: "RENTAL", baseAmount: -100 })).toThrow();
  });
});
