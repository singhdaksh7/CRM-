import { prisma } from "./prisma";
import { startOfIstDay, endOfIstDay } from "./ist-date";
import { ACTIVE_VISIT_STATUSES } from "./visit-progress";
import { previousCustomerContext, type PreviousCustomerContext } from "./followup-context";
import type { FollowUp, Prisma, Role } from "@prisma/client";

/**
 * simplified-data-manager-workflow - derives the 5 DATA_MANAGER work queues
 * (Today's Leads / Pending Calls / Call Again / Visits-Coming / Completed)
 * purely from EXISTING data (Lead, Activity, FollowUp, Visit). Nothing here
 * is persisted - every tab is a live query, recomputed on every load, so
 * there is no new status/enum to keep in sync with reality.
 *
 * QUEUE PRECEDENCE (a lead has exactly one "work state" among the 4
 * action-queues below - Today's Leads is a separate intake view and may
 * legitimately overlap with any of them):
 *   1. CALL_AGAIN      - an active (PENDING/OVERDUE) PHONE_CALL FollowUp
 *   2. VISITS_COMING   - an active Visit OR an active VISIT_EXPECTED FollowUp
 *   3. PENDING_CALLS   - no PHONE_CALL_MADE Activity has ever been recorded
 *   4. COMPLETED       - everything else that was actually touched today
 *      (a derived, not persisted, "processed today" view - see below)
 *
 * PENDING CALLS is intentionally NOT `status === "NEW"`: a lead can be
 * CONTACTED/QUALIFIED/etc. via other flows (e.g. a WhatsApp-only reply) and
 * still never have had a DM phone call recorded, and conversely a NEW lead
 * that already got a Record Call submission must leave this queue
 * immediately (see src/lib/record-call.ts, which always logs a
 * PHONE_CALL_MADE Activity - success or failure - the first time a call is
 * recorded). Terminal leads (won/lost/not-interested/invalid) never need a
 * pending call.
 */

const LIST_LIMIT = 100;

const LEAD_ROW_SELECT = {
  id: true,
  clientName: true,
  phone: true,
  status: true,
  source: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true } },
  preferredLocation: true,
  minBudget: true,
  maxBudget: true,
  requirementType: true,
  createdAt: true,
} as const;

export interface DmLeadRow {
  id: string;
  clientName: string;
  phone: string;
  status: string;
  source: string;
  assignedToId: string | null;
  assignedToName: string | null;
  preferredLocation: string;
  minBudget: number;
  maxBudget: number;
  requirementType: string;
  createdAt: Date;
}

/**
 * Deliberately the SAME shape src/components/followups/followup-row.tsx
 * already renders (reused verbatim on the Call Again tab, PR #20's
 * previous-customer-context + row-level reschedule included), plus the one
 * extra field (`isOverdue`) this tab's own sort/badge needs.
 */
export type DmCallAgainRow = FollowUp & {
  lead: { id: string; clientName: string; phone: string };
  owner: { id: string; name: string } | null;
  previousContext: PreviousCustomerContext;
  isOverdue: boolean;
};

export interface DmVisitRow {
  kind: "PROPERTY_VISIT" | "OFFICE_COMING";
  id: string;
  leadId: string;
  clientName: string;
  phone: string;
  when: Date;
  visitTime: string | null;
  propertyTitle: string | null;
  assignedFeName: string | null;
  status: string;
}

export interface DmCompletedRow {
  activityId: string;
  leadId: string;
  clientName: string;
  phone: string;
  outcomeLabel: string;
  processedAt: Date;
}

export interface DataManagerQueues {
  todaysLeads: { rows: DmLeadRow[]; count: number };
  pendingCalls: { rows: DmLeadRow[]; count: number };
  callAgain: { rows: DmCallAgainRow[]; count: number };
  visitsComing: { rows: DmVisitRow[]; count: number };
  completed: { rows: DmCompletedRow[]; count: number };
}

type LeadRow = {
  id: string;
  clientName: string;
  phone: string;
  status: string;
  source: string;
  assignedToId: string | null;
  assignedTo: { id: string; name: string } | null;
  preferredLocation: string;
  minBudget: number;
  maxBudget: number;
  requirementType: string;
  createdAt: Date;
};

function toLeadRow(l: LeadRow): DmLeadRow {
  return {
    id: l.id,
    clientName: l.clientName,
    phone: l.phone,
    status: l.status,
    source: l.source,
    assignedToId: l.assignedToId,
    assignedToName: l.assignedTo?.name ?? null,
    preferredLocation: l.preferredLocation,
    minBudget: l.minBudget,
    maxBudget: l.maxBudget,
    requirementType: l.requirementType,
    createdAt: l.createdAt,
  };
}

const TERMINAL_STATUSES: Prisma.EnumLeadStatusFilter["notIn"] = ["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"];

export async function getDataManagerQueues(organizationId: string, _actor: { id: string; role: Role }, now: Date = new Date()): Promise<DataManagerQueues> {
  const todayStart = startOfIstDay(now);
  const todayEnd = endOfIstDay(now);

  const [todaysLeadsRows, todaysLeadsCount, callAgainFollowUps, callAgainCount, activeVisits, visitExpectedFollowUps, completedActivitiesRaw] = await Promise.all([
    prisma.lead.findMany({ where: { organizationId, createdAt: { gte: todayStart, lte: todayEnd } }, select: LEAD_ROW_SELECT, orderBy: { createdAt: "desc" }, take: LIST_LIMIT }),
    prisma.lead.count({ where: { organizationId, createdAt: { gte: todayStart, lte: todayEnd } } }),
    prisma.followUp.findMany({
      where: { organizationId, type: "PHONE_CALL", status: { in: ["PENDING", "OVERDUE"] }, leadId: { not: null } },
      include: {
        lead: {
          select: {
            id: true,
            clientName: true,
            phone: true,
            activities: {
              where: { organizationId, type: { in: ["PHONE_CALL_MADE", "CLIENT_REPLY_RECEIVED", "NOTE_ADDED"] } },
              select: { type: true, description: true, metadata: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
        },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: LIST_LIMIT,
    }),
    prisma.followUp.count({ where: { organizationId, type: "PHONE_CALL", status: { in: ["PENDING", "OVERDUE"] }, leadId: { not: null } } }),
    prisma.visit.findMany({
      where: { organizationId, status: { in: ACTIVE_VISIT_STATUSES } },
      include: { lead: { select: { id: true, clientName: true, phone: true } }, property: { select: { title: true } }, assignedTo: { select: { name: true } } },
      orderBy: { visitDate: "asc" },
      take: LIST_LIMIT,
    }),
    prisma.followUp.findMany({
      where: { organizationId, type: "VISIT_EXPECTED", status: { in: ["PENDING", "OVERDUE"] }, leadId: { not: null } },
      include: { lead: { select: { id: true, clientName: true, phone: true } } },
      orderBy: { dueDate: "asc" },
      take: LIST_LIMIT,
    }),
    prisma.activity.findMany({
      where: { organizationId, type: "PHONE_CALL_MADE", createdAt: { gte: todayStart, lte: todayEnd }, leadId: { not: null } },
      include: { lead: { select: { id: true, clientName: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
  ]);

  const callAgainLeadIds = new Set(callAgainFollowUps.map((f) => f.leadId).filter((id): id is string => !!id));
  const visitsComingLeadIds = new Set<string>([
    ...activeVisits.map((v) => v.leadId),
    ...visitExpectedFollowUps.map((f) => f.leadId).filter((id): id is string => !!id),
  ]);
  // Queue precedence: a lead already in Call Again or Visits/Coming never
  // also sits in Pending Calls or Completed, so nobody is nudged twice.
  const excludeFromPendingAndCompleted = new Set<string>([...callAgainLeadIds, ...visitsComingLeadIds]);
  const pendingCallsWhere: Prisma.LeadWhereInput = {
    organizationId,
    status: { notIn: TERMINAL_STATUSES },
    activities: { none: { type: "PHONE_CALL_MADE" } },
    ...(excludeFromPendingAndCompleted.size > 0 ? { id: { notIn: [...excludeFromPendingAndCompleted] } } : {}),
  };

  const [pendingCallsRows, pendingCallsCount] = await Promise.all([
    prisma.lead.findMany({ where: pendingCallsWhere, select: LEAD_ROW_SELECT, orderBy: { createdAt: "asc" }, take: LIST_LIMIT }), // oldest uncontacted first
    prisma.lead.count({ where: pendingCallsWhere }),
  ]);

  const callAgainRows: DmCallAgainRow[] = callAgainFollowUps
    .filter((f) => f.leadId && f.lead)
    .map((f) => ({
      ...f,
      lead: f.lead!,
      previousContext: previousCustomerContext(f.lead!.activities),
      isOverdue: f.dueDate.getTime() < todayStart.getTime(),
    }))
    // overdue first (oldest overdue first), then due today/upcoming ascending
    .sort((a, b) => (a.isOverdue !== b.isOverdue ? (a.isOverdue ? -1 : 1) : a.dueDate.getTime() - b.dueDate.getTime()));

  const visitRows: DmVisitRow[] = [
    ...activeVisits.map((v) => ({
      kind: "PROPERTY_VISIT" as const,
      id: v.id,
      leadId: v.leadId,
      clientName: v.lead?.clientName ?? "Unknown lead",
      phone: v.lead?.phone ?? "",
      when: v.visitDate,
      visitTime: v.visitTime,
      propertyTitle: v.property?.title ?? null,
      assignedFeName: v.assignedTo?.name ?? null,
      status: v.status,
    })),
    ...visitExpectedFollowUps
      .filter((f) => f.leadId)
      .map((f) => ({
        kind: "OFFICE_COMING" as const,
        id: f.id,
        leadId: f.leadId!,
        clientName: f.lead?.clientName ?? "Unknown lead",
        phone: f.lead?.phone ?? "",
        when: f.dueDate,
        visitTime: null,
        propertyTitle: null,
        assignedFeName: null,
        status: f.status,
      })),
  ].sort((a, b) => a.when.getTime() - b.when.getTime());

  const completedActivities = completedActivitiesRaw.filter((a) => a.leadId && !excludeFromPendingAndCompleted.has(a.leadId));
  const seenCompletedLeads = new Set<string>();
  const completedRows: DmCompletedRow[] = [];
  for (const a of completedActivities) {
    if (!a.leadId || seenCompletedLeads.has(a.leadId)) continue; // one row per lead, most recent activity wins (already sorted desc)
    seenCompletedLeads.add(a.leadId);
    let outcomeLabel = "Call recorded";
    if (a.metadata) {
      try {
        const meta = JSON.parse(a.metadata) as { outcome?: string };
        if (meta.outcome) outcomeLabel = meta.outcome;
      } catch {
        // malformed metadata is never fatal here - fall back to the generic label
      }
    }
    completedRows.push({ activityId: a.id, leadId: a.leadId, clientName: a.lead?.clientName ?? "Unknown lead", phone: a.lead?.phone ?? "", outcomeLabel, processedAt: a.createdAt });
  }

  return {
    todaysLeads: { rows: todaysLeadsRows.map(toLeadRow), count: todaysLeadsCount },
    pendingCalls: { rows: pendingCallsRows.map(toLeadRow), count: pendingCallsCount },
    callAgain: { rows: callAgainRows, count: callAgainCount },
    visitsComing: { rows: visitRows, count: visitRows.length },
    completed: { rows: completedRows, count: completedRows.length },
  };
}
