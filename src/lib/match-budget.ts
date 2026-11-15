/**
 * Structured budget for a PropertyRecommendation row, using the SAME source the
 * matching engine scored with (see demand-matching.ts): a CONTACT-sourced
 * recommendation scores against its CustomerRequirement, a LEAD-sourced one
 * (requirementId = null) scores against the Lead's own minBudget/maxBudget.
 * Read-only response shaping - never touches score/tier.
 */
export interface ResolvedBudget {
  minBudget: number | null;
  maxBudget: number | null;
}

type BudgetSource = { minBudget?: number | null; maxBudget?: number | null } | null | undefined;

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

export function resolveRecommendationBudget(row: {
  requirement?: BudgetSource;
  lead?: BudgetSource;
}): ResolvedBudget | null {
  const src = row.requirement ?? row.lead;
  if (!src) return null;
  const minBudget = num(src.minBudget);
  const maxBudget = num(src.maxBudget);
  // A 0 min is "no lower bound" (Lead.minBudget is a non-null Int defaulting to 0).
  return { minBudget: minBudget && minBudget > 0 ? minBudget : null, maxBudget: maxBudget && maxBudget > 0 ? maxBudget : null };
}
