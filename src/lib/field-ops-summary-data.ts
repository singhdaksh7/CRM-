import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { getSystemConfig } from "./system-config";
import { getEmployeePerformance } from "./employee-performance-data";
import { getInventoryFreshnessOverview } from "./rules/inventory-freshness";
import { startOfIstDay, endOfIstDay } from "./ist-date";

const CACHE_TTL_SECONDS = 60;

export interface FieldOpsSummary {
  todaysVisitCount: number;
  completedVisitCount: number;
  pendingVisitCount: number;
  executiveLiveStatus: { id: string; name: string; todaysVisits: number; completedToday: number }[];
  pendingVerificationCount: number;
  unavailableReportsCount: number;
  directInventoryCount: number;
  indirectInventoryCount: number;
  topPerformingExecutive: { id: string; name: string; dealsClosed: number } | null;
  inactiveInventoryCount: number;
  propertiesAwaitingUpdateCount: number;
  freshness: { label: string; count: number }[];
}

/**
 * Objective 12 - Manager Dashboard widgets. This is the single highest
 * N+1 risk in the whole phase per its own review note - every count here
 * is one bounded groupBy/count query, never a per-record loop.
 */
export async function getFieldOpsSummary(organizationId: string): Promise<FieldOpsSummary> {
  return withTiming("fieldOpsSummary", "/dashboard", () =>
    cached(`field-ops-summary:${organizationId}`, CACHE_TTL_SECONDS, () => computeFieldOpsSummary(organizationId))
  );
}

async function computeFieldOpsSummary(organizationId: string): Promise<FieldOpsSummary> {
  const now = new Date();
  const todayStart = startOfIstDay(now);
  const todayEnd = endOfIstDay(now);
  const config = await getSystemConfig(organizationId);
  const staleCutoff = new Date(now.getTime() - config.stalePropertyDays * 24 * 60 * 60 * 1000);

  const [
    todaysVisitCount,
    completedVisitCount,
    pendingVisitCount,
    visitGroupsByExecutive,
    completedGroupsByExecutive,
    executives,
    pendingVerificationCount,
    unavailableReportsCount,
    inventoryGroups,
    inactiveInventoryCount,
    propertiesAwaitingUpdateCount,
    topPerformers,
    freshness,
  ] = await Promise.all([
    prisma.visit.count({ where: { organizationId, visitDate: { gte: todayStart, lte: todayEnd } } }),
    prisma.visit.count({ where: { organizationId, visitDate: { gte: todayStart, lte: todayEnd }, status: "COMPLETED" } }),
    prisma.visit.count({ where: { organizationId, visitDate: { gte: todayStart, lte: todayEnd }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    prisma.visit.groupBy({ by: ["assignedToId"], where: { organizationId, visitDate: { gte: todayStart, lte: todayEnd }, assignedToId: { not: null } }, _count: true }),
    prisma.visit.groupBy({ by: ["assignedToId"], where: { organizationId, visitDate: { gte: todayStart, lte: todayEnd }, status: "COMPLETED", assignedToId: { not: null } }, _count: true }),
    prisma.user.findMany({ where: { organizationId, role: "FIELD_EXECUTIVE", status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.propertyAvailabilityReport.count({ where: { organizationId, status: "PENDING" } }),
    prisma.propertyReport.count({ where: { organizationId, status: "PENDING", type: { in: ["ALREADY_RENTED", "ALREADY_SOLD", "PROPERTY_CLOSED", "DUPLICATE_LISTING"] } } }),
    prisma.property.groupBy({ by: ["inventorySource"], where: { organizationId, status: { not: "INACTIVE" } }, _count: true }),
    prisma.property.count({ where: { organizationId, status: "INACTIVE" } }),
    prisma.property.count({ where: { organizationId, status: "AVAILABLE", updatedAt: { lt: staleCutoff } } }),
    getEmployeePerformance("monthly"),
    getInventoryFreshnessOverview(organizationId),
  ]);

  const visitCountByExec = new Map(visitGroupsByExecutive.map((g) => [g.assignedToId as string, g._count]));
  const completedCountByExec = new Map(completedGroupsByExecutive.map((g) => [g.assignedToId as string, g._count]));
  const executiveLiveStatus = executives.map((e) => ({
    id: e.id,
    name: e.name,
    todaysVisits: visitCountByExec.get(e.id) ?? 0,
    completedToday: completedCountByExec.get(e.id) ?? 0,
  }));

  const directInventoryCount = inventoryGroups.find((g) => g.inventorySource === "DIRECT")?._count ?? 0;
  const indirectInventoryCount = inventoryGroups.find((g) => g.inventorySource === "INDIRECT")?._count ?? 0;

  const topPerformer = topPerformers[0];
  const topPerformingExecutive = topPerformer && topPerformer.dealsClosed > 0 ? { id: topPerformer.id, name: topPerformer.name, dealsClosed: topPerformer.dealsClosed } : null;

  return {
    todaysVisitCount,
    completedVisitCount,
    pendingVisitCount,
    executiveLiveStatus,
    pendingVerificationCount,
    unavailableReportsCount,
    directInventoryCount,
    indirectInventoryCount,
    topPerformingExecutive,
    inactiveInventoryCount,
    propertiesAwaitingUpdateCount,
    freshness: freshness.map((f) => ({ label: f.label, count: f.count })),
  };
}
