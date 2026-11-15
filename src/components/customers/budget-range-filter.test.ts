import { describe, it, expect } from "vitest";

describe("Matching Leads Budget Range Filter — Draft vs Applied & Validation", () => {
  // Candidate leads with various budget intervals
  const candidateA = { id: "c_a", tier: "EXACT", source: "LEAD", requirement: { minBudget: 8000000, maxBudget: 15000000 } }; // ₹80L - ₹1.5 Cr
  const candidateB = { id: "c_b", tier: "EXACT", source: "CONTACT", requirement: { minBudget: 10000000, maxBudget: 30000000 } }; // ₹1 Cr - ₹3 Cr
  const candidateC = { id: "c_c", tier: "STRONG", source: "LEAD", requirement: { minBudget: 25000000, maxBudget: 40000000 } }; // ₹2.5 Cr - ₹4 Cr
  const candidateD = { id: "c_d", tier: "STRETCH", source: "LEAD", requirement: { minBudget: 50000000, maxBudget: 70000000 } }; // ₹5 Cr - ₹7 Cr
  const candidateNullableMin = { id: "c_null_min", tier: "EXACT", source: "CONTACT", requirement: { minBudget: null, maxBudget: 20000000 } }; // up to ₹2 Cr

  const candidates = [candidateA, candidateB, candidateC, candidateD, candidateNullableMin];

  // The interval-overlap filtering function matching matched-customers-panel.tsx
  function filterCandidates(
    list: typeof candidates,
    appliedRange: { min: number | null; max: number | null },
    otherFilters?: { tier?: string; source?: string }
  ) {
    return list.filter((r) => {
      if (otherFilters?.tier && r.tier !== otherFilters.tier) return false;
      if (otherFilters?.source && r.source !== otherFilters.source) return false;

      const leadMin = r.requirement?.minBudget ?? 0;
      const leadMax = r.requirement?.maxBudget ?? Infinity;

      if (appliedRange.min !== null && leadMax < appliedRange.min) {
        return false;
      }
      if (appliedRange.max !== null && leadMin > appliedRange.max) {
        return false;
      }
      return true;
    });
  }

  // Simulated component state machine for Draft vs Applied
  class BudgetFilterState {
    draftMin: number | null = null;
    draftMax: number | null = null;
    appliedMin: number | null = null;
    appliedMax: number | null = null;
    validationError: string | null = null;

    validate(min: number | null, max: number | null): string | null {
      if (min !== null && (Number.isNaN(min) || min < 0)) return "Min Budget cannot be negative";
      if (max !== null && (Number.isNaN(max) || max < 0)) return "Max Budget cannot be negative";
      if (min !== null && max !== null && min > max) return "Min Budget cannot exceed Max Budget";
      return null;
    }

    setDraft(min: number | null, max: number | null) {
      this.draftMin = min;
      this.draftMax = max;
      this.validationError = this.validate(min, max);
    }

    apply(): boolean {
      const err = this.validate(this.draftMin, this.draftMax);
      if (err) {
        this.validationError = err;
        return false;
      }
      this.appliedMin = this.draftMin;
      this.appliedMax = this.draftMax;
      this.validationError = null;
      return true;
    }

    reset() {
      this.draftMin = null;
      this.draftMax = null;
      this.appliedMin = null;
      this.appliedMax = null;
      this.validationError = null;
    }

    getAppliedRange() {
      return { min: this.appliedMin, max: this.appliedMax };
    }
  }

  it("1. editing draft values does NOT filter results until Apply clicked", () => {
    const state = new BudgetFilterState();

    // User types draft values: ₹42 Lakh to ₹2.63 Cr
    state.setDraft(4200000, 26300000);

    // Filter results using applied range
    const visibleBeforeApply = filterCandidates(candidates, state.getAppliedRange());
    expect(visibleBeforeApply.length).toBe(candidates.length); // All 5 still visible!
  });

  it("2. clicking Apply Filter filters results", () => {
    const state = new BudgetFilterState();
    state.setDraft(4200000, 26300000);

    // User clicks Apply
    const applied = state.apply();
    expect(applied).toBe(true);

    const visibleAfterApply = filterCandidates(candidates, state.getAppliedRange());
    const ids = visibleAfterApply.map((r) => r.id);
    // candidateA (80L-1.5Cr) -> overlaps
    // candidateB (1Cr-3Cr) -> overlaps
    // candidateNullableMin (0-2Cr) -> overlaps
    // candidateC (2.5Cr-4Cr) -> overlaps (2.5Cr <= 2.63Cr)
    // candidateD (5Cr-7Cr) -> does not overlap
    expect(ids).toContain("c_a");
    expect(ids).toContain("c_b");
    expect(ids).toContain("c_c");
    expect(ids).toContain("c_null_min");
    expect(ids).not.toContain("c_d");
    expect(visibleAfterApply.length).toBe(4);
  });

  it("3. correct overlap logic (leadMax >= appliedMin && leadMin <= appliedMax)", () => {
    // Range ₹1 Cr - ₹3 Cr
    const appliedRange = { min: 10000000, max: 30000000 };
    const visible = filterCandidates(candidates, appliedRange);
    const ids = visible.map((r) => r.id);
    expect(ids).toContain("c_a"); // 80L-1.5Cr -> max 1.5Cr >= 1Cr
    expect(ids).toContain("c_b"); // 1Cr-3Cr
    expect(ids).toContain("c_c"); // 2.5Cr-4Cr -> min 2.5Cr <= 3Cr
    expect(ids).toContain("c_null_min"); // 0-2Cr
    expect(ids).not.toContain("c_d"); // 5Cr-7Cr -> min 5Cr > 3Cr
  });

  it("4. non-overlapping leads hidden", () => {
    // Range ₹5 Cr - ₹7 Cr
    const appliedRange = { min: 50000000, max: 70000000 };
    const visible = filterCandidates(candidates, appliedRange);
    const ids = visible.map((r) => r.id);
    expect(ids).toEqual(["c_d"]); // Only c_d
  });

  it("5. exact boundary included", () => {
    // Exactly ₹1.5 Cr min filter with no max
    const appliedRange = { min: 15000000, max: null };
    const visible = filterCandidates(candidates, appliedRange);
    const ids = visible.map((r) => r.id);
    expect(ids).toContain("c_a"); // max is 1.5 Cr, meets boundary
  });

  it("6. Reset restores all results", () => {
    const state = new BudgetFilterState();
    state.setDraft(50000000, 70000000);
    state.apply();
    expect(filterCandidates(candidates, state.getAppliedRange()).length).toBe(1);

    // Reset clicked
    state.reset();
    expect(state.appliedMin).toBe(null);
    expect(state.appliedMax).toBe(null);
    expect(filterCandidates(candidates, state.getAppliedRange()).length).toBe(candidates.length);
  });

  it("7. visible count updates accurately", () => {
    const totalCount = candidates.length;
    let visible = filterCandidates(candidates, { min: null, max: null });
    let countText = `Showing ${visible.length} of ${totalCount} matched leads`;
    expect(countText).toBe("Showing 5 of 5 matched leads");

    visible = filterCandidates(candidates, { min: 50000000, max: 70000000 });
    countText = `Showing ${visible.length} of ${totalCount} matched leads`;
    expect(countText).toBe("Showing 1 of 5 matched leads");
  });

  it("8. min > max blocked by validation and Apply prevented", () => {
    const state = new BudgetFilterState();
    state.setDraft(30000000, 10000000); // min 3 Cr > max 1 Cr
    expect(state.validationError).toBe("Min Budget cannot exceed Max Budget");

    const applied = state.apply();
    expect(applied).toBe(false);
    expect(state.appliedMin).toBe(null); // Never applied
  });

  it("9. negative values blocked", () => {
    const state = new BudgetFilterState();
    state.setDraft(-500000, 10000000);
    expect(state.validationError).toBe("Min Budget cannot be negative");
    expect(state.apply()).toBe(false);

    state.setDraft(10000000, -200000);
    expect(state.validationError).toBe("Max Budget cannot be negative");
    expect(state.apply()).toBe(false);
  });

  it("10. applied filter composes correctly with existing tier/source filters", () => {
    // Applied budget: ₹80 Lakh - ₹2 Cr
    const appliedRange = { min: 8000000, max: 20000000 };

    // With tier = EXACT
    const exactMatches = filterCandidates(candidates, appliedRange, { tier: "EXACT" });
    const exactIds = exactMatches.map((r) => r.id);
    expect(exactIds).toContain("c_a"); // EXACT, within budget
    expect(exactIds).toContain("c_b"); // EXACT, within budget
    expect(exactIds).toContain("c_null_min"); // EXACT, within budget
    expect(exactIds).not.toContain("c_c"); // STRONG -> filtered by tier

    // With source = CONTACT
    const contactMatches = filterCandidates(candidates, appliedRange, { source: "CONTACT" });
    const contactIds = contactMatches.map((r) => r.id);
    expect(contactIds).toContain("c_b");
    expect(contactIds).toContain("c_null_min");
    expect(contactIds).not.toContain("c_a"); // source = LEAD
  });

  it("11. modifying draft after Apply does not change results until Apply clicked again", () => {
    const state = new BudgetFilterState();

    // 1. Set draft and apply ₹5 Cr - ₹7 Cr
    state.setDraft(50000000, 70000000);
    state.apply();
    expect(filterCandidates(candidates, state.getAppliedRange()).length).toBe(1);

    // 2. User changes draft to ₹80L - ₹1.5 Cr without applying
    state.setDraft(8000000, 15000000);

    // Results still use previously applied filter!
    expect(filterCandidates(candidates, state.getAppliedRange()).length).toBe(1);

    // 3. User clicks Apply
    state.apply();
    expect(filterCandidates(candidates, state.getAppliedRange()).length).toBe(3); // c_a, c_b, c_null_min
  });

  it("12. core matching order/scoring remains unchanged", () => {
    // Original list order
    const originalOrder = candidates.map((c) => c.id);
    const appliedRange = { min: null, max: null };
    const filtered = filterCandidates(candidates, appliedRange);
    expect(filtered.map((c) => c.id)).toEqual(originalOrder);
  });
});
