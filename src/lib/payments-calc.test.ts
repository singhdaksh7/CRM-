import { describe, it, expect } from "vitest";
import { computeOutstanding, checkOverpayment } from "./payments-calc";

describe("computeOutstanding", () => {
  it("returns the remaining balance", () => {
    expect(computeOutstanding(100000, 40000)).toBe(60000);
  });

  it("never goes negative", () => {
    expect(computeOutstanding(50000, 80000)).toBe(0);
  });

  it("returns the full amount when nothing has been paid", () => {
    expect(computeOutstanding(20000, 0)).toBe(20000);
  });
});

describe("checkOverpayment", () => {
  it("allows a full payment that exactly matches the outstanding balance", () => {
    const result = checkOverpayment({ brokerageAmount: 100000, alreadyPaid: 0, amount: 100000, direction: "RECEIVABLE" });
    expect(result.allowed).toBe(true);
  });

  it("allows a partial payment within the outstanding balance", () => {
    const result = checkOverpayment({ brokerageAmount: 100000, alreadyPaid: 40000, amount: 30000, direction: "RECEIVABLE" });
    expect(result.allowed).toBe(true);
    expect(result.outstandingBeforePayment).toBe(60000);
  });

  it("rejects a payment that would overpay the deal", () => {
    const result = checkOverpayment({ brokerageAmount: 100000, alreadyPaid: 90000, amount: 20000, direction: "RECEIVABLE" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/exceed/i);
  });

  it("rejects a payment on an already fully paid deal", () => {
    const result = checkOverpayment({ brokerageAmount: 50000, alreadyPaid: 50000, amount: 1, direction: "RECEIVABLE" });
    expect(result.allowed).toBe(false);
  });

  it("does not enforce a limit when brokerageAmount is not yet known", () => {
    const result = checkOverpayment({ brokerageAmount: null, alreadyPaid: 0, amount: 999999, direction: "RECEIVABLE" });
    expect(result.allowed).toBe(true);
  });

  it("does not enforce the receivable limit on PAYABLE payments", () => {
    const result = checkOverpayment({ brokerageAmount: 10000, alreadyPaid: 10000, amount: 5000, direction: "PAYABLE" });
    expect(result.allowed).toBe(true);
  });
});
