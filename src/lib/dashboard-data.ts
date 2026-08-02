import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

export async function getDashboardData(role: Role, userId: string) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const scopedLead = role === "FIELD_EXECUTIVE" ? { assignedToId: userId } : {};
  const scopedVisit = role === "FIELD_EXECUTIVE" ? { assignedToId: userId } : {};
  const scopedFollowUp = role === "FIELD_EXECUTIVE" ? { ownerId: userId } : {};

  const [
    totalActiveProperties,
    propertiesForRent,
    propertiesForSale,
    newLeadsToday,
    unassignedLeads,
    followUpsDueToday,
    visitsToday,
    dealsClosedThisMonth,
    employeeLeadCounts,
    leadsBySource,
    leadsByStatus,
    propertiesByLocation,
    recentActivities,
    monthlyTrend,
  ] = await Promise.all([
    prisma.property.count({ where: { status: { in: ["AVAILABLE", "RESERVED"] } } }),
    prisma.property.count({ where: { listingType: "RENT", status: { in: ["AVAILABLE", "RESERVED"] } } }),
    prisma.property.count({ where: { listingType: "SALE", status: { in: ["AVAILABLE", "RESERVED"] } } }),
    prisma.lead.count({ where: { ...scopedLead, createdAt: { gte: startOfToday, lte: endOfToday } } }),
    prisma.lead.count({ where: { assignedToId: null } }),
    prisma.followUp.count({ where: { ...scopedFollowUp, status: { in: ["PENDING", "OVERDUE"] }, dueDate: { gte: startOfToday, lte: endOfToday } } }),
    prisma.visit.count({ where: { ...scopedVisit, visitDate: { gte: startOfToday, lte: endOfToday } } }),
    prisma.lead.count({ where: { ...scopedLead, status: "CLOSED_WON", updatedAt: { gte: startOfMonth } } }),
    prisma.user.findMany({
      where: { role: "FIELD_EXECUTIVE" },
      select: { id: true, name: true, _count: { select: { assignedLeads: true } } },
    }),
    prisma.lead.groupBy({ by: ["source"], _count: { _all: true }, where: scopedLead }),
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true }, where: scopedLead }),
    prisma.property.groupBy({ by: ["area"], _count: { _all: true } }),
    prisma.activity.findMany({ where: { leadId: { not: null } }, include: { actor: true, lead: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    getMonthlyTrend(scopedLead),
  ]);

  return {
    totalActiveProperties,
    propertiesForRent,
    propertiesForSale,
    newLeadsToday,
    unassignedLeads,
    followUpsDueToday,
    visitsToday,
    dealsClosedThisMonth,
    employeeLeadCounts: employeeLeadCounts.map((e) => ({ name: e.name, count: e._count.assignedLeads })),
    leadsBySource: leadsBySource.map((s) => ({ name: s.source.replace(/_/g, " "), value: s._count._all })),
    leadsByStatus: leadsByStatus.map((s) => ({ name: s.status.replace(/_/g, " "), value: s._count._all })),
    propertiesByLocation: propertiesByLocation.map((p) => ({ name: p.area, value: p._count._all })).sort((a, b) => b.value - a.value).slice(0, 8),
    recentActivities,
    monthlyTrend,
  };
}

async function getMonthlyTrend(scopedLead: Record<string, unknown>) {
  const months: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    months.push({ label: start.toLocaleString("en-IN", { month: "short" }), start, end });
  }

  const results = await Promise.all(
    months.map(async (m) => {
      const [leads, deals] = await Promise.all([
        prisma.lead.count({ where: { ...scopedLead, createdAt: { gte: m.start, lte: m.end } } }),
        prisma.lead.count({ where: { ...scopedLead, status: "CLOSED_WON", updatedAt: { gte: m.start, lte: m.end } } }),
      ]);
      return { month: m.label, leads, deals };
    })
  );
  return results;
}
