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
  budget: { maxBudget?: number | null } | null | undefined,
  applied: BudgetRange,
): boolean {
  if (!isBudgetFilterActive(applied)) return true;
  const maxBudget = budget?.maxBudget;
  if (maxBudget === null || maxBudget === undefined || Number.isNaN(maxBudget)) return false;
  if (applied.min !== null && maxBudget < applied.min) return false;
  if (applied.max !== null && maxBudget > applied.max) return false;
  return true;
}

export function filterByBudgetRange<T extends { budget?: { maxBudget?: number | null } | null }>(
  rows: T[],
  applied: BudgetRange,
): T[] {
  return rows.filter((r) => matchesBudgetRange(r.budget, applied));
}

/** Card label from the structured budget. "Budget not specified" only when there is genuinely none. */
export function formatBudgetLabel(
  budget: { minBudget?: number | null; maxBudget?: number | null } | null | undefined,
  fmt: (n: number) => string,
): string {
  const min = budget?.minBudget ?? null;
  const max = budget?.maxBudget ?? null;
  if (min !== null && max !== null) return `Budget ${fmt(min)} – ${fmt(max)}`;
  if (max !== null) return `Budget up to ${fmt(max)}`;
  if (min !== null) return `Budget from ${fmt(min)}`;
  return "Budget not specified";
}
