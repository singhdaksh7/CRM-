import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getOrganizationId } from "./organization";
import type { Role } from "@prisma/client";

type SessionLike = { user: { id: string; role: Role; organizationId: string } };

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
  // simplified-role-workflow (spec item 12): a field executive may access a
  // lead assigned to them, OR an org-wide unassigned lead (assignedToId is
  // null) - the "Unassigned Leads" tab needs to open into the same lead
  // workspace. They may never access a lead assigned to a different
  // employee; this is the deliberately restrictive default the audit called
  // for, since no broader unassigned-lead exposure policy existed before.
  if (session.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== null && lead.assignedToId !== session.user.id) {
    throw new ApiError(403, "Forbidden - this lead is not assigned to you");
  }
  return lead;
}
