import { prisma } from "./prisma";
import { getTodaysWork, type TodaysWorkSummary } from "./todays-work";
import type { Role } from "@prisma/client";
import { getLeadsAwaitingShortlist, type LeadsAwaitingShortlistResult } from "./dashboard-data";

const NEW_LEADS_LIMIT = 20;

export interface NewLeadRow {
  id: string;
  clientName: string;
  phone: string;
  status: string;
  source: string;
  assignedToId: string | null;
  createdAt: Date;
}

export interface DataManagerDashboardData {
  todaysWork: TodaysWorkSummary;
  newLeads: NewLeadRow[];
  newLeadsCount: number;
  awaitingShortlist: LeadsAwaitingShortlistResult;
}

/**
 * simplified-role-workflow (continuation pass, spec item 1/14) - the
 * DATA_MANAGER operational dashboard's data. "New/Unprocessed" reuses the
 * existing Lead lifecycle rather than inventing a new one: status NEW, OR
 * still unassigned (assignedToId null) regardless of status - both are
 * genuinely "needs someone to pick this up" from a DM's point of view.
 * Org-wide (a DM is authorized to see/manage every lead in the org, per
 * src/app/api/leads/route.ts having no DATA_MANAGER scoping restriction).
 */
export async function getDataManagerDashboardData(organizationId: string, actor: { id: string; role: Role }): Promise<DataManagerDashboardData> {
  const [todaysWork, newLeads, newLeadsCount, awaitingShortlist] = await Promise.all([
    getTodaysWork(organizationId, actor),
    prisma.lead.findMany({
      where: { organizationId, OR: [{ status: "NEW" }, { assignedToId: null }] },
      select: { id: true, clientName: true, phone: true, status: true, source: true, assignedToId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: NEW_LEADS_LIMIT,
    }),
    prisma.lead.count({ where: { organizationId, OR: [{ status: "NEW" }, { assignedToId: null }] } }),
    getLeadsAwaitingShortlist(organizationId),
  ]);

  return { todaysWork, newLeads, newLeadsCount, awaitingShortlist };
}
