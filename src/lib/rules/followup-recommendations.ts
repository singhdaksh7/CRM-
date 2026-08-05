/**
 * Deterministic follow-up timing recommendations - a fixed lookup table
 * from a recognized trigger event to a suggested delay, never a generated
 * guess. Consumed by suggestion-engine.ts to give the existing "Create
 * follow-up" suggestions a concrete, specific label instead of a generic
 * one, so this stays additive to the existing Suggestion pipeline rather
 * than a second parallel UI surface.
 */
export type FollowUpTrigger = "VISIT_COMPLETED" | "VISIT_MISSED" | "CATALOGUE_OPENED" | "NO_RESPONSE_5_DAYS" | "NEGOTIATION_STARTED" | "PAYMENT_PARTIAL";

export interface FollowUpRecommendation {
  trigger: FollowUpTrigger;
  /** Short, specific action label, e.g. "Call tomorrow". */
  label: string;
  suggestedDate: Date;
  reason: string;
}

const RECOMMENDATIONS: Record<FollowUpTrigger, { label: string; delayDays: number; reason: string }> = {
  VISIT_COMPLETED: { label: "Call tomorrow", delayDays: 1, reason: "Visit was completed - follow up while it's fresh." },
  VISIT_MISSED: { label: "Call today", delayDays: 0, reason: "Client missed the scheduled visit - reconnect promptly." },
  CATALOGUE_OPENED: { label: "Follow up today", delayDays: 0, reason: "Client opened the catalogue - strike while interest is warm." },
  NO_RESPONSE_5_DAYS: { label: "Share more options", delayDays: 0, reason: "No response in 5+ days - broaden the options shared." },
  NEGOTIATION_STARTED: { label: "Follow up in 2 days", delayDays: 2, reason: "Negotiation started - check in after they've had time to consider." },
  PAYMENT_PARTIAL: { label: "Follow up in 3 days", delayDays: 3, reason: "Partial payment received - follow up on the balance." },
};

export function recommendFollowUpTiming(trigger: FollowUpTrigger, now: Date = new Date()): FollowUpRecommendation {
  const config = RECOMMENDATIONS[trigger];
  const suggestedDate = new Date(now);
  suggestedDate.setDate(suggestedDate.getDate() + config.delayDays);
  return { trigger, label: config.label, suggestedDate, reason: config.reason };
}

export interface FollowUpTriggerInput {
  visitCompletedRecently: boolean;
  visitMissedRecently: boolean;
  catalogueOpenedNoInterest: boolean;
  daysSinceLastContact: number | null;
  negotiationJustStarted: boolean;
  paymentPartial: boolean;
}

/**
 * Priority-ordered: the strongest, most time-sensitive signal wins when
 * several are true at once (a missed visit outranks a 5-day silence, etc).
 * Returns null when no recognized trigger applies - callers should fall
 * back to a generic "create a follow-up" suggestion in that case.
 */
export function detectFollowUpTrigger(input: FollowUpTriggerInput): FollowUpTrigger | null {
  if (input.visitMissedRecently) return "VISIT_MISSED";
  if (input.visitCompletedRecently) return "VISIT_COMPLETED";
  if (input.catalogueOpenedNoInterest) return "CATALOGUE_OPENED";
  if (input.negotiationJustStarted) return "NEGOTIATION_STARTED";
  if (input.paymentPartial) return "PAYMENT_PARTIAL";
  if (input.daysSinceLastContact !== null && input.daysSinceLastContact >= 5) return "NO_RESPONSE_5_DAYS";
  return null;
}
