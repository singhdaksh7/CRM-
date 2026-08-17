/**
 * Pure-logic coverage for the catalogue -> visit -> field-executive workflow:
 * star-rating validation and banding, per-property progress, and - most
 * importantly - the IST-anchored today/upcoming query construction that is
 * the root cause of visits disappearing from Admin Upcoming Visits.
 */

import { describe, it, expect } from "vitest";
import {
  ACTIVE_VISIT_STATUSES,
  RESOLVED_VISIT_PROPERTY_STATUSES,
  isActiveVisitStatus,
  isResolvedVisitPropertyStatus,
  isValidRating,
  interestLabelFromRating,
  visitOutcomeFromRating,
  computeVisitProgress,
  formatIstDateLabel,
  RATING_DESCRIPTIONS,
  upcomingVisitsWhere,
  todaysVisitsWhere,
  completedTodayWhere,
  visitRoleScopeWhere,
} from "./visit-progress";
import type { VisitPropertyStatus } from "@prisma/client";

describe("visit status vocabulary", () => {
  it("treats IN_PROGRESS as an active status so a started visit stays in the queue", () => {
    expect(ACTIVE_VISIT_STATUSES).toContain("IN_PROGRESS");
    expect(isActiveVisitStatus("IN_PROGRESS")).toBe(true);
  });

  it("excludes COMPLETED and CANCELLED from active statuses", () => {
    expect(isActiveVisitStatus("COMPLETED")).toBe(false);
    expect(isActiveVisitStatus("CANCELLED")).toBe(false);
  });

  it("excludes RESCHEDULED - the reschedule flow moves the row back to SCHEDULED", () => {
    expect(isActiveVisitStatus("RESCHEDULED")).toBe(false);
  });

  it("counts every non-PENDING per-property state as resolved", () => {
    expect(RESOLVED_VISIT_PROPERTY_STATUSES).toEqual(["VISITED", "SKIPPED", "CLIENT_REJECTED", "UNAVAILABLE"]);
    expect(isResolvedVisitPropertyStatus("PENDING")).toBe(false);
    expect(isResolvedVisitPropertyStatus("UNAVAILABLE")).toBe(true);
  });
});

describe("star rating validation", () => {
  it("accepts whole numbers 1 through 5", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(isValidRating(n)).toBe(true);
  });

  it("rejects 0, 6, negatives, fractions, and non-numbers", () => {
    for (const bad of [0, 6, -1, 4.5, "4", null, undefined, NaN]) expect(isValidRating(bad)).toBe(false);
  });

  it("has a human description for every valid star value", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(RATING_DESCRIPTIONS[n]).toBeTruthy();
  });
});

describe("interest label derivation", () => {
  it("bands 1-2 as LOW_INTEREST, 3 as MAYBE, 4 as INTERESTED, 5 as HIGHLY_INTERESTED", () => {
    expect(interestLabelFromRating(1)).toBe("LOW_INTEREST");
    expect(interestLabelFromRating(2)).toBe("LOW_INTEREST");
    expect(interestLabelFromRating(3)).toBe("MAYBE");
    expect(interestLabelFromRating(4)).toBe("INTERESTED");
    expect(interestLabelFromRating(5)).toBe("HIGHLY_INTERESTED");
  });

  it("returns null rather than a label for a missing or invalid rating", () => {
    expect(interestLabelFromRating(null)).toBeNull();
    expect(interestLabelFromRating(undefined)).toBeNull();
    expect(interestLabelFromRating(0)).toBeNull();
  });

  it("maps overall ratings onto existing VisitOutcome values only", () => {
    expect(visitOutcomeFromRating(1)).toBe("NOT_INTERESTED");
    expect(visitOutcomeFromRating(3)).toBe("NEEDS_TIME");
    expect(visitOutcomeFromRating(5)).toBe("HIGHLY_INTERESTED");
  });
});

describe("visit progress", () => {
  const p = (status: VisitPropertyStatus, reactionRating: number | null = null) => ({ status, reactionRating });

  it("reports 1/3 Visited, 2 Remaining", () => {
    const progress = computeVisitProgress([p("VISITED", 4), p("PENDING"), p("PENDING")]);
    expect(progress.total).toBe(3);
    expect(progress.visited).toBe(1);
    expect(progress.remaining).toBe(2);
    expect(progress.label).toBe("1/3 Visited, 2 Remaining");
    expect(progress.allResolved).toBe(false);
  });

  it("counts skipped and unavailable as resolved but not as visited", () => {
    const progress = computeVisitProgress([p("VISITED", 5), p("SKIPPED"), p("UNAVAILABLE")]);
    expect(progress.visited).toBe(1);
    expect(progress.resolved).toBe(3);
    expect(progress.remaining).toBe(0);
    expect(progress.allResolved).toBe(true);
  });

  it("averages only the properties that actually have a rating", () => {
    expect(computeVisitProgress([p("VISITED", 2), p("VISITED", 4), p("VISITED", 5)]).averageRating).toBe(3.7);
    expect(computeVisitProgress([p("VISITED", 4), p("SKIPPED")]).averageRating).toBe(4);
  });

  it("returns a null average rather than 0 when nothing is rated", () => {
    expect(computeVisitProgress([p("PENDING"), p("PENDING")]).averageRating).toBeNull();
  });

  it("never reports an empty visit as ready to complete", () => {
    const progress = computeVisitProgress([]);
    expect(progress.remaining).toBe(0);
    expect(progress.allResolved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The root cause: IST day boundaries
// ---------------------------------------------------------------------------

describe("IST-anchored visit queries (root cause)", () => {
  // 2026-08-17 23:00 IST == 2026-08-17 17:30 UTC. Under the old
  // server-local/UTC logic, "end of today" was 2026-08-17T23:59:59Z, so a
  // visit at 2026-08-18 11:00 IST (2026-08-18T05:30:00Z) was NOT > end of
  // today and therefore never appeared under Upcoming.
  const nowLateIst = new Date("2026-08-17T17:30:00.000Z");
  const tomorrowMorningIst = new Date("2026-08-18T05:30:00.000Z");

  it("classifies a visit scheduled for tomorrow morning IST as upcoming, not today", () => {
    const upcoming = upcomingVisitsWhere("org_default", nowLateIst);
    const gt = (upcoming.visitDate as { gt: Date }).gt;
    expect(tomorrowMorningIst.getTime()).toBeGreaterThan(gt.getTime());

    const today = todaysVisitsWhere("org_default", nowLateIst);
    const lte = (today.visitDate as { lte: Date }).lte;
    expect(tomorrowMorningIst.getTime()).toBeGreaterThan(lte.getTime());
  });

  it("keeps a visit early on the current IST day inside Today", () => {
    // 2026-08-17 00:30 IST == 2026-08-16T19:00Z - a UTC-based "start of
    // today" would wrongly place this on the previous day.
    const earlyToday = new Date("2026-08-16T19:00:00.000Z");
    const today = todaysVisitsWhere("org_default", nowLateIst);
    const { gte, lte } = today.visitDate as { gte: Date; lte: Date };
    expect(earlyToday.getTime()).toBeGreaterThanOrEqual(gte.getTime());
    expect(earlyToday.getTime()).toBeLessThanOrEqual(lte.getTime());
  });

  it("always scopes by organizationId - the admin visits page previously queried with no scope at all", () => {
    expect(upcomingVisitsWhere("org_a").organizationId).toBe("org_a");
    expect(todaysVisitsWhere("org_a").organizationId).toBe("org_a");
    expect(completedTodayWhere("org_a").organizationId).toBe("org_a");
  });

  it("excludes completed and cancelled visits from the active queues", () => {
    const statuses = (upcomingVisitsWhere("org_default").status as { in: string[] }).in;
    expect(statuses).not.toContain("COMPLETED");
    expect(statuses).not.toContain("CANCELLED");
    expect(statuses).toContain("SCHEDULED");
  });

  it("narrows to one executive when an assignee is supplied", () => {
    expect(upcomingVisitsWhere("org_default", new Date(), "emp1").assignedToId).toBe("emp1");
    expect(upcomingVisitsWhere("org_default", new Date(), null).assignedToId).toBeUndefined();
  });

  it("renders the IST calendar date regardless of the underlying UTC instant", () => {
    // 2026-08-17T20:00Z is already 18 Aug in IST.
    expect(formatIstDateLabel(new Date("2026-08-17T20:00:00.000Z"))).toContain("18");
  });
});

describe("role scoping", () => {
  it("pins a FIELD_EXECUTIVE to assignedToId - never createdById or the lead owner", () => {
    const where = visitRoleScopeWhere("org_default", { id: "emp1", role: "FIELD_EXECUTIVE" });
    expect(where.assignedToId).toBe("emp1");
    expect(where).not.toHaveProperty("createdById");
    expect(where.organizationId).toBe("org_default");
  });

  it("does not restrict ADMIN or DATA_MANAGER beyond the organization", () => {
    for (const role of ["ADMIN", "DATA_MANAGER"] as const) {
      const where = visitRoleScopeWhere("org_default", { id: "u1", role });
      expect(where.assignedToId).toBeUndefined();
      expect(where.organizationId).toBe("org_default");
    }
  });
});
