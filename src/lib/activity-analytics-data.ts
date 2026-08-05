import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { getOrganizationId } from "./organization";

const ACTIVITY_ANALYTICS_CACHE_TTL_SECONDS = 60;

export interface ActivityAnalyticsData {
  avgResponseTimeHours: number | null;
  avgClosingTimeDays: number | null;
  visitSuccessPct: number;
  propertyMatchSuccessPct: number;
  employeeWorkload: { name: string; activeLeads: number }[];
  openFollowUps: number;
  ageingLeads: { bucket: string; count: number }[];
}

export async function getActivityAnalytics(): Promise<ActivityAnalyticsData> {
  const organizationId = getOrganizationId();
  return withTiming("activityAnalytics", "/reports/activity", () =>
    cached(`activity-analytics:${organizationId}`, ACTIVITY_ANALYTICS_CACHE_TTL_SECONDS, () => computeActivityAnalytics(organizationId))
  );
}

async function computeActivityAnalytics(organizationId: string): Promise<ActivityAnalyticsData> {
  const now = new Date();

  const [contactedLeads, closedLeads, totalVisits, completedVisitsWithOutcome, leadsWithShares, leadsInterested, employeeWorkload, openFollowUps, activeLeads] =
    await Promise.all([
      prisma.lead.findMany({ where: { organizationId, lastContactedAt: { not: null } }, select: { createdAt: true, lastContactedAt: true } }),
      prisma.lead.findMany({ where: { organizationId, status: "CLOSED_WON" }, select: { createdAt: true, updatedAt: true } }),
      prisma.visit.count({ where: { organizationId, status: { in: ["COMPLETED", "CLIENT_NO_SHOW", "CANCELLED"] } } }),
      prisma.visit.count({ where: { organizationId, status: "COMPLETED", outcome: { in: ["HIGHLY_INTERESTED", "INTERESTED", "READY_FOR_NEGOTIATION"] } } }),
      prisma.lead.count({ where: { organizationId, catalogueShares: { some: {} } } }),
      prisma.catalogueInteraction.groupBy({ by: ["catalogueShareId"], where: { organizationId, type: "INTERESTED" } }),
      prisma.user.findMany({
        where: { organizationId, role: "FIELD_EXECUTIVE" },
        select: { name: true, _count: { select: { assignedLeads: true } } },
      }),
      prisma.followUp.count({ where: { organizationId, status: { in: ["PENDING", "OVERDUE"] } } }),
      prisma.lead.findMany({
        where: { organizationId, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] } },
        select: { createdAt: true },
      }),
    ]);

  const responseTimes = contactedLeads.map((l) => (l.lastContactedAt!.getTime() - l.createdAt.getTime()) / 36e5);
  const avgResponseTimeHours = responseTimes.length > 0 ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10 : null;

  const closingTimes = closedLeads.map((l) => (l.updatedAt.getTime() - l.createdAt.getTime()) / 864e5);
  const avgClosingTimeDays = closingTimes.length > 0 ? Math.round((closingTimes.reduce((a, b) => a + b, 0) / closingTimes.length) * 10) / 10 : null;

  const visitSuccessPct = totalVisits > 0 ? Math.round((completedVisitsWithOutcome / totalVisits) * 1000) / 10 : 0;
  const propertyMatchSuccessPct = leadsWithShares > 0 ? Math.round((leadsInterested.length / leadsWithShares) * 1000) / 10 : 0;

  const buckets = [
    { label: "0-7 days", min: 0, max: 7 },
    { label: "8-14 days", min: 8, max: 14 },
    { label: "15-30 days", min: 15, max: 30 },
    { label: "30+ days", min: 31, max: Infinity },
  ];
  const ageingLeads = buckets.map((b) => ({
    bucket: b.label,
    count: activeLeads.filter((l) => {
      const ageDays = (now.getTime() - l.createdAt.getTime()) / 864e5;
      return ageDays >= b.min && ageDays <= b.max;
    }).length,
  }));

  return {
    avgResponseTimeHours,
    avgClosingTimeDays,
    visitSuccessPct,
    propertyMatchSuccessPct,
    employeeWorkload: employeeWorkload.map((e) => ({ name: e.name, activeLeads: e._count.assignedLeads })),
    openFollowUps,
    ageingLeads,
  };
}
