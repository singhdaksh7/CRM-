import type { CatalogueShare, Deal, InventoryPartner, Lead, Property, User } from "@prisma/client";
import { prisma } from "../prisma";
import { DEMO_ORGANIZATION_ID, demoId } from "./constants";

export interface DemoPhase5Set {
  dealOffers: number;
  broadcasts: number;
  broadcastRecipients: number;
  matchRecommendations: number;
  preparedWhatsAppMessages: number;
}

/** Deterministic Phase 5+6 stories. No WhatsAppMessage is created: the
 * recommendation remains an editable UI suggestion until a user acts. */
export async function createDemoPhase5Scenarios(input: {
  deals: Deal[];
  leads: Lead[];
  properties: Property[];
  partners: InventoryPartner[];
  catalogues: CatalogueShare[];
  actor: User;
}): Promise<DemoPhase5Set> {
  const { deals, leads, properties, partners, catalogues, actor } = input;
  const negotiation = deals[0];
  const sides = ["CLIENT", "OWNER", "CLIENT", "INTERNAL"] as const;
  const amounts = [42_000, 47_000, 45_000, 45_000];
  for (let i = 0; i < sides.length; i++) {
    await prisma.dealOffer.create({
      data: {
        id: demoId("offer", i + 1), organizationId: DEMO_ORGANIZATION_ID,
        dealId: negotiation.id, amount: amounts[i], side: sides[i],
        note: i === 3 ? "Terms aligned; agreement draft pending." : "Deterministic negotiation demo",
        createdById: actor.id,
      },
    });
  }

  let recipientCount = 0;
  for (let i = 0; i < 2; i++) {
    const lead = leads[i];
    const broadcastId = demoId("broadcast", i + 1);
    await prisma.requirementBroadcast.create({
      data: {
        id: broadcastId, organizationId: DEMO_ORGANIZATION_ID, leadId: lead.id,
        requirementSnapshot: JSON.stringify({ purpose: lead.requirementType, location: lead.preferredLocation, bhk: lead.preferredBhk, budgetMin: lead.minBudget, budgetMax: lead.maxBudget }),
        messageSnapshot: `Requirement: ${lead.preferredBhk ?? "flexible"} BHK in ${lead.preferredLocation}. Client identity withheld.`,
        status: i === 0 ? "MATCH_FOUND" : "SHARED", createdById: actor.id, sharedAt: new Date(),
      },
    });
    for (let j = 0; j < 2; j++) {
      await prisma.requirementBroadcastRecipient.create({
        data: {
          id: demoId("broadcast-recipient", i * 2 + j + 1), requirementBroadcastId: broadcastId,
          inventoryPartnerId: partners[i * 2 + j].id,
          respondedAt: i === 0 && j === 0 ? new Date() : null,
          responseNote: i === 0 && j === 0 ? "Matching indirect inventory available." : null,
          linkedPropertyId: i === 0 && j === 0 ? properties[0].id : null,
        },
      });
      recipientCount++;
    }
  }

  const statuses = ["PENDING", "PENDING", "IGNORED", "ADDED_TO_CATALOGUE"] as const;
  for (let i = 0; i < statuses.length; i++) {
    await prisma.matchRecommendation.create({
      data: {
        id: demoId("match-rec", i + 1), organizationId: DEMO_ORGANIZATION_ID,
        leadId: leads[i].id, propertyId: properties[i + 4].id,
        score: 92 - i * 4, lifecycleKey: "phase5-demo-v1", status: statuses[i],
        ignoredAt: statuses[i] === "IGNORED" ? new Date() : null,
        handledById: statuses[i] === "PENDING" ? null : actor.id,
      },
    });
  }

  await prisma.activity.create({
    data: {
      leadId: leads[0].id, actorId: actor.id, type: "NOTE_ADDED",
      description: `WhatsApp recommendation prepared for catalogue ${catalogues[0].token}; no message sent automatically.`,
    },
  });

  return { dealOffers: 4, broadcasts: 2, broadcastRecipients: recipientCount, matchRecommendations: 4, preparedWhatsAppMessages: 1 };
}
