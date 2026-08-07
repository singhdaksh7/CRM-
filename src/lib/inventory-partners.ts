import { prisma } from "./prisma";
import { generateCode } from "./utils";
import type { ActivityType } from "@prisma/client";

export async function generateInventoryPartnerCode(): Promise<string> {
  const count = await prisma.inventoryPartner.count();
  return generateCode("PTR", count + 1);
}

export async function recordInventoryPartnerActivity(params: {
  inventoryPartnerId: string;
  type: Extract<ActivityType, "INVENTORY_PARTNER_CREATED" | "INVENTORY_PARTNER_UPDATED">;
  description: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return prisma.activity.create({
    data: {
      inventoryPartnerId: params.inventoryPartnerId,
      type: params.type,
      description: params.description,
      actorId: params.actorId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}

/**
 * "Number of Active Properties" is explicitly a derived count per the
 * product requirement - never a stored column. Bounded groupBy, never one
 * count() per partner, so a partner list page never becomes N+1.
 */
export async function getActivePropertyCountsByPartner(partnerIds: string[]): Promise<Map<string, number>> {
  if (partnerIds.length === 0) return new Map();
  const groups = await prisma.property.groupBy({
    by: ["partnerId"],
    where: { partnerId: { in: partnerIds }, status: "AVAILABLE" },
    _count: true,
  });
  return new Map(groups.filter((g) => g.partnerId).map((g) => [g.partnerId as string, g._count]));
}

export async function getActivePropertyCount(partnerId: string): Promise<number> {
  return prisma.property.count({ where: { partnerId, status: "AVAILABLE" } });
}
