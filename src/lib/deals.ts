import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getOrganizationId } from "./organization";
import { generateCode } from "./utils";
import { recordAudit } from "./audit";
import { terminalStatusFor, validateStageTransition } from "./deal-stage";
import type { DealStage } from "@prisma/client";

export async function generateDealCode(): Promise<string> {
  const count = await prisma.deal.count();
  return generateCode("DEAL", count + 1);
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
}) {
  const organizationId = getOrganizationId(params.actorId);
  const deal = await prisma.deal.findFirst({ where: { id: params.dealId, organizationId } });
  if (!deal) throw new ApiError(404, "Deal not found");
  if (params.actorRole === "FIELD_EXECUTIVE" && deal.assignedToId !== params.actorId) {
    throw new ApiError(403, "Forbidden");
  }
  const check = validateStageTransition({ currentStatus: deal.status, nextStage: params.stage, lostReason: params.lostReason });
  if (!check.allowed) throw new ApiError(deal.status !== "OPEN" ? 409 : 400, check.reason!);

  const terminal = terminalStatusFor(params.stage);
  const updated = await prisma.deal.update({
    where: { id: params.dealId },
    data: {
      stage: params.stage,
      notes: params.notes !== undefined ? params.notes : deal.notes,
      ...(terminal
        ? { status: terminal, closedAt: new Date(), lostReason: terminal === "LOST" ? params.lostReason : null }
        : {}),
    },
  });

  await recordDealActivity({
    dealId: params.dealId,
    type: terminal === "WON" ? "DEAL_WON" : terminal === "LOST" ? "DEAL_LOST" : "DEAL_STAGE_CHANGED",
    description: `Deal ${deal.dealCode} moved from ${deal.stage} to ${params.stage}`,
    actorId: params.actorId,
    metadata: { fromStage: deal.stage, toStage: params.stage },
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
