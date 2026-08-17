import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { startOfIstDay, endOfIstDay } from "./ist-date";
import { ACTIVE_VISIT_STATUSES } from "./visits";

const CACHE_TTL_SECONDS = 30; // short - this is "what should I do right now" data

const VISIT_SELECT = {
  id: true,
  visitDate: true,
  visitTime: true,
  status: true,
  outcome: true,
  meetingLocation: true,
  lead: { select: { id: true, clientName: true, phone: true } },
  property: { select: { id: true, title: true, area: true, address: true, latitude: true, longitude: true, ownerName: true, ownerPhone: true } },
  // Multi-property visits: the card shows total and remaining counts. Selected
  // rather than _count so "remaining" can be derived without a second query.
  properties: { select: { status: true, reactionRating: true }, orderBy: { sequence: "asc" } },
} as const;

const PROPERTY_CARD_SELECT = { id: true, title: true, area: true, propertyCode: true, coverImage: true, status: true, monthlyRent: true, salePrice: true, listingType: true } as const;

export interface ExecutiveDashboardData {
  todaysVisits: Awaited<ReturnType<typeof loadTodaysVisits>>;
  upcomingVisits: Awaited<ReturnType<typeof loadUpcomingVisits>>;
  recentlyCompleted: Awaited<ReturnType<typeof loadRecentlyCompleted>>;
  recentlyReported: Awaited<ReturnType<typeof loadRecentlyReported>>;
  assignedLeads: Awaited<ReturnType<typeof loadAssignedLeads>>;
  assignedCatalogues: Awaited<ReturnType<typeof loadAssignedCatalogues>>;
  favorites: Awaited<ReturnType<typeof loadFavorites>>;
  recentlyViewed: Awaited<ReturnType<typeof loadRecentlyViewed>>;
}

/** Change 8 - Today's Visits -> Upcoming -> Recently Completed -> Recently Reported, replacing a flatter "today's assignments" view. */
export async function getExecutiveDashboardData(userId: string): Promise<ExecutiveDashboardData> {
  return withTiming("executiveDashboard", "/executive-dashboard", () =>
    cached(`executive-dashboard:${userId}`, CACHE_TTL_SECONDS, () => computeExecutiveDashboardData(userId))
  );
}

async function computeExecutiveDashboardData(userId: string): Promise<ExecutiveDashboardData> {
  const now = new Date();
  const [todaysVisits, upcomingVisits, recentlyCompleted, recentlyReported, assignedLeads, assignedCatalogues, favorites, recentlyViewed] = await Promise.all([
    loadTodaysVisits(userId, now),
    loadUpcomingVisits(userId, now),
    loadRecentlyCompleted(userId),
    loadRecentlyReported(userId),
    loadAssignedLeads(userId),
    loadAssignedCatalogues(userId),
    loadFavorites(userId),
    loadRecentlyViewed(userId),
  ]);

  return { todaysVisits, upcomingVisits, recentlyCompleted, recentlyReported, assignedLeads, assignedCatalogues, favorites, recentlyViewed };
}

/**
 * TODAY. Scoped on assignedToId - the executive who must physically perform
 * the visit - and on IST day boundaries via the shared helpers, so a visit is
 * never bucketed by the server's timezone.
 */
function loadTodaysVisits(userId: string, now: Date) {
  return prisma.visit.findMany({
    where: { assignedToId: userId, visitDate: { gte: startOfIstDay(now), lte: endOfIstDay(now) }, status: { in: ACTIVE_VISIT_STATUSES } },
    select: VISIT_SELECT,
    orderBy: { visitDate: "asc" },
  });
}

/** UPCOMING - strictly after the end of the current IST day. */
function loadUpcomingVisits(userId: string, now: Date) {
  return prisma.visit.findMany({
    where: { assignedToId: userId, visitDate: { gt: endOfIstDay(now) }, status: { in: ACTIVE_VISIT_STATUSES } },
    select: VISIT_SELECT,
    orderBy: { visitDate: "asc" },
    take: 10,
  });
}

function loadRecentlyCompleted(userId: string) {
  return prisma.visit.findMany({
    where: { assignedToId: userId, status: "COMPLETED" },
    select: VISIT_SELECT,
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
}

/** Recently reported availability/data-quality issues submitted by this executive - reads only, safe even before PR7's write routes exist. */
async function loadRecentlyReported(userId: string) {
  const [availabilityReports, propertyReports] = await Promise.all([
    prisma.propertyAvailabilityReport.findMany({
      where: { reportedById: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, reason: true, status: true, createdAt: true, property: { select: { id: true, title: true } } },
    }),
    prisma.propertyReport.findMany({
      where: { reportedById: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, type: true, status: true, createdAt: true, property: { select: { id: true, title: true } } },
    }),
  ]);

  return [
    ...availabilityReports.map((r) => ({ id: r.id, issueType: "AVAILABILITY" as const, label: r.reason, status: r.status, createdAt: r.createdAt, property: r.property })),
    ...propertyReports.map((r) => ({ id: r.id, issueType: "REPORT" as const, label: r.type, status: r.status, createdAt: r.createdAt, property: r.property })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10);
}

function loadAssignedLeads(userId: string) {
  return prisma.lead.findMany({
    where: { assignedToId: userId, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] } },
    select: { id: true, clientName: true, phone: true, status: true, priority: true, preferredLocation: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
}

function loadAssignedCatalogues(userId: string) {
  return prisma.catalogueShare.findMany({
    where: { lead: { assignedToId: userId }, status: "ACTIVE" },
    select: { id: true, title: true, createdAt: true, lead: { select: { id: true, clientName: true } }, _count: { select: { properties: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

function loadFavorites(userId: string) {
  return prisma.propertyFavorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { property: { select: PROPERTY_CARD_SELECT } },
  }).then((rows) => rows.map((r) => r.property));
}

const RECENTLY_VIEWED_LIMIT = 8;
const RAW_FETCH_LIMIT = 50;

async function loadRecentlyViewed(userId: string) {
  const logs = await prisma.propertyViewLog.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    take: RAW_FETCH_LIMIT,
    select: { propertyId: true, property: { select: PROPERTY_CARD_SELECT } },
  });
  const seen = new Set<string>();
  const result: (typeof logs)[number]["property"][] = [];
  for (const log of logs) {
    if (seen.has(log.propertyId)) continue;
    seen.add(log.propertyId);
    result.push(log.property);
    if (result.length >= RECENTLY_VIEWED_LIMIT) break;
  }
  return result;
}
