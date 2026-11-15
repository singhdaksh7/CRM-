export interface BudgetRange {
  min: number | null;
  max: number | null;
}

export const NO_BUDGET_FILTER: BudgetRange = { min: null, max: null };

export function isBudgetFilterActive(range: BudgetRange): boolean {
  return range.min !== null || range.max !== null;
}

export function validateBudgetRange(min: number | null, max: number | null): string | null {
  if (min !== null && (Number.isNaN(min) || min < 0)) return "Min Budget cannot be negative";
  if (max !== null && (Number.isNaN(max) || max < 0)) return "Max Budget cannot be negative";
  if (min !== null && max !== null && min > max) return "Min Budget cannot exceed Max Budget";
  return null;
}

export function isDraftDirty(draft: BudgetRange, applied: BudgetRange): boolean {
  return draft.min !== applied.min || draft.max !== applied.max;
}

/**
 * Filters by the lead's actual requirement budget (`requirement.maxBudget`).
 * When a filter is active, leads with a missing budget are hidden. No range-overlap logic.
 */
export function matchesBudgetRange(
  requirement: { maxBudget?: number | null } | null | undefined,
  applied: BudgetRange,
): boolean {
  if (!isBudgetFilterActive(applied)) return true;
  const budget = requirement?.maxBudget;
  if (budget === null || budget === undefined || Number.isNaN(budget)) return false;
  if (applied.min !== null && budget < applied.min) return false;
  if (applied.max !== null && budget > applied.max) return false;
  return true;
}

export function filterByBudgetRange<T extends { requirement?: { maxBudget?: number | null } | null }>(
  rows: T[],
  applied: BudgetRange,
): T[] {
  return rows.filter((r) => matchesBudgetRange(r.requirement, applied));
}
