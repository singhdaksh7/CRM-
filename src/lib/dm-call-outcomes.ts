/**
 * simplified-data-manager-workflow - the single source of truth for the
 * "Record Call" popup's outcome vocabulary. Every DM-facing label here maps
 * onto EXISTING backend concepts (FollowUp type PHONE_CALL/VISIT_EXPECTED,
 * Lead.status NOT_INTERESTED, Activity type PHONE_CALL_MADE) - no new enum
 * values or models. Pure and dependency-free so both the client dialog and
 * the server-side orchestration (src/lib/record-call.ts) import the same
 * classification instead of maintaining two copies.
 */

export const CALL_OUTCOMES = [
  // Did not speak with the customer
  "DIDNT_ANSWER",
  "BUSY",
  "SWITCHED_OFF",
  "WRONG_NUMBER",
  "CALL_AGAIN_LATER",
  // Spoke with the customer
  "INTERESTED",
  "NEEDS_TIME",
  "WANTS_MORE_PROPERTIES",
  "VISIT_REQUIRED",
  "WILL_VISIT_COME",
  "NOT_INTERESTED",
  "OTHER",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  DIDNT_ANSWER: "Didn't Answer",
  BUSY: "Busy",
  SWITCHED_OFF: "Switched Off",
  WRONG_NUMBER: "Wrong Number",
  CALL_AGAIN_LATER: "Call Again Later",
  INTERESTED: "Interested",
  NEEDS_TIME: "Needs Time / Call Again",
  WANTS_MORE_PROPERTIES: "Wants More Properties",
  VISIT_REQUIRED: "Visit Required",
  WILL_VISIT_COME: "Will Visit / Come",
  NOT_INTERESTED: "Not Interested",
  OTHER: "Other",
};

/** Shown under "Did you speak with the customer? NO". */
export const NO_ANSWER_OUTCOMES: readonly CallOutcome[] = ["DIDNT_ANSWER", "BUSY", "SWITCHED_OFF", "WRONG_NUMBER", "CALL_AGAIN_LATER"];

/** Shown under "Did you speak with the customer? YES". */
export const SPOKE_OUTCOMES: readonly CallOutcome[] = [
  "INTERESTED",
  "NEEDS_TIME",
  "WANTS_MORE_PROPERTIES",
  "VISIT_REQUIRED",
  "WILL_VISIT_COME",
  "NOT_INTERESTED",
  "OTHER",
];

/** Outcomes that create/reschedule a PHONE_CALL FollowUp (-> Call Again tab). Requires callback date + time. */
export const CALLBACK_OUTCOMES: readonly CallOutcome[] = ["DIDNT_ANSWER", "BUSY", "SWITCHED_OFF", "CALL_AGAIN_LATER", "NEEDS_TIME"];

/** The single outcome that creates/reschedules a VISIT_EXPECTED FollowUp (-> Visits/Coming tab). Requires date + time. */
export const VISIT_EXPECTED_OUTCOMES: readonly CallOutcome[] = ["WILL_VISIT_COME"];

/** Requires an existing LostDealReasonCategory before the lead can move to NOT_INTERESTED. */
export const LOST_REASON_OUTCOMES: readonly CallOutcome[] = ["NOT_INTERESTED"];

/** Requires a short free-text note (no dedicated outcome maps cleanly). */
export const NOTE_REQUIRED_OUTCOMES: readonly CallOutcome[] = ["OTHER"];

export function isSpokeOutcome(outcome: CallOutcome): boolean {
  return (SPOKE_OUTCOMES as CallOutcome[]).includes(outcome);
}

export function outcomeRequiresCallback(outcome: CallOutcome): boolean {
  return (CALLBACK_OUTCOMES as CallOutcome[]).includes(outcome);
}

export function outcomeRequiresVisitExpected(outcome: CallOutcome): boolean {
  return (VISIT_EXPECTED_OUTCOMES as CallOutcome[]).includes(outcome);
}

export function outcomeRequiresLostReason(outcome: CallOutcome): boolean {
  return (LOST_REASON_OUTCOMES as CallOutcome[]).includes(outcome);
}

export function outcomeRequiresNote(outcome: CallOutcome): boolean {
  return (NOTE_REQUIRED_OUTCOMES as CallOutcome[]).includes(outcome);
}
