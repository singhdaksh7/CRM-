import { prisma } from "./prisma";
import { matchPropertyToLead } from "./matching";
import { logActivity } from "./activity";
import { createNotification, notifyRoles } from "./notifications";
import type { Lead, Property } from "@prisma/client";

/**
 * Alerts responsible staff that a property matched one or more waiting
 * leads. Reuses the same MATCHES_READY notification type and
 * ADMIN/DATA_MANAGER-broadcast + assignee-targeted pattern
 * runMatchingForLead (lead-matching.ts) already uses for the reverse
 * direction - no new notification architecture, and no automatic
 * catalogue/WhatsApp/customer contact of any kind.
 *
 * Aggregated, not per-lead: one role-broadcast for the whole batch, plus at
 * most one notification per distinct assignee (summarizing however many of
 * THEIR leads matched) - a property matching 40 leads produces a handful of
 * notifications, not 40.
 */
async function notifyNewPropertyMatches(property: Property, matchedLeads: Lead[]) {
  if (matchedLeads.length === 0) return;

  const title = "New property matches";
  const message =
    matchedLeads.length === 1
      ? `${property.propertyCode} matches ${matchedLeads[0].clientName}'s requirement.`
      : `${property.propertyCode} matches ${matchedLeads.length} active requirements.`;

  await notifyRoles(["ADMIN", "DATA_MANAGER"], {
    organizationId: property.organizationId,
    type: "MATCHES_READY",
    title,
    message,
    propertyId: property.id,
  });

  const assigneeIds = Array.from(new Set(matchedLeads.map((l) => l.assignedToId).filter((id): id is string => Boolean(id))));
  await Promise.all(
    assigneeIds.map((userId) => {
      const forAssignee = matchedLeads.filter((l) => l.assignedToId === userId);
      return createNotification({
        organizationId: property.organizationId,
        userId,
        type: "MATCHES_READY",
        title,
        message: forAssignee.length === 1 ? `${property.propertyCode} matches your lead ${forAssignee[0].clientName}.` : `${property.propertyCode} matches ${forAssignee.length} of your leads.`,
        propertyId: property.id,
      });
    })
  );
}

/** Candidate prefilter keeps new-inventory matching bounded before real scoring. */
export async function recommendPropertyToWaitingLeads(propertyId: string, lifecycleKey: string) {
  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
  if (property.status !== "AVAILABLE") return [];
  const price = property.listingType === "RENT" ? property.monthlyRent ?? 0 : property.salePrice ?? 0;
  const leads = await prisma.lead.findMany({
    where: { organizationId: property.organizationId, status: { notIn: ["CLOSED_WON", "CLOSED_LOST", "INVALID"] }, requirementType: property.listingType === "RENT" ? "RENT" : "BUY", preferredLocation: { contains: property.area }, minBudget: { lte: price }, maxBudget: { gte: Math.floor(price / 1.2) } },
    take: 250,
  });

  // Idempotency: a lead already notified for this exact lifecycleKey (e.g. a
  // duplicate recalculation of the same property state) must not be
  // notified again - only a lead newly matched under this lifecycleKey.
  const alreadyRecommended = await prisma.matchRecommendation.findMany({
    where: { organizationId: property.organizationId, propertyId, lifecycleKey, leadId: { in: leads.map((l) => l.id) } },
    select: { leadId: true },
  });
  const alreadyNotifiedLeadIds = new Set(alreadyRecommended.map((r) => r.leadId));

  const created = [];
  const newlyMatchedLeads: Lead[] = [];
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
    if (!alreadyNotifiedLeadIds.has(lead.id)) {
      newlyMatchedLeads.push(lead);
    }
  }

  await notifyNewPropertyMatches(property, newlyMatchedLeads);

  return created;
}
