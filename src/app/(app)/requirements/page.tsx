import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { matchPropertiesToLead } from "@/lib/matching";
import { RequirementBoard } from "@/components/requirements/requirement-board";

export default async function RequirementsPage() {
  const session = await auth(); const organizationId = getOrganizationId(session!.user);
  const [leads, properties, partners] = await Promise.all([
    prisma.lead.findMany({ where: { organizationId, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "INVALID"] } }, include: { assignedTo: { select: { id: true, name: true } }, requirementBroadcasts: { orderBy: { createdAt: "desc" }, take: 1, include: { recipients: { include: { inventoryPartner: { select: { name: true } } } } } }, matchRecommendations: { where: { status: "PENDING" }, select: { id: true } } }, take: 250, orderBy: { createdAt: "asc" } }),
    prisma.property.findMany({ where: { organizationId, status: "AVAILABLE" }, take: 1000 }),
    prisma.inventoryPartner.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true, localities: true }, take: 100 }),
  ]);
  const rows = leads.map(lead => { const matchCount = matchPropertiesToLead(properties, lead).length; return { lead, matchCount, status: matchCount === 0 ? "NO_MATCHES" : matchCount <= 2 ? "LIMITED_MATCHES" : "MATCHES_AVAILABLE" }; });
  const indirectProperties = properties.filter(p => p.inventorySource === "INDIRECT").map(p => ({ id: p.id, propertyCode: p.propertyCode, title: p.title, partnerId: p.partnerId }));
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Requirement Board</h1><p className="text-sm text-[#596579]">Partner messages are sanitized and manually shared.</p></div><RequirementBoard rows={rows} partners={partners} properties={indirectProperties}/></div>;
}
