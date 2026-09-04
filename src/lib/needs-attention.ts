/**
 * Feature 5 (daily-ops hardening) - Forgotten-lead protection.
 *
 * The existing lead-health/notification architecture already gives HOT
 * leads smart, deduped notification coverage (see src/lib/notifications.ts).
 * What's missing: an active WARM/COLD lead with zero future follow-up and no
 * scheduled visit can simply fall off daily attention - nothing surfaces it
 * anywhere. This module derives that "Needs Attention" set directly from
 * existing tables (Lead/FollowUp/Visit) - no new task subsystem, no new
 * notification sweep, reusing the same role-scoping conventions as
 * getTodaysWork (src/lib/todays-work.ts) and the FE ownership helper
 * (fieldExecutiveLeadReadWhere, src/lib/lead-access.ts).
 *
 * Definition (deliberately the smallest rule that is still useful):
 * a Lead needs attention when it is
 *   - not terminal (excludes CLOSED_WON, CLOSED_LOST, NOT_INTERESTED, INVALID)
 *   - AND has no FollowUp with status PENDING due in the future
 *   - AND has no Visit scheduled in the future in an active status
 * i.e. nothing forward-looking is on the books for this lead at all.
 * Expressed as two `none` relation filters, so this is one indexed query,
 * never a per-lead loop.
 */

import { prisma } from "./prisma";
import type { Role } from "@prisma/client";
import { fieldExecutiveLeadReadWhere } from "./lead-access";
import { ACTIVE_VISIT_STATUSES } from "./visit-progress";

export const TERMINAL_LEAD_STATUSES = ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] as const;

export interface NeedsAttentionLead {
  id: string;
  leadCode: string;
  clientName: string;
  phone: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  assignedToName: string | null;
  updatedAt: Date;
}

const ITEM_LIMIT = 100;

/** ADMIN/DATA_MANAGER see the whole org's active leads; FIELD_EXECUTIVE sees
 * only their own assigned leads plus unassigned ones - same scope every
 * other lead-list surface in the app already uses (fieldExecutiveLeadReadWhere). */
function leadRoleScope(actor: { id: string; role: Role }) {
  return actor.role === "FIELD_EXECUTIVE" ? fieldExecutiveLeadReadWhere(actor.id) : {};
}

export async function getLeadsNeedingAttention(organizationId: string, actor: { id: string; role: Role }, now: Date = new Date()): Promise<NeedsAttentionLead[]> {
  const leads = await prisma.lead.findMany({
    where: {
      organizationId,
      status: { notIn: TERMINAL_LEAD_STATUSES as unknown as string[] },
      ...leadRoleScope(actor),
      followUps: { none: { status: "PENDING", dueDate: { gte: now } } },
      visits: { none: { visitDate: { gte: now }, status: { in: ACTIVE_VISIT_STATUSES } } },
    } as never,
    select: {
      id: true,
      leadCode: true,
      clientName: true,
      phone: true,
      status: true,
      priority: true,
      assignedToId: true,
      assignedTo: { select: { name: true } },
      updatedAt: true,
    },
    orderBy: [{ priority: "asc" }, { updatedAt: "asc" }],
    take: ITEM_LIMIT,
  });

  return leads.map((l) => ({
    id: l.id,
    leadCode: l.leadCode,
    clientName: l.clientName,
    phone: l.phone,
    status: l.status,
    priority: l.priority,
    assignedToId: l.assignedToId,
    assignedToName: l.assignedTo?.name ?? null,
    updatedAt: l.updatedAt,
  }));
}
