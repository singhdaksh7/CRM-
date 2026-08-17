/**
 * Pure, dependency-free helpers for the visit workflow: status vocabulary,
 * star ratings, and per-property progress.
 *
 * Deliberately separate from src/lib/visits.ts. That module reaches Prisma,
 * notifications, and the auth helpers; this one imports nothing but Prisma's
 * generated *types*. Client components (the mobile field workflow) and unit
 * tests can therefore import these without dragging the database client into
 * a browser bundle or a test process.
 *
 * src/lib/visits.ts re-exports everything here, so server callers can keep
 * importing from a single place.
 */

import { startOfIstDay, endOfIstDay } from "./ist-date";
import type { Prisma, Role, VisitOutcome, VisitPropertyStatus, VisitStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

/**
 * A visit that is still going to happen (or is happening now). Everything
 * else - COMPLETED, CANCELLED, CLIENT_NO_SHOW, RESCHEDULED - is either done
 * or has been superseded and must not sit in an active queue. RESCHEDULED is
 * excluded because the reschedule flow moves the SAME row back to SCHEDULED;
 * a row left at RESCHEDULED is a historical marker only.
 */
export const ACTIVE_VISIT_STATUSES: VisitStatus[] = ["SCHEDULED", "CONFIRMED", "CLIENT_REACHED", "EMPLOYEE_REACHED", "IN_PROGRESS"];

/** Per-property states that count as "the executive has dealt with this one". */
export const RESOLVED_VISIT_PROPERTY_STATUSES: VisitPropertyStatus[] = ["VISITED", "SKIPPED", "CLIENT_REJECTED", "UNAVAILABLE"];

export function isActiveVisitStatus(status: VisitStatus): boolean {
  return ACTIVE_VISIT_STATUSES.includes(status);
}

export function isResolvedVisitPropertyStatus(status: VisitPropertyStatus): boolean {
  return RESOLVED_VISIT_PROPERTY_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Star ratings
// ---------------------------------------------------------------------------

export const MIN_REACTION_RATING = 1;
export const MAX_REACTION_RATING = 5;

export type InterestLabel = "LOW_INTEREST" | "MAYBE" | "INTERESTED" | "HIGHLY_INTERESTED";

export function isValidRating(rating: unknown): rating is number {
  return typeof rating === "number" && Number.isInteger(rating) && rating >= MIN_REACTION_RATING && rating <= MAX_REACTION_RATING;
}

/**
 * Display label derived from the raw star value. The integer stays the source
 * of truth - this is never persisted as the primary record, so re-banding
 * later needs no migration.
 */
export function interestLabelFromRating(rating: number | null | undefined): InterestLabel | null {
  if (!isValidRating(rating)) return null;
  if (rating <= 2) return "LOW_INTEREST";
  if (rating === 3) return "MAYBE";
  if (rating === 4) return "INTERESTED";
  return "HIGHLY_INTERESTED";
}

export const RATING_DESCRIPTIONS: Record<number, string> = {
  1: "Not Interested",
  2: "Low Interest",
  3: "Neutral / Maybe",
  4: "Interested",
  5: "Very Interested",
};

/**
 * Maps an overall visit rating onto the existing VisitOutcome enum so
 * completing a visit keeps feeding the analytics/lead-health machinery that
 * already reads `Visit.outcome`. Note what this does NOT do: completeVisit()
 * deliberately does not run the outcome -> lead-status mapping that the
 * legacy PATCH route applies, so a 1-star visit never auto-closes the lead.
 */
export function visitOutcomeFromRating(rating: number): VisitOutcome {
  if (rating <= 1) return "NOT_INTERESTED";
  if (rating === 2) return "FOLLOW_UP_NEEDED";
  if (rating === 3) return "NEEDS_TIME";
  if (rating === 4) return "INTERESTED";
  return "HIGHLY_INTERESTED";
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface VisitProgress {
  total: number;
  visited: number;
  resolved: number;
  remaining: number;
  /** e.g. "1/3 Visited, 2 Remaining" */
  label: string;
  /** True once nothing is left PENDING - gates [Complete Visit]. */
  allResolved: boolean;
  averageRating: number | null;
}

export function computeVisitProgress(properties: { status: VisitPropertyStatus; reactionRating?: number | null }[]): VisitProgress {
  const total = properties.length;
  const visited = properties.filter((p) => p.status === "VISITED").length;
  const resolved = properties.filter((p) => isResolvedVisitPropertyStatus(p.status)).length;
  const remaining = total - resolved;
  const ratings = properties.map((p) => p.reactionRating).filter(isValidRating);
  return {
    total,
    visited,
    resolved,
    remaining,
    label: `${visited}/${total} Visited${remaining > 0 ? `, ${remaining} Remaining` : ""}`,
    // An empty visit has nothing to resolve, but must not read as "ready to
    // complete" - that would let a zero-property visit be completed.
    allResolved: total > 0 && remaining === 0,
    averageRating: ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
  };
}

/** "18 Aug 2026" rendered on the IST calendar, regardless of server timezone. */
export function formatIstDateLabel(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

// ---------------------------------------------------------------------------
// Query construction - the "why didn't my visit show up" fix lives here
//
// These build Prisma `where` objects and touch nothing but the IST date
// helpers, so they stay in this pure module and are directly unit-testable.
// ---------------------------------------------------------------------------

/**
 * Visits that should appear under "Upcoming". IST-anchored: strictly after
 * the end of the current IST day. `organizationId` is a required positional
 * parameter (not optional with a default) so a caller physically cannot
 * forget to scope it - the admin visits page previously queried with `{}`
 * and would have returned every organization's visits.
 */
export function upcomingVisitsWhere(organizationId: string, now: Date = new Date(), assignedToId?: string | null): Prisma.VisitWhereInput {
  return {
    organizationId,
    visitDate: { gt: endOfIstDay(now) },
    status: { in: ACTIVE_VISIT_STATUSES },
    ...(assignedToId ? { assignedToId } : {}),
  };
}

/** Visits on the current IST calendar day, still active. */
export function todaysVisitsWhere(organizationId: string, now: Date = new Date(), assignedToId?: string | null): Prisma.VisitWhereInput {
  return {
    organizationId,
    visitDate: { gte: startOfIstDay(now), lte: endOfIstDay(now) },
    status: { in: ACTIVE_VISIT_STATUSES },
    ...(assignedToId ? { assignedToId } : {}),
  };
}

/** Completed visits on the current IST calendar day - the manager dashboard tile. */
export function completedTodayWhere(organizationId: string, now: Date = new Date()): Prisma.VisitWhereInput {
  return { organizationId, visitDate: { gte: startOfIstDay(now), lte: endOfIstDay(now) }, status: "COMPLETED" };
}

/**
 * The role filter. A FIELD_EXECUTIVE sees visits where they are the person
 * assigned to physically perform the visit - `assignedToId`. Explicitly NOT
 * createdById, not the lead owner, and not the catalogue creator.
 */
export function visitRoleScopeWhere(organizationId: string, user: { id: string; role: Role }): Prisma.VisitWhereInput {
  const base: Prisma.VisitWhereInput = { organizationId };
  if (user.role === "FIELD_EXECUTIVE") base.assignedToId = user.id;
  return base;
}
