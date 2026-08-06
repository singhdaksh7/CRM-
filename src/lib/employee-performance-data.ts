import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { getOrganizationId } from "./organization";
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

export async function getEmployeePerformance(period: LeaderboardPeriod = "monthly"): Promise<EmployeeKpi[]> {
  const organizationId = getOrganizationId();
  return withTiming("employeePerformance", "/reports/employees", () =>
    cached(`employee-performance:${organizationId}:${period}`, EMPLOYEE_PERFORMANCE_CACHE_TTL_SECONDS, () => computeEmployeePerformance(organizationId, period))
  );
}

async function computeEmployeePerformance(organizationId: string, period: LeaderboardPeriod): Promise<EmployeeKpi[]> {
  const since = periodStart(period);
  const now = new Date();

  const employees = await prisma.user.findMany({
    where: { organizationId, role: "FIELD_EXECUTIVE" },
    select: {
      id: true,
      name: true,
      assignedLeads: {
        where: { createdAt: { gte: since } },
        select: { id: true, status: true, lastContactedAt: true, createdAt: true },
      },
    },
  });

  const rows = await Promise.all(
    employees.map(async (e) => {
      const leadIds = e.assignedLeads.map((l) => l.id);
      const [followUps, visits, brokerage] = await Promise.all([
        prisma.followUp.count({ where: { organizationId, ownerId: e.id, createdAt: { gte: since } } }),
        prisma.visit.count({ where: { organizationId, assignedToId: e.id, createdAt: { gte: since } } }),
        prisma.brokerageCalculation.aggregate({ where: { organizationId, employeeId: e.id, createdAt: { gte: since } }, _sum: { employeeIncentiveAmount: true } }),
      ]);

      const contacted = e.assignedLeads.filter((l) => l.lastContactedAt !== null).length;
      const dealsClosed = e.assignedLeads.filter((l) => l.status === "CLOSED_WON").length;
      const responseTimes = e.assignedLeads
        .filter((l) => l.lastContactedAt)
        .map((l) => (l.lastContactedAt!.getTime() - l.createdAt.getTime()) / 36e5);
      const avgResponseTimeHours = responseTimes.length > 0 ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10 : null;
      const openLeadAges = e.assignedLeads
        .filter((l) => !["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"].includes(l.status))
        .map((l) => (now.getTime() - l.createdAt.getTime()) / 864e5);
      const avgLeadAgeDays = openLeadAges.length > 0 ? Math.round((openLeadAges.reduce((a, b) => a + b, 0) / openLeadAges.length) * 10) / 10 : 0;

      return {
        id: e.id,
        name: e.name,
        assignedLeads: leadIds.length,
        contacted,
        followUps,
        visits,
        dealsClosed,
        brokerageGenerated: brokerage._sum.employeeIncentiveAmount ?? 0,
        avgResponseTimeHours,
        avgLeadAgeDays,
      };
    })
  );

  return rankEmployees(rows);
}
