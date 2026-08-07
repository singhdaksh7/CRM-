import { prisma } from "./prisma";
import { matchPropertyToLead } from "./matching";
import { logActivity } from "./activity";

/** Candidate prefilter keeps new-inventory matching bounded before real scoring. */
export async function recommendPropertyToWaitingLeads(propertyId: string, lifecycleKey: string) {
  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
  if (property.status !== "AVAILABLE") return [];
  const price = property.listingType === "RENT" ? property.monthlyRent ?? 0 : property.salePrice ?? 0;
  const leads = await prisma.lead.findMany({
    where: { organizationId: property.organizationId, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "INVALID"] }, requirementType: property.listingType === "RENT" ? "RENT" : "BUY", preferredLocation: { contains: property.area }, minBudget: { lte: price }, maxBudget: { gte: Math.floor(price / 1.2) } },
    take: 250,
  });
  const created = [];
  for (const lead of leads) {
    const match = matchPropertyToLead(property, lead);
    if (!match) continue;
    const recommendation = await prisma.matchRecommendation.upsert({
      where: { organizationId_leadId_propertyId_lifecycleKey: { organizationId: property.organizationId, leadId: lead.id, propertyId, lifecycleKey } },
      create: { organizationId: property.organizationId, leadId: lead.id, propertyId, score: match.score, lifecycleKey },
      update: {},
    });
    created.push(recommendation);
    await logActivity({ leadId: lead.id, type: "MATCHES_FOUND", description: `New match recommended: ${property.propertyCode} (${match.score}%)`, metadata: { propertyId, recommendationId: recommendation.id, lifecycleKey } });
  }
  return created;
}
