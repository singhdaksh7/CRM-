/**
 * simplified-role-workflow (continuation pass) - the single shared
 * "Today's Work" service. Both the DATA_MANAGER dashboard and the
 * FIELD_EXECUTIVE dashboard (/executive-dashboard) call this instead of each
 * hand-rolling their own follow-up/visit queries, so the classification and
 * role-scoping rules can only ever be defined in one place.
 *
 * Classification (a FollowUp or Visit lands in exactly one bucket):
 *   - CALL_TODAY            FollowUp type PHONE_CALL, due today, PENDING
 *   - WHATSAPP_TODAY        FollowUp type WHATSAPP, due today, PENDING
 *   - VISIT_EXPECTED_TODAY  FollowUp type VISIT_EXPECTED, due today, PENDING
 *   - GENERAL_FOLLOW_UP_TODAY  every other FollowUpType, due today, PENDING
 *   - VISIT_TODAY           Visit scheduled today, still active (reuses
 *                            src/lib/visit-progress.ts's todaysVisitsWhere /
 *                            visitRoleScopeWhere rather than reimplementing
 *                            the IST-day/active-status logic)
 *   - OVERDUE               FollowUp due before today, status PENDING or
 *                            OVERDUE (both count - the background sweep in
 *                            notifications.ts flips PENDING -> OVERDUE, but a
 *                            follow-up can be read here before that sweep
 *                            has run)
 *
 * Role scoping:
 *   - ADMIN            org-wide, no owner/assignee filter.
 *   - DATA_MANAGER     org-wide operational work (same as ADMIN for these
 *                       tables - FollowUp/Visit have no "founder-only" rows,
 *                       unlike revenue/analytics data DM must not see).
 *   - FIELD_EXECUTIVE  FollowUp.ownerId = self; Visit.assignedToId = self.
 *                       Never another employee's rows.
 *
 * Every query is bounded (`take`) and uses an existing organizationId-led
 * index (see the FollowUp/Visit @@index entries in schema.prisma), so this
 * never becomes an unbounded org-wide scan.
 */

import { prisma } from "./prisma";
import { startOfIstDay, endOfIstDay } from "./ist-date";
import { todaysVisitsWhere, visitRoleScopeWhere, ACTIVE_VISIT_STATUSES } from "./visit-progress";
import type { FollowUpType, Role } from "@prisma/client";

export type TodaysWorkKind = "CALL_TODAY" | "WHATSAPP_TODAY" | "VISIT_EXPECTED_TODAY" | "GENERAL_FOLLOW_UP_TODAY" | "VISIT_TODAY" | "OVERDUE";

export interface TodaysWorkItem {
  kind: TodaysWorkKind;
  id: string; // followUpId or visitId
  leadId: string | null;
  leadName: string;
  leadPhone: string | null;
  ownerId: string | null;
  ownerName: string | null;
  dueAt: Date;
  note: string | null;
  followUpType?: FollowUpType;
  visitTime?: string;
  propertyCount?: number;
  meetingLocation?: string | null;
}

export interface TodaysWorkSummary {
  callToday: number;
  whatsappToday: number;
  visitExpectedToday: number;
  generalToday: number;
  visitsToday: number;
  overdue: number;
  items: TodaysWorkItem[];
}

const ITEM_LIMIT = 100;

const FOLLOWUP_SELECT = {
  id: true,
  type: true,
  dueDate: true,
  notes: true,
  ownerId: true,
  owner: { select: { id: true, name: true } },
  leadId: true,
  lead: { select: { id: true, clientName: true, phone: true } },
} as const;

function followUpKindFor(type: FollowUpType): "CALL_TODAY" | "WHATSAPP_TODAY" | "VISIT_EXPECTED_TODAY" | "GENERAL_FOLLOW_UP_TODAY" {
  if (type === "PHONE_CALL") return "CALL_TODAY";
  if (type === "WHATSAPP") return "WHATSAPP_TODAY";
  if (type === "VISIT_EXPECTED") return "VISIT_EXPECTED_TODAY";
  return "GENERAL_FOLLOW_UP_TODAY";
}

/** DATA_MANAGER is treated as org-wide/unscoped, same as ADMIN, for this operational (non-analytics) data. */
function ownerScope(actor: { id: string; role: Role }): { ownerId: string } | Record<string, never> {
  return actor.role === "FIELD_EXECUTIVE" ? { ownerId: actor.id } : {};
}

export async function getTodaysWork(organizationId: string, actor: { id: string; role: Role }, now: Date = new Date()): Promise<TodaysWorkSummary> {
  const todayStart = startOfIstDay(now);
  const todayEnd = endOfIstDay(now);
  const scope = ownerScope(actor);

  const [dueTodayFollowUps, overdueFollowUps, visitsToday] = await Promise.all([
    prisma.followUp.findMany({
      where: { organizationId, status: "PENDING", dueDate: { gte: todayStart, lte: todayEnd }, ...scope },
      select: FOLLOWUP_SELECT,
      orderBy: { dueDate: "asc" },
      take: ITEM_LIMIT,
    }),
    prisma.followUp.findMany({
      where: { organizationId, status: { in: ["PENDING", "OVERDUE"] }, dueDate: { lt: todayStart }, ...scope },
      select: FOLLOWUP_SELECT,
      orderBy: { dueDate: "asc" },
      take: ITEM_LIMIT,
    }),
    prisma.visit.findMany({
      where: { ...todaysVisitsWhere(organizationId, now), ...visitRoleScopeWhere(organizationId, actor) },
      select: {
        id: true,
        visitDate: true,
        visitTime: true,
        meetingLocation: true,
        assignedToId: true,
        assignedTo: { select: { id: true, name: true } },
        leadId: true,
        lead: { select: { id: true, clientName: true, phone: true } },
        properties: { select: { id: true } },
      },
      orderBy: { visitDate: "asc" },
      take: ITEM_LIMIT,
    }),
  ]);

  const items: TodaysWorkItem[] = [];
  let callToday = 0;
  let whatsappToday = 0;
  let visitExpectedToday = 0;
  let generalToday = 0;

  for (const f of dueTodayFollowUps) {
    const kind = followUpKindFor(f.type);
    if (kind === "CALL_TODAY") callToday++;
    else if (kind === "WHATSAPP_TODAY") whatsappToday++;
    else if (kind === "VISIT_EXPECTED_TODAY") visitExpectedToday++;
    else generalToday++;
    items.push({
      kind,
      id: f.id,
      leadId: f.leadId,
      leadName: f.lead?.clientName ?? "Unknown lead",
      leadPhone: f.lead?.phone ?? null,
      ownerId: f.ownerId,
      ownerName: f.owner?.name ?? null,
      dueAt: f.dueDate,
      note: f.notes,
      followUpType: f.type,
    });
  }

  for (const f of overdueFollowUps) {
    items.push({
      kind: "OVERDUE",
      id: f.id,
      leadId: f.leadId,
      leadName: f.lead?.clientName ?? "Unknown lead",
      leadPhone: f.lead?.phone ?? null,
      ownerId: f.ownerId,
      ownerName: f.owner?.name ?? null,
      dueAt: f.dueDate,
      note: f.notes,
      followUpType: f.type,
    });
  }

  for (const v of visitsToday) {
    items.push({
      kind: "VISIT_TODAY",
      id: v.id,
      leadId: v.leadId,
      leadName: v.lead?.clientName ?? "Unknown lead",
      leadPhone: v.lead?.phone ?? null,
      ownerId: v.assignedToId,
      ownerName: v.assignedTo?.name ?? null,
      dueAt: v.visitDate,
      note: null,
      visitTime: v.visitTime,
      propertyCount: v.properties.length,
      meetingLocation: v.meetingLocation,
    });
  }

  items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  return {
    callToday,
    whatsappToday,
    visitExpectedToday,
    generalToday,
    visitsToday: visitsToday.length,
    overdue: overdueFollowUps.length,
    items,
  };
}

/** Re-exported so callers of this module don't also need to import visit-progress.ts directly. */
export { ACTIVE_VISIT_STATUSES };
