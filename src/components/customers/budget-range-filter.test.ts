import { describe, it, expect } from "vitest";

describe("Change 4 — Matching Leads Budget Range Filter Semantics", () => {
  // Candidate leads with various budget intervals
  const candidateA = { id: "c_a", requirement: { minBudget: 8000000, maxBudget: 15000000 } }; // ₹80L - ₹1.5 Cr
  const candidateB = { id: "c_b", requirement: { minBudget: 10000000, maxBudget: 30000000 } }; // ₹1 Cr - ₹3 Cr
  const candidateC = { id: "c_c", requirement: { minBudget: 25000000, maxBudget: 40000000 } }; // ₹2.5 Cr - ₹4 Cr
  const candidateD = { id: "c_d", requirement: { minBudget: 50000000, maxBudget: 70000000 } }; // ₹5 Cr - ₹7 Cr
  const candidateNullableMin = { id: "c_null_min", requirement: { minBudget: null, maxBudget: 20000000 } }; // up to ₹2 Cr

  const candidates = [candidateA, candidateB, candidateC, candidateD, candidateNullableMin];

  function filterByBudgetRange(
    list: typeof candidates,
    budgetRange: { min: number | null; max: number | null }
  ) {
    return list.filter((r) => {
      const leadMin = r.requirement?.minBudget ?? 0;
      const leadMax = r.requirement?.maxBudget ?? Infinity;

      if (budgetRange.min !== null && leadMax < budgetRange.min) {
        return false;
      }
      if (budgetRange.max !== null && leadMin > budgetRange.max) {
        return false;
      }
      return true;
    });
  }

  it("1. no filter returns unchanged candidates list", () => {
    const result = filterByBudgetRange(candidates, { min: null, max: null });
    expect(result.length).toBe(candidates.length);
  });

  it("2. ₹1 Cr – ₹3 Cr filter correctly filters overlapping candidates", () => {
    // ₹1 Cr = 10000000, ₹3 Cr = 30000000
    const result = filterByBudgetRange(candidates, { min: 10000000, max: 30000000 });
    const ids = result.map((r) => r.id);
    expect(ids).toContain("c_a"); // max ₹1.5 Cr >= ₹1 Cr
    expect(ids).toContain("c_b"); // ₹1 Cr - ₹3 Cr
    expect(ids).toContain("c_c"); // ₹2.5 Cr - ₹4 Cr (starts within ₹1 - ₹3 Cr)
    expect(ids).toContain("c_null_min"); // max ₹2 Cr >= ₹1 Cr
    expect(ids).not.toContain("c_d"); // ₹5 Cr - ₹7 Cr (outside range)
  });

  it("3. exact boundary inclusion", () => {
    // Exactly ₹1.5 Cr min filter
    const result = filterByBudgetRange(candidates, { min: 15000000, max: null });
    const ids = result.map((r) => r.id);
    expect(ids).toContain("c_a"); // max is 1.5 Cr, meets min 1.5 Cr
    expect(ids).toContain("c_b");
    expect(ids).toContain("c_c");
    expect(ids).toContain("c_d");
  });

  it("4. non-overlapping candidates excluded", () => {
    // Filter ₹80 Cr - ₹100 Cr (800000000 - 1000000000)
    const result = filterByBudgetRange(candidates, { min: 800000000, max: 1000000000 });
    expect(result.length).toBe(0);
  });

  it("5. nullable minBudget handled safely as 0", () => {
    // Filter ₹50L - ₹1 Cr
    const result = filterByBudgetRange([candidateNullableMin], { min: 5000000, max: 10000000 });
    expect(result.length).toBe(1);

    // Filter ₹3 Cr - ₹4 Cr
    const result2 = filterByBudgetRange([candidateNullableMin], { min: 30000000, max: 40000000 });
    expect(result2.length).toBe(0);
  });

  it("6. reset restores all candidates", () => {
    let range: { min: number | null; max: number | null } = { min: 10000000, max: 20000000 };
    expect(filterByBudgetRange(candidates, range).length).toBeLessThan(candidates.length);
    // Reset
    range = { min: null, max: null };
    expect(filterByBudgetRange(candidates, range).length).toBe(candidates.length);
  });
});
