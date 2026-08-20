import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getOrganizationId } from "./organization";
import { generateCode } from "./utils";
import { recordAudit } from "./audit";
import { terminalStatusFor, validateStageTransition } from "./deal-stage";
import type { DealStage, LostDealReasonCategory } from "@prisma/client";

export async function generateDealCode(organizationId?: string): Promise<string> {
  const count = await prisma.deal.count(organizationId ? { where: { organizationId } } : undefined);
  return generateCode("DEAL", count + 1);
}

/**
 * A Deal's leadId/propertyId/ownerId/assignedToId are all client-suppliable
 * (dealSchema accepts them directly, including on `.partial()` updates) -
 * without this check a caller in Org A could link a Deal it owns to Org B's
 * lead/property/owner/employee simply by submitting that id. Throws a 404
 * naming whichever linked id doesn't resolve inside organizationId, so a
 * cross-org id is indistinguishable from a typo'd/missing one.
 */
export async function assertDealLinksBelongToOrg(
  organizationId: string,
  data: { leadId?: string | null; propertyId?: string | null; ownerId?: string | null; assignedToId?: string | null }
): Promise<void> {
  const checks: Promise<void>[] = [];
  if (data.leadId) {
    checks.push(
      prisma.lead.findFirst({ where: { id: data.leadId, organizationId }, select: { id: true } }).then((row) => {
        if (!row) throw new ApiError(404, "Lead not found");
      })
    );
  }
  if (data.propertyId) {
    checks.push(
      prisma.property.findFirst({ where: { id: data.propertyId, organizationId }, select: { id: true } }).then((row) => {
        if (!row) throw new ApiError(404, "Property not found");
      })
    );
  }
  if (data.ownerId) {
    checks.push(
      prisma.owner.findFirst({ where: { id: data.ownerId, organizationId }, select: { id: true } }).then((row) => {
        if (!row) throw new ApiError(404, "Owner not found");
      })
    );
  }
  if (data.assignedToId) {
    checks.push(
      prisma.user.findFirst({ where: { id: data.assignedToId, organizationId }, select: { id: true } }).then((row) => {
        if (!row) throw new ApiError(404, "Assignee not found");
      })
    );
  }
  await Promise.all(checks);
}

export async function recordDealActivity(params: {
  dealId: string;
  type: "DEAL_CREATED" | "DEAL_STAGE_CHANGED" | "DEAL_WON" | "DEAL_LOST" | "PAYMENT_RECORDED" | "PAYMENT_RECEIVED";
  description: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return prisma.activity.create({
    data: {
      dealId: params.dealId,
      type: params.type,
      description: params.description,
      actorId: params.actorId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}

export async function transitionDealStage(params: {
  dealId: string;
  stage: DealStage;
  actorId: string;
  actorRole: "ADMIN" | "DATA_MANAGER" | "FIELD_EXECUTIVE";
  notes?: string | null;
  lostReason?: string | null;
  lostReasonCategory?: LostDealReasonCategory | null;
  agreedAmount?: number;
  closingDate?: string;
  closingNotes?: string;
  expectedBrokerageAmount?: number;
  kpSharePct?: number;
  partnerSharePct?: number;
}) {
  const organizationId = getOrganizationId(params.actorId);
  const deal = await prisma.deal.findFirst({ where: { id: params.dealId, organizationId }, include: { property: { select: { inventorySource: true, listingType: true } } } });
  if (!deal) throw new ApiError(404, "Deal not found");
  if (params.actorRole === "FIELD_EXECUTIVE" && deal.assignedToId !== params.actorId) {
    throw new ApiError(403, "Forbidden");
  }
  if (params.actorRole === "FIELD_EXECUTIVE" && (params.stage === "CLOSED_WON" || params.stage === "CLOSED_LOST")) {
    throw new ApiError(403, "Only an admin or data manager can close a deal");
  }
  const check = validateStageTransition({ currentStatus: deal.status, currentStage: deal.stage, nextStage: params.stage, lostReason: params.lostReason });
  if (!check.allowed) throw new ApiError(deal.status !== "OPEN" ? 409 : 400, check.reason!);

  const terminal = terminalStatusFor(params.stage);
  if (terminal === "WON") {
    if (!params.agreedAmount || !params.closingDate || !params.closingNotes || params.expectedBrokerageAmount === undefined || params.kpSharePct === undefined) {
      throw new ApiError(400, "Final amount, closing date, closure notes, expected brokerage, and KP share are required");
    }
    const indirect = deal.property?.inventorySource === "INDIRECT";
    if (indirect && params.partnerSharePct === undefined) throw new ApiError(400, "Partner share is required for indirect inventory");
    const totalShare = params.kpSharePct + (params.partnerSharePct ?? 0);
    if (Math.abs(totalShare - 100) > 0.001) throw new ApiError(400, "KP and partner shares must total 100%");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.deal.update({
    where: { id: params.dealId },
    data: {
      stage: params.stage,
      notes: params.notes !== undefined ? params.notes : deal.notes,
      ...(terminal
        ? {
            status: terminal,
            closedAt: params.closingDate ? new Date(`${params.closingDate}T12:00:00.000Z`) : new Date(),
            lostReason: terminal === "LOST" ? params.lostReason : null,
            lostReasonCategory: terminal === "LOST" ? params.lostReasonCategory ?? null : null,
          }
        : {}),
      ...(terminal === "WON" ? { agreedAmount: params.agreedAmount, closingNotes: params.closingNotes, expectedBrokerageAmount: params.expectedBrokerageAmount, kpSharePct: params.kpSharePct, partnerSharePct: params.partnerSharePct ?? 0 } : {}),
    },
    });
    if (terminal === "WON" && deal.leadId) await tx.lead.update({ where: { id: deal.leadId }, data: { status: "CLOSED_WON" } });
    if (terminal === "WON" && deal.propertyId && deal.property) await tx.property.update({ where: { id: deal.propertyId }, data: { status: deal.property.listingType === "RENT" ? "RENTED" : "SOLD" } });
    return next;
  });

  await recordDealActivity({
    dealId: params.dealId,
    type: terminal === "WON" ? "DEAL_WON" : terminal === "LOST" ? "DEAL_LOST" : "DEAL_STAGE_CHANGED",
    description: `Deal ${deal.dealCode} moved from ${deal.stage} to ${params.stage}`,
    actorId: params.actorId,
    metadata: { fromStage: deal.stage, toStage: params.stage, ...(terminal === "WON" ? { agreedAmount: params.agreedAmount, closingDate: params.closingDate } : {}) },
  });

  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "Deal",
    entityId: params.dealId,
    oldValues: { stage: deal.stage, status: deal.status },
    newValues: { stage: updated.stage, status: updated.status },
  });

  return updated;
}
