/**
 * Shared types for the deterministic, rule-based intelligence layer
 * (Smart CRM V2). Nothing in src/lib/rules calls an LLM or any paid AI
 * service - every RuleResult and HealthScoreResult is produced by pure
 * functions over data already in this database, and every reason string
 * is traceable back to a concrete field or count.
 */

export type RuleSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type RuleCategory =
  | "LEAD"
  | "PROPERTY"
  | "FOLLOW_UP"
  | "VISIT"
  | "CATALOGUE"
  | "DEAL"
  | "PAYMENT"
  | "EMPLOYEE"
  | "SYSTEM";

export interface RuleResult {
  id: string;
  category: RuleCategory;
  severity: RuleSeverity;
  title: string;
  /** What happened. */
  description: string;
  /** Why it matters. */
  reason: string;
  entityType?: string;
  entityId?: string;
  /** What action is recommended. */
  actionLabel?: string;
  actionHref?: string;
  metadata?: Record<string, unknown>;
  generatedAt: Date;
}

export type HealthLabel = "Excellent" | "Healthy" | "Needs Attention" | "At Risk" | "Critical";

export interface HealthReason {
  label: string;
  detail: string;
}

export interface HealthScoreResult {
  score: number;
  label: HealthLabel;
  positives: HealthReason[];
  warnings: HealthReason[];
  recommendedAction: string | null;
}

/** A single scored factor - the building block both health scores are assembled from. */
export interface HealthFactor {
  label: string;
  delta: number;
  detail: string;
}

/**
 * How a Suggestion's action should be carried out in the UI. Every kind maps
 * to a real, already-existing capability - there is no "kind" whose handler
 * doesn't exist:
 *  - "href": navigate to another page/route (Link)
 *  - "tab": switch to another tab within the same workspace component
 *  - "tel": a tel: link using a real phone number already on the record
 *  - "api": call an existing, already-shipped API route
 */
export type SuggestionActionKind = "href" | "tab" | "tel" | "api";

/**
 * A contextual suggestion for a single entity (Lead/Property/Visit/Deal
 * detail pages) - never labeled "AI suggestion". `disabled` + `disabledReason`
 * let a suggestion be shown honestly when the underlying action isn't
 * available yet (e.g. no requirement-edit form exists), instead of hiding it
 * or wiring it to something that doesn't work.
 */
export interface Suggestion {
  id: string;
  severity: RuleSeverity;
  title: string;
  reason: string;
  actionLabel: string;
  actionKind: SuggestionActionKind;
  /** href target, tab key, tel: URI, or API path - meaning depends on actionKind. */
  actionTarget: string;
  disabled?: boolean;
  disabledReason?: string;
}
