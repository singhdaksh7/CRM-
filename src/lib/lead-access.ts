import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getOrganizationId } from "./organization";
import type { Role } from "@prisma/client";

type SessionLike = { user: { id: string; role: Role; organizationId: string } };
type LeadAssignmentLike = { assignedToId: string | null };
type UserLike = { id: string; role: Role };

/**
 * The FIELD_EXECUTIVE lead-access predicate, and ONLY this predicate -
 * every place in the codebase that needs to answer "can this user open this
 * lead" calls this instead of re-deriving the same `assignedToId` comparison
 * (targeted fix pass, Blocker B: the lead detail page and the singular
 * GET /api/leads/[id] route had each grown their OWN slightly-stale copy of
 * this check - `lead.assignedToId !== session.user.id`, missing the
 * unassigned-lead carve-out below - so a FIELD_EXECUTIVE could see an
 * unassigned lead in the /leads list but 404 when opening it. Fixed by
 * deleting both parallel copies and routing them through here).
 *
 * ADMIN and DATA_MANAGER can access every lead in their own organization.
 * A FIELD_EXECUTIVE may access a lead assigned to them, OR an org-wide
 * unassigned lead (assignedToId null) - the "Unassigned Leads" tab needs to
 * open into the same lead workspace/detail view. They may never access a
 * lead assigned to a DIFFERENT employee.
 *
 * Org isolation itself is NOT this function's job - every caller is
 * expected to have already scoped its own lookup by organizationId (as
 * assertLeadAccessible below does, and as every page/route calling this
 * does); this function only ever sees leads the caller already knows are in
 * the right organization.
 */
export function isLeadAccessibleToUser(lead: LeadAssignmentLike, user: UserLike): boolean {
  if (user.role !== "FIELD_EXECUTIVE") return true;
  return lead.assignedToId === null || lead.assignedToId === user.id;
}

/**
 * Prisma `lead:` filter for FIELD_EXECUTIVE list/history routes.
 * Matches isLeadAccessibleToUser: own assigned leads OR unassigned leads.
 * ADMIN/DATA_MANAGER callers should pass `{}` (org-wide) instead.
 */
export function fieldExecutiveLeadReadWhere(userId: string): { OR: Array<{ assignedToId: string | null }> } {
  return { OR: [{ assignedToId: userId }, { assignedToId: null }] };
}

/**
 * Single source of truth for "can this session touch this lead". Reused by
 * every Phase 2B WhatsApp/catalogue route so field-executive scoping is
 * enforced identically everywhere, not re-implemented ad hoc per route.
 * Admin and Data Manager can access every lead in their own organization
 * (never another organization's); a Field Executive can only access leads
 * assigned to them, which is itself always a same-organization check since
 * a User can only ever be assigned leads within their own organization.
 */
export async function assertLeadAccessible(session: SessionLike, leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: getOrganizationId(session.user) } });
  if (!lead) throw new ApiError(404, "Lead not found");
  if (!isLeadAccessibleToUser(lead, session.user)) {
    throw new ApiError(403, "Forbidden - this lead is not assigned to you");
  }
  return lead;
}
