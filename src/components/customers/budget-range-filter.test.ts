import { describe, it, expect } from "vitest";
import {
  NO_BUDGET_FILTER,
  filterByBudgetRange,
  isDraftDirty,
  validateBudgetRange,
  isBudgetFilterActive,
  type BudgetRange,
} from "./budget-range-logic";

const L = 100000;
const CR = 10000000;

const rows = [
  { id: "a", requirement: { maxBudget: 2.25 * CR } },
  { id: "b", requirement: { maxBudget: 2.5 * CR } },
  { id: "c", requirement: { maxBudget: 4 * CR } },
  { id: "d", requirement: { minBudget: 0, maxBudget: null } },
  { id: "e", requirement: null },
  { id: "f", requirement: { maxBudget: 30 * L } },
];

// Mirrors the component's state model: visible rows use ONLY applied.
class FilterState {
  draft: BudgetRange = { ...NO_BUDGET_FILTER };
  applied: BudgetRange = { ...NO_BUDGET_FILTER };
  setDraft(r: Partial<BudgetRange>) { this.draft = { ...this.draft, ...r }; }
  apply() {
    if (validateBudgetRange(this.draft.min, this.draft.max)) return false;
    this.applied = { ...this.draft };
    return true;
  }
  remove() { this.draft = { ...NO_BUDGET_FILTER }; this.applied = { ...NO_BUDGET_FILTER }; }
  get visible() { return filterByBudgetRange(rows, this.applied); }
  get count() { return `Showing ${this.visible.length} of ${rows.length} matched leads`; }
  get status() { return isBudgetFilterActive(this.applied) ? "applied" : "none"; }
  get changesNotApplied() { return isDraftDirty(this.draft, this.applied); }
}

describe("Budget range filter — manual Apply / Remove", () => {
  it("1. changing draft Min does not change results", () => {
    const s = new FilterState();
    s.setDraft({ min: 50 * L });
    expect(s.visible).toHaveLength(rows.length);
  });

  it("2. changing draft Max does not change results", () => {
    const s = new FilterState();
    s.setDraft({ max: 2.5 * CR });
    expect(s.visible).toHaveLength(rows.length);
  });

  it("3. clicking Apply changes results", () => {
    const s = new FilterState();
    s.setDraft({ min: 50 * L, max: 2.5 * CR });
    expect(s.apply()).toBe(true);
    expect(s.visible.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("4. changing draft after Apply preserves old results", () => {
    const s = new FilterState();
    s.setDraft({ min: 50 * L, max: 2.5 * CR });
    s.apply();
    s.setDraft({ max: 3 * CR });
    expect(s.visible.map((r) => r.id)).toEqual(["a", "b"]);
    expect(s.changesNotApplied).toBe(true);
  });

  it("5. clicking Apply again uses the new draft", () => {
    const s = new FilterState();
    s.setDraft({ min: 50 * L, max: 2.5 * CR });
    s.apply();
    s.setDraft({ max: 4 * CR });
    s.apply();
    expect(s.visible.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(s.changesNotApplied).toBe(false);
  });

  it("6. Remove Filter restores all results and clears draft", () => {
    const s = new FilterState();
    s.setDraft({ min: 50 * L, max: 2.5 * CR });
    s.apply();
    s.remove();
    expect(s.visible).toHaveLength(rows.length);
    expect(s.draft).toEqual(NO_BUDGET_FILTER);
  });

  it("7. result count only changes on Apply/Remove", () => {
    const s = new FilterState();
    expect(s.count).toBe("Showing 6 of 6 matched leads");
    s.setDraft({ min: 50 * L, max: 2.5 * CR });
    expect(s.count).toBe("Showing 6 of 6 matched leads");
    s.apply();
    expect(s.count).toBe("Showing 2 of 6 matched leads");
    s.setDraft({ max: 4 * CR });
    expect(s.count).toBe("Showing 2 of 6 matched leads");
    s.remove();
    expect(s.count).toBe("Showing 6 of 6 matched leads");
  });

  it("8. status and 'Changes not applied' flag change correctly", () => {
    const s = new FilterState();
    expect(s.status).toBe("none");
    expect(s.changesNotApplied).toBe(false);
    s.setDraft({ min: 50 * L });
    expect(s.status).toBe("none");
    expect(s.changesNotApplied).toBe(true);
    s.apply();
    expect(s.status).toBe("applied");
    expect(s.changesNotApplied).toBe(false);
    s.remove();
    expect(s.status).toBe("none");
  });

  it("9. invalid draft cannot be applied", () => {
    const s = new FilterState();
    s.setDraft({ min: 3 * CR, max: 1 * CR });
    expect(s.apply()).toBe(false);
    expect(s.visible).toHaveLength(rows.length);
    expect(validateBudgetRange(-1, null)).toMatch(/negative/);
    expect(validateBudgetRange(null, Number.NaN)).toMatch(/negative/);
  });

  it("10. ₹2.25/2.50/2.54 Cr visible, ₹4 Cr hidden for applied ₹0–₹2.54 Cr", () => {
    const withBoundary = [...rows, { id: "g", requirement: { maxBudget: 2.54 * CR } }];
    const ids = filterByBudgetRange(withBoundary, { min: 0, max: 2.54 * CR }).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["a", "b", "g"]));
    expect(ids).not.toContain("c");
  });

  it("11. missing budget hidden when an active filter is applied", () => {
    const ids = filterByBudgetRange(rows, { min: null, max: 2.54 * CR }).map((r) => r.id);
    expect(ids).not.toContain("d");
    expect(ids).not.toContain("e");
    expect(filterByBudgetRange(rows, NO_BUDGET_FILTER)).toHaveLength(rows.length);
  });

  it("12. core matching score/ranking order unchanged", () => {
    const ranked = [
      { id: "x", score: 90, requirement: { maxBudget: 3 * CR } },
      { id: "y", score: 80, requirement: { maxBudget: 1 * CR } },
      { id: "z", score: 70, requirement: { maxBudget: 2 * CR } },
    ];
    const out = filterByBudgetRange(ranked, { min: null, max: 2 * CR });
    expect(out.map((r) => r.id)).toEqual(["y", "z"]);
    expect(out.map((r) => r.score)).toEqual([80, 70]);
    expect(filterByBudgetRange(ranked, NO_BUDGET_FILTER)).toEqual(ranked);
  });
});
