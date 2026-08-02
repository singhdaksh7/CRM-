import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import type { Role } from "@prisma/client";

type SessionLike = { user: { id: string; role: Role } };

/**
 * Single source of truth for "can this session touch this lead". Reused by
 * every Phase 2B WhatsApp/catalogue route so field-executive scoping is
 * enforced identically everywhere, not re-implemented ad hoc per route.
 * Admin and Data Manager can access every lead in the organization; a Field
 * Executive can only access leads assigned to them.
 */
export async function assertLeadAccessible(session: SessionLike, leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new ApiError(404, "Lead not found");
  if (session.user.role === "FIELD_EXECUTIVE" && lead.assignedToId !== session.user.id) {
    throw new ApiError(403, "Forbidden - this lead is not assigned to you");
  }
  return lead;
}
