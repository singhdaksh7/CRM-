import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { generateCode } from "./utils";
import { recordAudit } from "./audit";
import type { OwnerVerificationStatus } from "@prisma/client";

export async function generateOwnerCode(): Promise<string> {
  const count = await prisma.owner.count();
  return generateCode("OWN", count + 1);
}

export async function recordOwnerActivity(params: {
  ownerId: string;
  type: "OWNER_CREATED" | "OWNER_UPDATED" | "OWNER_VERIFIED" | "OWNER_NOTE_ADDED" | "OWNER_DOCUMENT_ADDED";
  description: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return prisma.activity.create({
    data: {
      crmOwnerId: params.ownerId,
      type: params.type,
      description: params.description,
      actorId: params.actorId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}

export interface OwnerAnalytics {
  totalProperties: number;
  availableProperties: number;
  totalDeals: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  totalBrokerageEarned: number;
}

export async function computeOwnerAnalytics(ownerId: string): Promise<OwnerAnalytics> {
  const [totalProperties, availableProperties, deals] = await Promise.all([
    prisma.property.count({ where: { ownerId } }),
    prisma.property.count({ where: { ownerId, status: "AVAILABLE" } }),
    prisma.deal.findMany({ where: { ownerId }, select: { status: true, brokerageAmount: true } }),
  ]);

  return {
    totalProperties,
    availableProperties,
    totalDeals: deals.length,
    openDeals: deals.filter((d) => d.status === "OPEN").length,
    wonDeals: deals.filter((d) => d.status === "WON").length,
    lostDeals: deals.filter((d) => d.status === "LOST").length,
    totalBrokerageEarned: deals.filter((d) => d.status === "WON").reduce((sum, d) => sum + (d.brokerageAmount ?? 0), 0),
  };
}

export async function verifyOwner(params: {
  ownerId: string;
  status: OwnerVerificationStatus;
  actorId: string;
  organizationId: string;
  notes?: string | null;
}) {
  const organizationId = params.organizationId;
  const owner = await prisma.owner.findFirst({ where: { id: params.ownerId, organizationId } });
  if (!owner) throw new ApiError(404, "Owner not found");

  const updated = await prisma.owner.update({
    where: { id: params.ownerId },
    data: {
      verificationStatus: params.status,
      verifiedAt: params.status === "VERIFIED" ? new Date() : owner.verifiedAt,
      verifiedById: params.status === "VERIFIED" ? params.actorId : owner.verifiedById,
      notes: params.notes !== undefined ? params.notes : owner.notes,
    },
  });

  await recordOwnerActivity({
    ownerId: params.ownerId,
    type: "OWNER_VERIFIED",
    description: `Owner verification status set to ${params.status}`,
    actorId: params.actorId,
  });

  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "Owner",
    entityId: params.ownerId,
    oldValues: { verificationStatus: owner.verificationStatus },
    newValues: { verificationStatus: params.status },
  });

  return updated;
}
