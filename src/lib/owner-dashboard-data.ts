import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { getOrganizationId } from "./organization";
import { startOfIstDay, endOfIstDay } from "./ist-date";
import type { LeadStatus } from "@prisma/client";

const OWNER_DASHBOARD_CACHE_TTL_SECONDS = 30;

// ---------------------------------------------------------------------------
// Business Funnel (Phase 3, Module 1)
//
// Maps the requested funnel (New Lead -> Qualified -> Matched -> Catalogue
// Shared -> Visit Done -> Negotiation -> Deal Closed -> Payment Received)
// onto the existing LeadStatus pipeline plus CatalogueShare/Payment
// existence, so no new "stage" field is needed on Lead. Each stage count is
// cumulative ("reached this stage or later"), matching how a sales funnel is
// normally read.
// ---------------------------------------------------------------------------

export const FUNNEL_STAGE_KEYS = [
  "newLead",
  "qualified",
  "matched",
  "catalogueShared",
  "visitDone",
  "negotiation",
  "dealClosed",
  "paymentReceived",
] as const;

export type FunnelStageKey = (typeof FUNNEL_STAGE_KEYS)[number];

export interface FunnelStage {
  key: FunnelStageKey;
  label: string;
  count: number;
  /** % of the first stage's count (New Lead) that reached this stage. */
  conversionFromStartPct: number;
  /** % of the previous stage's count that reached this stage - the "drop-off" number. */
  conversionFromPreviousPct: number;
}

const FUNNEL_LABELS: Record<FunnelStageKey, string> = {
  newLead: "New Lead",
  qualified: "Qualified",
  matched: "Matched",
  catalogueShared: "Catalogue Shared",
  visitDone: "Visit Done",
  negotiation: "Negotiation",
  dealClosed: "Deal Closed",
  paymentReceived: "Payment Received",
};

/** Statuses that count as having reached (or passed) a given funnel stage. Pure - no I/O, unit-testable. */
const STATUSES_AT_OR_BEYOND: Record<Exclude<FunnelStageKey, "matched" | "catalogueShared" | "paymentReceived">, LeadStatus[]> = {
  newLead: ["NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON"],
  qualified: ["QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON"],
  visitDone: ["VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON"],
  negotiation: ["NEGOTIATION", "CLOSED_WON"],
  dealClosed: ["CLOSED_WON"],
};

/** Pure conversion-percentage calculator, split out from the DB-fetching wrapper below so it's unit-testable without Prisma. */
export function buildFunnelStages(counts: Record<FunnelStageKey, number>): FunnelStage[] {
  const startCount = counts.newLead || 0;
  return FUNNEL_STAGE_KEYS.map((key, i) => {
    const count = counts[key];
    const prevCount = i === 0 ? count : counts[FUNNEL_STAGE_KEYS[i - 1]];
    return {
      key,
      label: FUNNEL_LABELS[key],
      count,
      conversionFromStartPct: startCount > 0 ? Math.round((count / startCount) * 1000) / 10 : 0,
      conversionFromPreviousPct: prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : 0,
    };
  });
}

export interface OwnerDashboardData {
  today: {
    newLeads: number;
    activeLeads: number;
    visitsToday: number;
    followUpsDue: number;
    dealsClosing: number;
    brokeragePending: number;
    brokerageReceived: number;
  };
  funnel: FunnelStage[];
}

export async function getOwnerDashboardData(): Promise<OwnerDashboardData> {
  const organizationId = getOrganizationId();
  return withTiming("ownerDashboard", "/owner-dashboard", () =>
    cached(`owner-dashboard:${organizationId}`, OWNER_DASHBOARD_CACHE_TTL_SECONDS, () => computeOwnerDashboardData(organizationId))
  );
}

async function computeOwnerDashboardData(organizationId: string): Promise<OwnerDashboardData> {
  const now = new Date();
  const startOfToday = startOfIstDay(now);
  const endOfToday = endOfIstDay(now);

  const [
    newLeads,
    activeLeads,
    visitsToday,
    followUpsDue,
    dealsClosing,
    pendingPayments,
    receivedPayments,
    qualifiedCount,
    matchedLeadIds,
    catalogueSharedCount,
    visitDoneCount,
    negotiationCount,
    dealClosedCount,
    paidDealIds,
  ] = await Promise.all([
    prisma.lead.count({ where: { organizationId, createdAt: { gte: startOfToday, lte: endOfToday } } }),
    prisma.lead.count({ where: { organizationId, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] } } }),
    prisma.visit.count({ where: { organizationId, visitDate: { gte: startOfToday, lte: endOfToday } } }),
    prisma.followUp.count({ where: { organizationId, status: { in: ["PENDING", "OVERDUE"] }, dueDate: { gte: startOfToday, lte: endOfToday } } }),
    prisma.deal.count({ where: { organizationId, status: "OPEN", expectedCloseDate: { gte: startOfToday, lte: endOfToday } } }),
    prisma.payment.aggregate({ where: { organizationId, direction: "RECEIVABLE", status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { organizationId, direction: "RECEIVABLE", status: "PAID", paidAt: { gte: startOfToday, lte: endOfToday } }, _sum: { amount: true } }),
    prisma.lead.count({ where: { organizationId, status: { in: STATUSES_AT_OR_BEYOND.qualified } } }),
    prisma.lead.findMany({ where: { organizationId, catalogueShares: { some: {} } }, select: { id: true } }),
    prisma.lead.count({ where: { organizationId, status: { in: STATUSES_AT_OR_BEYOND.qualified.filter((s) => s !== "QUALIFIED") } } }),
    prisma.lead.count({ where: { organizationId, status: { in: STATUSES_AT_OR_BEYOND.visitDone } } }),
    prisma.lead.count({ where: { organizationId, status: { in: STATUSES_AT_OR_BEYOND.negotiation } } }),
    prisma.lead.count({ where: { organizationId, status: { in: STATUSES_AT_OR_BEYOND.dealClosed } } }),
    prisma.payment.findMany({ where: { organizationId, direction: "RECEIVABLE", status: "PAID" }, select: { dealId: true }, distinct: ["dealId"] }),
  ]);

  const totalLeads = await prisma.lead.count({ where: { organizationId } });

  const counts: Record<FunnelStageKey, number> = {
    newLead: totalLeads,
    qualified: qualifiedCount,
    matched: matchedLeadIds.length,
    catalogueShared: catalogueSharedCount,
    visitDone: visitDoneCount,
    negotiation: negotiationCount,
    dealClosed: dealClosedCount,
    paymentReceived: paidDealIds.length,
  };

  return {
    today: {
      newLeads,
      activeLeads,
      visitsToday,
      followUpsDue,
      dealsClosing,
      brokeragePending: pendingPayments._sum.amount ?? 0,
      brokerageReceived: receivedPayments._sum.amount ?? 0,
    },
    funnel: buildFunnelStages(counts),
  };
}
