import type { HealthFactor, HealthLabel, HealthScoreResult, RuleResult, RuleSeverity } from "./types";

const SEVERITY_ORDER: Record<RuleSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Score band -> human label. Bands are intentionally wide so a single factor never flips the label. */
export function healthLabelForScore(score: number): HealthLabel {
  if (score >= 85) return "Excellent";
  if (score >= 65) return "Healthy";
  if (score >= 45) return "Needs Attention";
  if (score >= 25) return "At Risk";
  return "Critical";
}

/** Highest-severity rule first, then oldest first within the same severity. */
export function sortRulesBySeverity(rules: RuleResult[]): RuleResult[] {
  return [...rules].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.generatedAt.getTime() - b.generatedAt.getTime()
  );
}

export function makeRule(input: Omit<RuleResult, "generatedAt"> & { generatedAt?: Date }): RuleResult {
  return { ...input, generatedAt: input.generatedAt ?? new Date() };
}

/**
 * Turns a flat list of scored factors into a HealthScoreResult: clamps the
 * running total to 0-100, buckets each factor into positives/warnings by
 * sign, and picks a recommended action from the most negative (highest
 * impact) warning. `base` is the starting score before factors are applied
 * (both health scores start at 50 - neutral - rather than 0, so a lead/
 * property with no data either way lands in "Needs Attention", not
 * "Critical").
 */
export function buildHealthScore(factors: HealthFactor[], base = 50, fallbackAction: string | null = null): HealthScoreResult {
  const score = clampScore(base + factors.reduce((sum, f) => sum + f.delta, 0));

  const positives = factors
    .filter((f) => f.delta > 0)
    .map((f) => ({ label: f.label, detail: f.detail }));

  const warningFactors = factors.filter((f) => f.delta < 0).sort((a, b) => a.delta - b.delta);
  const warnings = warningFactors.map((f) => ({ label: f.label, detail: f.detail }));

  const recommendedAction = warningFactors.length > 0 ? warningFactors[0].detail : fallbackAction;

  return {
    score,
    label: healthLabelForScore(score),
    positives,
    warnings,
    recommendedAction,
  };
}

export function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}
