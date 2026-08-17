/**
 * Visit analytics for the Reports section, and the manager's live
 * "what's happening in the field today" board.
 *
 * Every derived figure is guarded: a rate with a zero denominator is `null`,
 * not 0%, and an average over a sample too small to mean anything is
 * reported as null with the raw sample size alongside it. The rest of this
 * codebase already takes that position (see
 * src/lib/activity-analytics-data.ts: "null = insufficient data ... never a
 * misleading 0%") and this module follows it rather than inventing a
 * different convention.
 */

import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { startOfIstDay, endOfIstDay, startOfIstMonth } from "./ist-date";
// Pure helpers only - this module needs no part of the write-side service.
import { ACTIVE_VISIT_STATUSES, computeVisitProgress, interestLabelFromRating, type InterestLabel } from "./visit-progress";

const CACHE_TTL_SECONDS = 60;

/**
 * Below this many rated properties, an average star score is noise. Reported
 * as null with `reactionSampleSize` so the UI can say "not enough data yet"
 * instead of rendering a confident-looking 4.0 from two data points.
 */
export const MIN_REACTION_SAMPLE = 5;

export interface VisitAnalytics {
  visitsScheduled: number;
  visitsCompleted: number;
  visitsCancelled: number;
  propertiesShown: number;
  /** null when there are no visits at all. */
  averagePropertiesPerVisit: number | null;
  /** null when fewer than MIN_REACTION_SAMPLE rated properties exist. */
  averageReactionScore: number | null;
  reactionSampleSize: number;
  /** Properties whose client reaction was 4 or 5 stars, most recent first. */
  highInterestProperties: { propertyId: string; title: string; area: string; rating: number; label: InterestLabel | null; clientName: string }[];
  /** Per-executive completion rate. `completionRate` is null when they had no visits. */
  executiveCompletion: { id: string; name: string; assigned: number; completed: number; completionRate: number | null }[];
}

export async function getVisitAnalytics(organizationId: string, since?: Date): Promise<VisitAnalytics> {
  const from = since ?? startOfIstMonth();
  return withTiming("visitAnalytics", "/reports", () =>
    cached(`visit-analytics:${organizationId}:${from.toISOString()}`, CACHE_TTL_SECONDS, () => computeVisitAnalytics(organizationId, from))
  );
}

async function computeVisitAnalytics(organizationId: string, from: Date): Promise<VisitAnalytics> {
  const window = { organizationId, visitDate: { gte: from } };

  const [visitsScheduled, visitsCompleted, visitsCancelled, propertiesShown, ratingAgg, highInterest, executives, assignedGroups, completedGroups] = await Promise.all([
    prisma.visit.count({ where: window }),
    prisma.visit.count({ where: { ...window, status: "COMPLETED" } }),
    prisma.visit.count({ where: { ...window, status: "CANCELLED" } }),
    prisma.visitProperty.count({ where: { organizationId, status: "VISITED", visit: { visitDate: { gte: from } } } }),
    prisma.visitProperty.aggregate({
      where: { organizationId, reactionRating: { not: null }, visit: { visitDate: { gte: from } } },
      _avg: { reactionRating: true },
      _count: { reactionRating: true },
    }),
    prisma.visitProperty.findMany({
      where: { organizationId, reactionRating: { gte: 4 }, visit: { visitDate: { gte: from } } },
      orderBy: { visitedAt: "desc" },
      take: 10,
      select: { propertyId: true, reactionRating: true, property: { select: { title: true, area: true } }, visit: { select: { lead: { select: { clientName: true } } } } },
    }),
    prisma.user.findMany({ where: { organizationId, role: "FIELD_EXECUTIVE", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.visit.groupBy({ by: ["assignedToId"], where: { ...window, assignedToId: { not: null } }, _count: true }),
    prisma.visit.groupBy({ by: ["assignedToId"], where: { ...window, status: "COMPLETED", assignedToId: { not: null } }, _count: true }),
  ]);

  const reactionSampleSize = ratingAgg._count.reactionRating ?? 0;
  const assignedByExec = new Map(assignedGroups.map((g) => [g.assignedToId as string, g._count]));
  const completedByExec = new Map(completedGroups.map((g) => [g.assignedToId as string, g._count]));

  return {
    visitsScheduled,
    visitsCompleted,
    visitsCancelled,
    propertiesShown,
    // Guarded: no visits means no meaningful average, not 0.
    averagePropertiesPerVisit: visitsScheduled > 0 ? Math.round((propertiesShown / visitsScheduled) * 10) / 10 : null,
    averageReactionScore:
      reactionSampleSize >= MIN_REACTION_SAMPLE && ratingAgg._avg.reactionRating !== null
        ? Math.round(ratingAgg._avg.reactionRating * 10) / 10
        : null,
    reactionSampleSize,
    highInterestProperties: highInterest.map((r) => ({
      propertyId: r.propertyId,
      title: r.property.title,
      area: r.property.area,
      rating: r.reactionRating!,
      label: interestLabelFromRating(r.reactionRating),
      clientName: r.visit.lead.clientName,
    })),
    executiveCompletion: executives.map((e) => {
      const assigned = assignedByExec.get(e.id) ?? 0;
      const completed = completedByExec.get(e.id) ?? 0;
      return {
        id: e.id,
        name: e.name,
        assigned,
        completed,
        // Guarded: an executive with no visits in the window has no rate,
        // not a 0% that reads like poor performance.
        completionRate: assigned > 0 ? Math.round((completed / assigned) * 1000) / 10 : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Manager live board
// ---------------------------------------------------------------------------

export interface ManagerVisitBoard {
  visitsTodayCount: number;
  upcomingCount: number;
  inProgressCount: number;
  completedTodayCount: number;
  /** e.g. "Rahul - Sagar - 3 Properties - 1/3 visited" */
  todaySummaries: { id: string; clientName: string; executiveName: string; total: number; visited: number; status: string; summary: string }[];
}

export async function getManagerVisitBoard(organizationId: string, now: Date = new Date()): Promise<ManagerVisitBoard> {
  return withTiming("managerVisitBoard", "/dashboard", () =>
    cached(`manager-visit-board:${organizationId}`, CACHE_TTL_SECONDS, () => computeManagerVisitBoard(organizationId, now))
  );
}

async function computeManagerVisitBoard(organizationId: string, now: Date): Promise<ManagerVisitBoard> {
  const dayStart = startOfIstDay(now);
  const dayEnd = endOfIstDay(now);

  const [todayVisits, upcomingCount, inProgressCount, completedTodayCount] = await Promise.all([
    prisma.visit.findMany({
      where: { organizationId, visitDate: { gte: dayStart, lte: dayEnd }, status: { notIn: ["CANCELLED"] } },
      select: {
        id: true,
        status: true,
        lead: { select: { clientName: true } },
        assignedTo: { select: { name: true } },
        properties: { select: { status: true, reactionRating: true } },
      },
      orderBy: { visitTime: "asc" },
      take: 50,
    }),
    prisma.visit.count({ where: { organizationId, visitDate: { gt: dayEnd }, status: { in: ACTIVE_VISIT_STATUSES } } }),
    prisma.visit.count({ where: { organizationId, status: "IN_PROGRESS" } }),
    prisma.visit.count({ where: { organizationId, visitDate: { gte: dayStart, lte: dayEnd }, status: "COMPLETED" } }),
  ]);

  return {
    visitsTodayCount: todayVisits.length,
    upcomingCount,
    inProgressCount,
    completedTodayCount,
    todaySummaries: todayVisits.map((v) => {
      const progress = computeVisitProgress(v.properties);
      const executiveName = v.assignedTo?.name ?? "Unassigned";
      const clientFirstName = v.lead.clientName.split(" ")[0];
      return {
        id: v.id,
        clientName: v.lead.clientName,
        executiveName,
        total: progress.total,
        visited: progress.visited,
        status: v.status,
        summary: `${clientFirstName} - ${executiveName} - ${progress.total} ${progress.total === 1 ? "Property" : "Properties"} - ${progress.visited}/${progress.total} visited`,
      };
    }),
  };
}
