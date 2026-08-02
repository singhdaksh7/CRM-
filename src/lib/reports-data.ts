import { prisma } from "./prisma";
import { cached } from "./cache";
import { withTiming } from "./perf";

const REPORTS_CACHE_TTL_SECONDS = 45;

export async function getReportsData() {
  return withTiming("reportsData", "/reports", () => cached("reports:summary", REPORTS_CACHE_TTL_SECONDS, computeReportsData));
}

async function computeReportsData() {
  const [leadsBySource, leadsByEmployee, totalLeads, closedWon, closedLost, totalVisits, visitsCompleted, propertiesByLocation, propertiesByBudget, rentVsSale] = await Promise.all([
    prisma.lead.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.user.findMany({
      where: { role: { in: ["FIELD_EXECUTIVE", "DATA_MANAGER"] } },
      select: {
        id: true,
        name: true,
        _count: { select: { assignedLeads: true, assignedVisits: true } },
        assignedLeads: { select: { status: true } },
      },
    }),
    // Replaces loading every lead/visit row into memory just to count/filter
    // in JS with DB-level count() aggregates.
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "CLOSED_WON" } }),
    prisma.lead.count({ where: { status: "CLOSED_LOST" } }),
    prisma.visit.count(),
    prisma.visit.count({ where: { status: "COMPLETED" } }),
    prisma.property.groupBy({ by: ["area"], _count: { _all: true } }),
    prisma.property.findMany({ select: { listingType: true, monthlyRent: true, salePrice: true } }),
    prisma.lead.groupBy({ by: ["requirementType"], _count: { _all: true } }),
  ]);

  const conversionRate = totalLeads > 0 ? Math.round((closedWon / totalLeads) * 1000) / 10 : 0;

  const employeePerformance = leadsByEmployee.map((e) => ({
    name: e.name,
    activeLeads: e.assignedLeads.filter((l) => !["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"].includes(l.status)).length,
    closedWon: e.assignedLeads.filter((l) => l.status === "CLOSED_WON").length,
    totalLeads: e._count.assignedLeads,
    totalVisits: e._count.assignedVisits,
  }));

  const budgetBuckets = [
    { label: "< ₹15k / < ₹50L", min: 0, max: 15000, maxSale: 5000000 },
    { label: "₹15k-25k / ₹50L-1Cr", min: 15000, max: 25000, maxSale: 10000000 },
    { label: "₹25k-40k / ₹1-2Cr", min: 25000, max: 40000, maxSale: 20000000 },
    { label: "> ₹40k / > ₹2Cr", min: 40000, max: Infinity, maxSale: Infinity },
  ];
  const propertyDemandByBudget = budgetBuckets.map((b) => ({
    label: b.label,
    count: propertiesByBudget.filter((p) => {
      const price = p.listingType === "RENT" ? p.monthlyRent ?? 0 : p.salePrice ?? 0;
      const min = p.listingType === "RENT" ? b.min : b.min * 250;
      const max = p.listingType === "RENT" ? b.max : b.maxSale;
      return price >= min && price < max;
    }).length,
  }));

  return {
    leadsBySource: leadsBySource.map((s) => ({ name: s.source.replace(/_/g, " "), value: s._count._all })),
    employeePerformance,
    conversionRate,
    closedWon,
    closedLost,
    totalLeads,
    propertiesByLocation: propertiesByLocation.map((p) => ({ name: p.area, value: p._count._all })).sort((a, b) => b.value - a.value),
    propertyDemandByBudget,
    visitsCompleted,
    totalVisits,
    rentVsSale: rentVsSale.map((r) => ({ name: r.requirementType === "RENT" ? "Rent" : "Buy", value: r._count._all })),
  };
}
