import { prisma } from "./prisma";
import { Prisma, type Role } from "@prisma/client";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { resolveOrganizationIdForUser } from "./organization";

/**
 * Upper bound on concurrent Prisma queries this module issues per data
 * group. The production Supabase Transaction Pooler URL runs with a small
 * `connection_limit` (see DEPLOYMENT.md), so firing every dashboard query at
 * once via a flat `Promise.all` can exhaust the pool and surface as Prisma
 * P2024 pool-timeout errors. Env-overridable so it can be tuned per
 * deployment without a code change.
 */
const DASHBOARD_QUERY_CONCURRENCY = Number(process.env.DASHBOARD_QUERY_CONCURRENCY ?? 4);

/** Cache TTLs are short - correctness for counts/charts a few seconds stale
 * is an acceptable trade for not re-querying on every navigation, but
 * nothing here is used for financial or permission decisions. */
const CRITICAL_CACHE_TTL_SECONDS = 20;
const SECONDARY_CACHE_TTL_SECONDS = 30;

async function mapWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<void> {
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, tasks.length));
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      await task();
    }
  }
  await Promise.all(Array.from({ length: workerCount }, worker));
}

/**
 * Runs one dashboard panel's query, logging and falling back to a safe
 * default instead of throwing - one panel (or one pool-timeout) should not
 * crash the whole dashboard response.
 */
async function safe<T>(panel: string, fallback: T, query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      event: "dashboard_panel_failed",
      panel,
      message: err instanceof Error ? err.message : String(err),
    }));
    return fallback;
  }
}

type ActivityWithRelations = Prisma.ActivityGetPayload<{ include: { actor: true; lead: true } }>;
type MonthlyTrendPoint = { month: string; leads: number; deals: number };

export interface DashboardCriticalData {
  totalActiveProperties: number;
  propertiesForRent: number;
  propertiesForSale: number;
  newLeadsToday: number;
  unassignedLeads: number;
  followUpsDueToday: number;
  visitsToday: number;
  dealsClosedThisMonth: number;
  /** WhatsAppMessage rows of type CATALOGUE sent (created) today - the actual "send" event fired by sendCatalogue() in src/lib/catalogues.ts, not CatalogueShare creation (a share can be created without ever being sent). */
  cataloguesSentToday: number;
  /** Distinct CatalogueShare ids with a VIEWED CatalogueInteraction today. */
  cataloguesOpenedToday: number;
  /** CatalogueInteraction rows of type INTERESTED today. */
  clientsInterestedToday: number;
  /** CatalogueInteraction rows of type VISIT_REQUESTED today. */
  visitRequestsReceivedToday: number;
  /** Count for the "Leads Awaiting Shortlist" panel - see getLeadsAwaitingShortlist. */
  leadsAwaitingShortlistCount: number;
  leadSegments: Record<"residentialRent" | "residentialSale" | "commercialRent" | "commercialSale", number>;
  inventorySegments: Record<"residentialRent" | "residentialSale" | "commercialRent" | "commercialSale", number>;
  portalKpis: { today: number; week: number; needsReview: number; ambiguous: number; failed: number; conflicts: number; deadLetters: number; topSource: string | null };
}

export interface DashboardSecondaryData {
  employeeLeadCounts: { name: string; count: number }[];
  leadsBySource: { name: string; value: number }[];
  leadsByStatus: { name: string; value: number }[];
  propertiesByLocation: { name: string; value: number }[];
  recentActivities: ActivityWithRelations[];
  monthlyTrend: MonthlyTrendPoint[];
}

/**
 * The KPI tiles, today's visits, and follow-ups needing attention - the
 * "above the fold" numbers a user opening /dashboard wants first. Kept
 * independent of getDashboardSecondaryData so the page can render this
 * immediately and stream the rest in behind a Suspense boundary (see
 * (app)/dashboard/page.tsx) - one slow chart query never delays these.
 */
export async function getDashboardCriticalData(role: Role, userId: string): Promise<DashboardCriticalData> {
  return withTiming("dashboardCritical", "/dashboard", () =>
    cached(`dashboard:critical:${role}:${userId}`, CRITICAL_CACHE_TTL_SECONDS, () => computeCriticalData(role, userId))
  );
}

async function computeCriticalData(role: Role, userId: string): Promise<DashboardCriticalData> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const organizationId = await resolveOrganizationIdForUser(userId);

  const scopedLead = role === "FIELD_EXECUTIVE" ? { assignedToId: userId } : {};
  const scopedVisit = role === "FIELD_EXECUTIVE" ? { assignedToId: userId } : {};
  const scopedFollowUp = role === "FIELD_EXECUTIVE" ? { ownerId: userId } : {};

  let propertyCounts = { total: 0, rent: 0, sale: 0 };
  let newLeadsToday = 0;
  let unassignedLeads = 0;
  let followUpsDueToday = 0;
  let visitsToday = 0;
  let dealsClosedThisMonth = 0;
  let cataloguesSentToday = 0;
  let cataloguesOpenedToday = 0;
  let clientsInterestedToday = 0;
  let visitRequestsReceivedToday = 0;
  let leadsAwaitingShortlistCount = 0;
  const emptySegments = { residentialRent: 0, residentialSale: 0, commercialRent: 0, commercialSale: 0 };
  const leadSegments = { ...emptySegments };
  const inventorySegments = { ...emptySegments };
  let portalKpis: DashboardCriticalData["portalKpis"] = { today: 0, week: 0, needsReview: 0, ambiguous: 0, failed: 0, conflicts: 0, deadLetters: 0, topSource: null };
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 6);

  const tasks: (() => Promise<void>)[] = [
    async () => {
      // Replaces 3 separate property.count() calls (total/rent/sale) with 1 groupBy.
      propertyCounts = await safe("propertyCounts", propertyCounts, async () => {
        const grouped = await prisma.property.groupBy({
          by: ["listingType"],
          where: { organizationId, status: { in: ["AVAILABLE", "RESERVED"] } },
          _count: { _all: true },
        });
        const rent = grouped.find((g) => g.listingType === "RENT")?._count._all ?? 0;
        const sale = grouped.find((g) => g.listingType === "SALE")?._count._all ?? 0;
        return { total: rent + sale, rent, sale };
      });
    },
    async () => {
      newLeadsToday = await safe("newLeadsToday", 0, () =>
        prisma.lead.count({ where: { organizationId, ...scopedLead, createdAt: { gte: startOfToday, lte: endOfToday } } })
      );
    },
    async () => {
      const [leadGroups, propertyGroups] = await safe("businessSegments", [[], []] as const, () => Promise.all([
        prisma.lead.groupBy({ by: ["assetClass", "transactionType"], where: { organizationId, ...scopedLead }, _count: { _all: true } }),
        prisma.property.groupBy({ by: ["assetClass", "listingType"], where: { organizationId, status: { in: ["AVAILABLE", "RESERVED"] } }, _count: { _all: true } }),
      ]));
      const key = (asset: string, transaction: string) => `${asset === "RESIDENTIAL" ? "residential" : "commercial"}${transaction === "RENT" ? "Rent" : "Sale"}` as keyof typeof emptySegments;
      for (const row of leadGroups) leadSegments[key(row.assetClass, row.transactionType)] = row._count._all;
      for (const row of propertyGroups) inventorySegments[key(row.assetClass, row.listingType)] = row._count._all;
    },
    async () => {
      portalKpis = await safe("portalKpis", portalKpis, async () => {
        const [today, week, needsReview, ambiguous, failed, conflicts, deadLetters, providers] = await Promise.all([
          prisma.externalLeadEvent.count({ where: { organizationId, receivedAt: { gte: startOfToday } } }), prisma.externalLeadEvent.count({ where: { organizationId, receivedAt: { gte: startOfWeek } } }), prisma.externalLeadEvent.count({ where: { organizationId, ingestionStatus: "NEEDS_REVIEW" } }), prisma.externalLeadEvent.count({ where: { organizationId, ingestionStatus: "AMBIGUOUS" } }), prisma.externalLeadEvent.count({ where: { organizationId, ingestionStatus: "FAILED" } }), prisma.portalListing.count({ where: { organizationId, status: "SYNC_CONFLICT" } }), prisma.portalOperation.count({ where: { organizationId, status: "DEAD_LETTER" } }), prisma.externalLeadEvent.groupBy({ by: ["provider"], where: { organizationId }, _count: { _all: true }, orderBy: { _count: { provider: "desc" } }, take: 1 }),
        ]);
        return { today, week, needsReview, ambiguous, failed, conflicts, deadLetters, topSource: providers[0]?.provider ?? null };
      });
    },
    async () => {
      unassignedLeads = await safe("unassignedLeads", 0, () =>
        prisma.lead.count({ where: { organizationId, assignedToId: null } })
      );
    },
    async () => {
      followUpsDueToday = await safe("followUpsDueToday", 0, () =>
        prisma.followUp.count({
          where: { ...scopedFollowUp, status: { in: ["PENDING", "OVERDUE"] }, dueDate: { gte: startOfToday, lte: endOfToday } },
        })
      );
    },
    async () => {
      visitsToday = await safe("visitsToday", 0, () =>
        prisma.visit.count({ where: { ...scopedVisit, visitDate: { gte: startOfToday, lte: endOfToday } } })
      );
    },
    async () => {
      dealsClosedThisMonth = await safe("dealsClosedThisMonth", 0, () =>
        prisma.lead.count({ where: { organizationId, ...scopedLead, status: "CLOSED_WON", updatedAt: { gte: startOfMonth } } })
      );
    },
    async () => {
      // The actual "send" event is a WhatsAppMessage, not CatalogueShare
      // creation - a share can exist without ever being sent. See
      // sendCatalogue() in src/lib/catalogues.ts.
      cataloguesSentToday = await safe("cataloguesSentToday", 0, () =>
        prisma.whatsAppMessage.count({
          where: { organizationId, messageType: "CATALOGUE", direction: "OUTBOUND", createdAt: { gte: startOfToday, lte: endOfToday } },
        })
      );
    },
    async () => {
      cataloguesOpenedToday = await safe("cataloguesOpenedToday", 0, async () => {
        const rows = await prisma.catalogueInteraction.findMany({
          where: { organizationId, type: "VIEWED", createdAt: { gte: startOfToday, lte: endOfToday } },
          select: { catalogueShareId: true },
          distinct: ["catalogueShareId"],
        });
        return rows.length;
      });
    },
    async () => {
      clientsInterestedToday = await safe("clientsInterestedToday", 0, () =>
        prisma.catalogueInteraction.count({
          where: { organizationId, type: "INTERESTED", createdAt: { gte: startOfToday, lte: endOfToday } },
        })
      );
    },
    async () => {
      visitRequestsReceivedToday = await safe("visitRequestsReceivedToday", 0, () =>
        prisma.catalogueInteraction.count({
          where: { organizationId, type: "VISIT_REQUESTED", createdAt: { gte: startOfToday, lte: endOfToday } },
        })
      );
    },
    async () => {
      leadsAwaitingShortlistCount = await safe("leadsAwaitingShortlistCount", 0, () =>
        prisma.lead.count({ where: { ...scopedLead, ...leadsAwaitingShortlistWhere(organizationId) } })
      );
    },
  ];

  await mapWithConcurrency(tasks, DASHBOARD_QUERY_CONCURRENCY);

  return {
    totalActiveProperties: propertyCounts.total,
    propertiesForRent: propertyCounts.rent,
    propertiesForSale: propertyCounts.sale,
    newLeadsToday,
    unassignedLeads,
    followUpsDueToday,
    visitsToday,
    dealsClosedThisMonth,
    cataloguesSentToday,
    cataloguesOpenedToday,
    clientsInterestedToday,
    visitRequestsReceivedToday,
    leadsAwaitingShortlistCount,
    leadSegments, inventorySegments, portalKpis,
  };
}

/**
 * Charts, trends, recent activity, source/status distribution, and
 * employee workload - everything that's useful but not needed for the
 * first paint. Streamed in behind a Suspense boundary.
 */
export async function getDashboardSecondaryData(role: Role, userId: string): Promise<DashboardSecondaryData> {
  return withTiming("dashboardSecondary", "/dashboard", () =>
    cached(`dashboard:secondary:${role}:${userId}`, SECONDARY_CACHE_TTL_SECONDS, () => computeSecondaryData(role, userId))
  );
}

async function computeSecondaryData(role: Role, userId: string): Promise<DashboardSecondaryData> {
  const organizationId = await resolveOrganizationIdForUser(userId);
  const scopedLead = role === "FIELD_EXECUTIVE" ? { assignedToId: userId } : {};

  let employeeLeadCounts: DashboardSecondaryData["employeeLeadCounts"] = [];
  let leadsBySource: DashboardSecondaryData["leadsBySource"] = [];
  let leadsByStatus: DashboardSecondaryData["leadsByStatus"] = [];
  let propertiesByLocation: DashboardSecondaryData["propertiesByLocation"] = [];
  let recentActivities: ActivityWithRelations[] = [];
  let monthlyTrend: MonthlyTrendPoint[] = [];

  const tasks: (() => Promise<void>)[] = [
    async () => {
      employeeLeadCounts = await safe("employeeLeadCounts", employeeLeadCounts, async () => {
        const rows = await prisma.user.findMany({
          where: { organizationId, role: "FIELD_EXECUTIVE" },
          select: { id: true, name: true, _count: { select: { assignedLeads: { where: { organizationId } } } } },
        });
        return rows.map((e) => ({ name: e.name, count: e._count.assignedLeads }));
      });
    },
    async () => {
      leadsBySource = await safe("leadsBySource", leadsBySource, async () => {
        const rows = await prisma.lead.groupBy({ by: ["source"], _count: { _all: true }, where: { organizationId, ...scopedLead } });
        return rows.map((s) => ({ name: s.source.replace(/_/g, " "), value: s._count._all }));
      });
    },
    async () => {
      leadsByStatus = await safe("leadsByStatus", leadsByStatus, async () => {
        const rows = await prisma.lead.groupBy({ by: ["status"], _count: { _all: true }, where: { organizationId, ...scopedLead } });
        return rows.map((s) => ({ name: s.status.replace(/_/g, " "), value: s._count._all }));
      });
    },
    async () => {
      propertiesByLocation = await safe("propertiesByLocation", propertiesByLocation, async () => {
        const rows = await prisma.property.groupBy({ by: ["area"], _count: { _all: true }, where: { organizationId } });
        return rows.map((p) => ({ name: p.area, value: p._count._all })).sort((a, b) => b.value - a.value).slice(0, 8);
      });
    },
    async () => {
      recentActivities = await safe("recentActivities", recentActivities, () =>
        prisma.activity.findMany({ where: { organizationId, leadId: { not: null }, ...(role === "FIELD_EXECUTIVE" ? { lead: { assignedToId: userId } } : {}) }, include: { actor: true, lead: true }, orderBy: { createdAt: "desc" }, take: 8 })
      );
    },
    async () => {
      monthlyTrend = await safe("monthlyTrend", monthlyTrend, () => getMonthlyTrend(role, userId, organizationId));
    },
  ];

  await mapWithConcurrency(tasks, DASHBOARD_QUERY_CONCURRENCY);

  return { employeeLeadCounts, leadsBySource, leadsByStatus, propertiesByLocation, recentActivities, monthlyTrend };
}

/** Full payload for API consumers that need everything in one response (GET /api/dashboard) - same shape this module returned before the critical/secondary split. */
export async function getDashboardData(role: Role, userId: string) {
  const [critical, secondary] = await Promise.all([
    getDashboardCriticalData(role, userId),
    getDashboardSecondaryData(role, userId),
  ]);
  return { ...critical, ...secondary };
}

const LEADS_AWAITING_SHORTLIST_LIMIT = 20;
const LEADS_AWAITING_SHORTLIST_CACHE_TTL_SECONDS = SECONDARY_CACHE_TTL_SECONDS;

/**
 * Shared filter for the "Leads Awaiting Shortlist" panel: early-pipeline
 * leads (not yet past PROPERTIES_SHARED) that have no currently-ACTIVE
 * catalogue share. Used both by the row query below and by the
 * leadsAwaitingShortlistCount KPI in computeCriticalData, so the two numbers
 * never drift apart.
 */
function leadsAwaitingShortlistWhere(organizationId: string): Prisma.LeadWhereInput {
  return {
    organizationId,
    status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
    NOT: { catalogueShares: { some: { status: "ACTIVE" } } },
  };
}

const leadAwaitingShortlistSelect = {
  id: true,
  clientName: true,
  phone: true,
  requirementType: true,
  preferredBhk: true,
  preferredLocation: true,
  minBudget: true,
  maxBudget: true,
  source: true,
  createdAt: true,
  assignedTo: { select: { name: true } },
} satisfies Prisma.LeadSelect;

export type LeadAwaitingShortlist = Prisma.LeadGetPayload<{ select: typeof leadAwaitingShortlistSelect }>;

export interface LeadsAwaitingShortlistResult {
  leads: LeadAwaitingShortlist[];
  totalCount: number;
}

/**
 * Leads still in the early pipeline (NEW/CONTACTED/QUALIFIED) that have no
 * currently-active catalogue share - i.e. nobody has shortlisted properties
 * and sent them yet. Oldest-waiting-first, capped at
 * LEADS_AWAITING_SHORTLIST_LIMIT with a separate total count so the panel
 * can show "showing 20 of 47" without fetching all 47 rows.
 *
 * Deliberately does NOT compute a live "N matching properties" count per
 * row here - that would mean running the full inventory-matching query
 * (src/lib/matching.ts) once per lead on every dashboard load, which does
 * not scale past a handful of leads. TODO: if a match count becomes a hard
 * requirement for this panel, compute it lazily (e.g. on-demand per row via
 * a client fetch when the row is expanded, or a periodically-refreshed
 * materialized count) rather than inline here.
 */
export async function getLeadsAwaitingShortlist(organizationId: string): Promise<LeadsAwaitingShortlistResult> {
  return withTiming("leadsAwaitingShortlist", "/dashboard", () =>
    cached(`dashboard:leadsAwaitingShortlist:${organizationId}`, LEADS_AWAITING_SHORTLIST_CACHE_TTL_SECONDS, () =>
      computeLeadsAwaitingShortlist(organizationId)
    )
  );
}

async function computeLeadsAwaitingShortlist(organizationId: string): Promise<LeadsAwaitingShortlistResult> {
  const where = leadsAwaitingShortlistWhere(organizationId);

  let leads: LeadAwaitingShortlist[] = [];
  let totalCount = 0;

  const tasks: (() => Promise<void>)[] = [
    async () => {
      leads = await safe("leadsAwaitingShortlistRows", leads, () =>
        prisma.lead.findMany({
          where,
          select: leadAwaitingShortlistSelect,
          orderBy: { createdAt: "asc" },
          take: LEADS_AWAITING_SHORTLIST_LIMIT,
        })
      );
    },
    async () => {
      totalCount = await safe("leadsAwaitingShortlistTotalCount", 0, () => prisma.lead.count({ where }));
    },
  ];

  await mapWithConcurrency(tasks, DASHBOARD_QUERY_CONCURRENCY);

  return { leads, totalCount };
}

/**
 * Replaces a previous implementation's 6 months x 2 queries (12 total, one
 * leads-count and one deals-count per month) with 2 grouped raw-SQL
 * aggregates, then fills in any month with no rows as 0.
 */
async function getMonthlyTrend(role: Role, userId: string, organizationId: string): Promise<MonthlyTrendPoint[]> {
  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${start.getFullYear()}-${start.getMonth()}`, label: start.toLocaleString("en-IN", { month: "short" }) });
  }
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const scopeClause = role === "FIELD_EXECUTIVE" ? Prisma.sql`AND "assignedToId" = ${userId}` : Prisma.empty;

  const [leadRows, dealRows] = await Promise.all([
    prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
      SELECT date_trunc('month', "createdAt") AS bucket, count(*)::bigint AS count
      FROM "leads"
      WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${rangeStart}
      ${scopeClause}
      GROUP BY 1
    `,
    prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
      SELECT date_trunc('month', "updatedAt") AS bucket, count(*)::bigint AS count
      FROM "leads"
      WHERE "organizationId" = ${organizationId} AND status = 'CLOSED_WON' AND "updatedAt" >= ${rangeStart}
      ${scopeClause}
      GROUP BY 1
    `,
  ]);

  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const leadsByMonth = new Map(leadRows.map((r) => [keyOf(new Date(r.bucket)), Number(r.count)]));
  const dealsByMonth = new Map(dealRows.map((r) => [keyOf(new Date(r.bucket)), Number(r.count)]));

  return months.map((m) => ({
    month: m.label,
    leads: leadsByMonth.get(m.key) ?? 0,
    deals: dealsByMonth.get(m.key) ?? 0,
  }));
}
