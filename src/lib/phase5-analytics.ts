import { prisma } from "./prisma";
import { cached } from "./cache";
import { matchPropertiesToLead } from "./matching";

const ACTIVE_LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED", "VISIT_COMPLETED", "NEGOTIATION"] as const;

export async function getPhase5Analytics(organizationId: string) {
  return cached(`phase5:analytics:${organizationId}`, 45, () => compute(organizationId));
}

async function compute(organizationId: string) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const staleCutoff = new Date(Date.now() - 7 * 86400000);
  const [localities, bhk, transaction, leads, properties, firstMatches, activeNegotiations, agreementPending, staleNegotiations, won, lost, closedDeals, pipeline, sourceSplit] = await Promise.all([
    prisma.lead.groupBy({ by: ["preferredLocation"], where: { organizationId, status: { in: [...ACTIVE_LEAD_STATUSES] } }, _count: { _all: true }, orderBy: { _count: { preferredLocation: "desc" } }, take: 20 }),
    prisma.lead.groupBy({ by: ["preferredBhk"], where: { organizationId, status: { in: [...ACTIVE_LEAD_STATUSES] } }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["requirementType"], where: { organizationId, status: { in: [...ACTIVE_LEAD_STATUSES] } }, _count: { _all: true } }),
    prisma.lead.findMany({ where: { organizationId, status: { in: [...ACTIVE_LEAD_STATUSES] } }, take: 500 }),
    prisma.property.findMany({ where: { organizationId, status: "AVAILABLE" }, take: 1500 }),
    prisma.matchRecommendation.findMany({ where: { organizationId }, select: { leadId: true, createdAt: true, lead: { select: { createdAt: true } } }, orderBy: { createdAt: "asc" }, take: 1000 }),
    prisma.deal.count({ where: { organizationId, status: "OPEN", stage: "NEGOTIATION" } }),
    prisma.deal.count({ where: { organizationId, status: "OPEN", stage: "AGREEMENT" } }),
    prisma.deal.count({ where: { organizationId, status: "OPEN", stage: "NEGOTIATION", updatedAt: { lt: staleCutoff } } }),
    prisma.deal.count({ where: { organizationId, status: "WON", closedAt: { gte: monthStart } } }),
    prisma.deal.count({ where: { organizationId, status: "LOST", closedAt: { gte: monthStart } } }),
    prisma.deal.findMany({ where: { organizationId, closedAt: { not: null } }, select: { createdAt: true, closedAt: true }, take: 1000 }),
    prisma.deal.aggregate({ where: { organizationId, status: "OPEN" }, _sum: { expectedBrokerageAmount: true } }),
    prisma.deal.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
  ]);
  const matchCounts = new Map(leads.map(l => [l.id, matchPropertiesToLead(properties, l).length]));
  const zeroInventory = [...matchCounts.values()].filter(v => v === 0).length;
  const firstByLead = new Map<string, (typeof firstMatches)[number]>(); for (const row of firstMatches) if (!firstByLead.has(row.leadId)) firstByLead.set(row.leadId, row);
  const avgFirstMatchDays = firstByLead.size ? [...firstByLead.values()].reduce((sum, r) => sum + (r.createdAt.getTime() - r.lead.createdAt.getTime()) / 86400000, 0) / firstByLead.size : 0;
  const supplyByArea = new Map<string, number>(); for (const p of properties) supplyByArea.set(p.area, (supplyByArea.get(p.area) ?? 0) + 1);
  const demandSupplyGap = localities.map(l => ({ locality: l.preferredLocation, demand: l._count._all, supply: supplyByArea.get(l.preferredLocation) ?? 0, level: l._count._all > (supplyByArea.get(l.preferredLocation) ?? 0) * 2 ? "HIGH" : "NORMAL" }));
  const budgetBands = [{ name: "Under ₹25k", min: 0, max: 25000 }, { name: "₹25k–₹50k", min: 25000, max: 50000 }, { name: "Above ₹50k", min: 50000, max: Infinity }].map(b => ({ name: b.name, value: leads.filter(l => l.requirementType === "RENT" && l.maxBudget >= b.min && l.maxBudget < b.max).length }));
  const closed = won + lost; const avgNegotiationDays = closedDeals.length ? closedDeals.reduce((sum, d) => sum + ((d.closedAt!.getTime() - d.createdAt.getTime()) / 86400000), 0) / closedDeals.length : 0;
  const directCount = await prisma.deal.count({ where: { organizationId, property: { inventorySource: "DIRECT" } } }); const indirectCount = await prisma.deal.count({ where: { organizationId, property: { inventorySource: "INDIRECT" } } });
  return { demand: { byLocality: localities.map(l => ({ name: l.preferredLocation, value: l._count._all })), byBhk: bhk.map(b => ({ name: b.preferredBhk ? `${b.preferredBhk} BHK` : "Any", value: b._count._all })), byBudget: budgetBands, rentVsSale: transaction.map(t => ({ name: t.requirementType, value: t._count._all })), zeroInventory, avgFirstMatchDays: Math.round(avgFirstMatchDays * 10) / 10, demandSupplyGap }, negotiation: { activeNegotiations, agreementPending, staleNegotiations, won, lost, winLossRatio: closed ? Math.round((won / closed) * 1000) / 10 : 0, avgNegotiationDays: Math.round(avgNegotiationDays * 10) / 10, expectedBrokeragePipeline: pipeline._sum.expectedBrokerageAmount ?? 0, directCount, indirectCount, statusCounts: sourceSplit } };
}
