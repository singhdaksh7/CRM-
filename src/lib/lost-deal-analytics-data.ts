import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { getOrganizationId } from "./organization";
import { istMonthKey, istMonthLabel } from "./ist-date";
import { logger } from "./logger";
import type { LostDealReasonCategory } from "@prisma/client";

const LOST_DEAL_ANALYTICS_CACHE_TTL_SECONDS = 60;

const CATEGORY_LABELS: Record<LostDealReasonCategory, string> = {
  PRICE: "Price",
  LOCATION: "Location",
  COMPETITION: "Competition",
  BUDGET: "Budget",
  LOAN_REJECTED: "Loan Rejected",
  OWNER_ISSUE: "Owner Issue",
  CLIENT_NOT_INTERESTED: "Client Not Interested",
  OTHER: "Other",
};

export interface LostDealAnalyticsData {
  totalLost: number;
  byReason: { reason: string; count: number }[];
  trend: { month: string; count: number }[];
  topReasonLast90Days: { reason: string; count: number }[];
  /** Deals lost with no category recorded - a data-quality signal, not a real reason bucket. */
  uncategorizedCount: number;
  /** True when the Deal.lostReasonCategory column doesn't exist on the connected database yet (the Phase 3 migration hasn't been applied) - distinguishes "no data" from "can't be measured yet" so the page can show an accurate message instead of implying there simply are no lost deals. */
  migrationPending: boolean;
}

const EMPTY_RESULT: LostDealAnalyticsData = { totalLost: 0, byReason: [], trend: [], topReasonLast90Days: [], uncategorizedCount: 0, migrationPending: true };

export async function getLostDealAnalytics(): Promise<LostDealAnalyticsData> {
  const organizationId = getOrganizationId();
  return withTiming("lostDealAnalytics", "/reports/lost-deals", () =>
    cached(`lost-deal-analytics:${organizationId}`, LOST_DEAL_ANALYTICS_CACHE_TTL_SECONDS, () => computeLostDealAnalytics(organizationId))
  );
}

async function computeLostDealAnalytics(organizationId: string): Promise<LostDealAnalyticsData> {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 864e5);

  let byCategory, lostDeals, recentByCategory;
  try {
    [byCategory, lostDeals, recentByCategory] = await Promise.all([
      prisma.deal.groupBy({ by: ["lostReasonCategory"], where: { organizationId, status: "LOST" }, _count: { _all: true } }),
      prisma.deal.findMany({ where: { organizationId, status: "LOST", closedAt: { gte: rangeStart } }, select: { closedAt: true } }),
      prisma.deal.groupBy({ by: ["lostReasonCategory"], where: { organizationId, status: "LOST", closedAt: { gte: ninetyDaysAgo } }, _count: { _all: true } }),
    ]);
  } catch (err) {
    // Deal.lostReasonCategory doesn't exist on this database yet (the
    // Phase 3 migration hasn't been applied) - degrade to an explicit
    // "not measurable yet" result instead of a 500 for this whole page.
    logger.warn("lost_deal_analytics_query_failed", { organizationId, message: err instanceof Error ? err.message : String(err) });
    return EMPTY_RESULT;
  }

  const totalLost = byCategory.reduce((sum, c) => sum + c._count._all, 0);
  const uncategorizedCount = byCategory.find((c) => c.lostReasonCategory === null)?._count._all ?? 0;

  const trendMap = new Map<string, number>();
  for (const d of lostDeals) {
    if (!d.closedAt) continue;
    const key = istMonthLabel(istMonthKey(d.closedAt));
    trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
  }

  return {
    totalLost,
    migrationPending: false,
    uncategorizedCount,
    byReason: byCategory
      .filter((c) => c.lostReasonCategory !== null)
      .map((c) => ({ reason: CATEGORY_LABELS[c.lostReasonCategory as LostDealReasonCategory], count: c._count._all }))
      .sort((a, b) => b.count - a.count),
    trend: Array.from(trendMap.entries()).map(([month, count]) => ({ month, count })),
    topReasonLast90Days: recentByCategory
      .filter((c) => c.lostReasonCategory !== null)
      .map((c) => ({ reason: CATEGORY_LABELS[c.lostReasonCategory as LostDealReasonCategory], count: c._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
