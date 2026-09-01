import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { startOfIstDay, startOfIstWeek, startOfIstMonth } from "./ist-date";

const EMPLOYEE_PERFORMANCE_CACHE_TTL_SECONDS = 60;

export type LeaderboardPeriod = "daily" | "weekly" | "monthly";

export interface EmployeeKpi {
  id: string;
  name: string;
  assignedLeads: number;
  contacted: number;
  followUps: number;
  visits: number;
  dealsClosed: number;
  /** null = insufficient data (zero leads assigned in this period), never a misleading 0%. */
  conversionPct: number | null;
  brokerageGenerated: number;
  avgResponseTimeHours: number | null;
  avgLeadAgeDays: number;
}

/** IST calendar-aware, so "today"/"this week"/"this month" match the broker's actual business day regardless of server timezone. */
function periodStart(period: LeaderboardPeriod, now: Date = new Date()): Date {
  if (period === "weekly") return startOfIstWeek(now);
  if (period === "monthly") return startOfIstMonth(now);
  return startOfIstDay(now);
}

/** Pure ranking + conversion-math helper, split out for unit testing. */
export function rankEmployees(rows: Omit<EmployeeKpi, "conversionPct">[]): EmployeeKpi[] {
  return rows
    .map((r) => ({ ...r, conversionPct: r.assignedLeads > 0 ? Math.round((r.dealsClosed / r.assignedLeads) * 1000) / 10 : null }))
    .sort((a, b) => b.dealsClosed - a.dealsClosed || b.brokerageGenerated - a.brokerageGenerated);
}

export async function getEmployeePerformance(period: LeaderboardPeriod, organizationId: string): Promise<EmployeeKpi[]> {
  return withTiming("employeePerformance", "/reports/employees", () =>
    cached(`employee-performance:${organizationId}:${period}`, EMPLOYEE_PERFORMANCE_CACHE_TTL_SECONDS, () => computeEmployeePerformance(organizationId, period))
  );
}

async function computeEmployeePerformance(organizationId: string, period: LeaderboardPeriod): Promise<EmployeeKpi[]> {
  const since = periodStart(period);
  const now = new Date();

  const employees = await prisma.user.findMany({
    where: { organizationId, role: "FIELD_EXECUTIVE" },
    select: { id: true, name: true },
  });
  if (employees.length === 0) return [];

  const employeeIds = employees.map((employee) => employee.id);
  // This used to issue three aggregate queries for every field executive.
  // The dashboard only needs per-executive totals, so the same values can be
  // derived from fixed, organization-scoped grouped reads instead. This is
  // both tenant-scoped and semantically identical for employees with zero
  // activity (the maps below fall back to zero).
  const [assignedLeads, followUpGroups, visitGroups, brokerageGroups] = await Promise.all([
    prisma.lead.findMany({
      where: { organizationId, assignedToId: { in: employeeIds }, createdAt: { gte: since } },
      select: { assignedToId: true, status: true, lastContactedAt: true, createdAt: true },
    }),
    prisma.followUp.groupBy({
      by: ["ownerId"],
      where: { organizationId, ownerId: { in: employeeIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.visit.groupBy({
      by: ["assignedToId"],
      where: { organizationId, assignedToId: { in: employeeIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.brokerageCalculation.groupBy({
      by: ["employeeId"],
      where: { organizationId, employeeId: { in: employeeIds }, createdAt: { gte: since } },
      _sum: { employeeIncentiveAmount: true },
    }),
  ]);

  const leadsByEmployee = new Map<string, typeof assignedLeads>();
  for (const lead of assignedLeads) {
    if (!lead.assignedToId) continue;
    const current = leadsByEmployee.get(lead.assignedToId) ?? [];
    current.push(lead);
    leadsByEmployee.set(lead.assignedToId, current);
  }
  const followUpsByEmployee = new Map(followUpGroups.map((group) => [group.ownerId, group._count._all]));
  const visitsByEmployee = new Map(visitGroups.flatMap((group) => group.assignedToId ? [[group.assignedToId, group._count._all] as const] : []));
  const brokerageByEmployee = new Map(brokerageGroups.map((group) => [group.employeeId, group._sum.employeeIncentiveAmount ?? 0]));

  const rows = employees.map((employee) => {
      const employeeLeads = leadsByEmployee.get(employee.id) ?? [];
      const contacted = employeeLeads.filter((lead) => lead.lastContactedAt !== null).length;
      const dealsClosed = employeeLeads.filter((lead) => lead.status === "CLOSED_WON").length;
      const responseTimes = employeeLeads
        .filter((l) => l.lastContactedAt)
        .map((l) => (l.lastContactedAt!.getTime() - l.createdAt.getTime()) / 36e5);
      const avgResponseTimeHours = responseTimes.length > 0 ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10 : null;
      const openLeadAges = employeeLeads
        .filter((l) => !["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"].includes(l.status))
        .map((l) => (now.getTime() - l.createdAt.getTime()) / 864e5);
      const avgLeadAgeDays = openLeadAges.length > 0 ? Math.round((openLeadAges.reduce((a, b) => a + b, 0) / openLeadAges.length) * 10) / 10 : 0;

      return {
        id: employee.id,
        name: employee.name,
        assignedLeads: employeeLeads.length,
        contacted,
        followUps: followUpsByEmployee.get(employee.id) ?? 0,
        visits: visitsByEmployee.get(employee.id) ?? 0,
        dealsClosed,
        brokerageGenerated: brokerageByEmployee.get(employee.id) ?? 0,
        avgResponseTimeHours,
        avgLeadAgeDays,
      };
    });

  return rankEmployees(rows);
}
