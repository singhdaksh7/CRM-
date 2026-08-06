import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";
import { getOrganizationId } from "./organization";
import { istMonthKey, istMonthLabel } from "./ist-date";

const BROKERAGE_ANALYTICS_CACHE_TTL_SECONDS = 60;

export interface BrokerageAnalyticsData {
  totalRevenue: number;
  pendingBrokerage: number;
  collectedBrokerage: number;
  expectedBrokerage: number;
  monthly: { month: string; collected: number; pending: number }[];
  quarterly: { quarter: string; collected: number; pending: number }[];
  yearly: { year: string; collected: number; pending: number }[];
  byEmployee: { name: string; collected: number }[];
}

/** IST calendar year/quarter derived from the same "YYYY-MM" key istMonthKey() produces, so monthly/quarterly/yearly buckets can never disagree with each other about which IST day a payment falls on. */
function istQuarterAndYear(monthKey: string): { quarter: string; year: string } {
  const [year, month] = monthKey.split("-").map(Number);
  return { quarter: `Q${Math.floor((month - 1) / 3) + 1} ${year}`, year: String(year) };
}

export async function getBrokerageAnalytics(): Promise<BrokerageAnalyticsData> {
  const organizationId = getOrganizationId();
  return withTiming("brokerageAnalytics", "/reports/brokerage", () =>
    cached(`brokerage-analytics:${organizationId}`, BROKERAGE_ANALYTICS_CACHE_TTL_SECONDS, () => computeBrokerageAnalytics(organizationId))
  );
}

async function computeBrokerageAnalytics(organizationId: string): Promise<BrokerageAnalyticsData> {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear() - 2, 0, 1);

  const [paidPayments, pendingAgg, expectedAgg, incentiveByEmployee] = await Promise.all([
    prisma.payment.findMany({
      where: { organizationId, direction: "RECEIVABLE", status: "PAID", paidAt: { gte: rangeStart } },
      select: { amount: true, paidAt: true },
    }),
    prisma.payment.aggregate({ where: { organizationId, direction: "RECEIVABLE", status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } }, _sum: { amount: true } }),
    prisma.deal.aggregate({ where: { organizationId, status: "OPEN" }, _sum: { brokerageAmount: true } }),
    prisma.brokerageCalculation.groupBy({ by: ["employeeId"], where: { organizationId, employeeId: { not: null } }, _sum: { employeeIncentiveAmount: true } }),
  ]);

  const totalCollected = paidPayments.reduce((sum, p) => sum + p.amount, 0);
  const pendingBrokerage = pendingAgg._sum.amount ?? 0;

  const monthlyMap = new Map<string, { collected: number }>();
  const quarterlyMap = new Map<string, { collected: number }>();
  const yearlyMap = new Map<string, { collected: number }>();

  for (const p of paidPayments) {
    if (!p.paidAt) continue;
    const key = istMonthKey(p.paidAt);
    const mKey = istMonthLabel(key);
    monthlyMap.set(mKey, { collected: (monthlyMap.get(mKey)?.collected ?? 0) + p.amount });
    const { quarter: qKey, year: yKey } = istQuarterAndYear(key);
    quarterlyMap.set(qKey, { collected: (quarterlyMap.get(qKey)?.collected ?? 0) + p.amount });
    yearlyMap.set(yKey, { collected: (yearlyMap.get(yKey)?.collected ?? 0) + p.amount });
  }

  const employeeIds = incentiveByEmployee.map((e) => e.employeeId).filter((id): id is string => id !== null);
  const employees = await prisma.user.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } });
  const employeeNames = new Map(employees.map((e) => [e.id, e.name]));

  return {
    totalRevenue: totalCollected + pendingBrokerage,
    pendingBrokerage,
    collectedBrokerage: totalCollected,
    expectedBrokerage: expectedAgg._sum.brokerageAmount ?? 0,
    monthly: Array.from(monthlyMap.entries()).map(([month, v]) => ({ month, collected: v.collected, pending: 0 })),
    quarterly: Array.from(quarterlyMap.entries()).map(([quarter, v]) => ({ quarter, collected: v.collected, pending: 0 })),
    yearly: Array.from(yearlyMap.entries()).map(([year, v]) => ({ year, collected: v.collected, pending: 0 })),
    byEmployee: incentiveByEmployee
      .map((e) => ({ name: e.employeeId ? employeeNames.get(e.employeeId) ?? "Unknown" : "Unknown", collected: e._sum.employeeIncentiveAmount ?? 0 }))
      .sort((a, b) => b.collected - a.collected),
  };
}
