import { prisma } from "./prisma";

export type AssignmentMethod = "MANUAL_ASSIGN" | "AUTO_ASSIGN" | "BULK_AUTO_ASSIGN" | "TRANSFER";

/**
 * Closes a documented gap (Phase 4): previously only /transfer wrote
 * assignment history (via LeadTransfer, kept exactly as-is). This is
 * written from all four assignment code paths - assign, auto-assign,
 * bulk-auto-assign, and transfer - so every assignment, not just
 * re-assignments, is auditable.
 */
export async function recordAssignment(params: {
  organizationId: string;
  leadId: string;
  toUserId: string;
  method: AssignmentMethod;
  reason?: string | null;
}): Promise<void> {
  await prisma.leadAssignmentHistory.create({
    data: {
      organizationId: params.organizationId,
      leadId: params.leadId,
      toUserId: params.toUserId,
      method: params.method,
      reason: params.reason ?? null,
    },
  });
}

export async function getLeadAssignmentHistory(leadId: string) {
  return prisma.leadAssignmentHistory.findMany({
    where: { leadId },
    orderBy: { createdAt: "asc" },
    include: { toUser: { select: { id: true, name: true } } },
  });
}
