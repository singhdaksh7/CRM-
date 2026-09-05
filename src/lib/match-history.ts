/**
 * Feature 2 (daily-ops hardening) - matching history + feedback
 * intelligence. The Lead <-> Property matcher (demand-matching.ts /
 * demand-recommendations.ts) is left untouched; this module only annotates
 * an already-computed PropertyRecommendation list with what the CRM already
 * knows happened between this lead and this property, reusing existing
 * tables:
 *   - CatalogueShareProperty (via CatalogueShare.leadId) -> ALREADY_SHARED
 *   - VisitProperty (via Visit.leadId), status VISITED           -> VISITED
 *   - CataloguePropertyPreference (leadId, propertyId)
 *       status NOT_INTERESTED -> REJECTED
 *       status LIKED          -> LIKED (small positive ranking signal)
 *
 * Precedence when more than one applies to the same lead+property:
 * REJECTED > VISITED > ALREADY_SHARED > LIKED > NEW - a customer who was
 * shared the property, visited it, AND said not interested should read as
 * REJECTED (the strongest, most recent signal), not silently downgrade to
 * ALREADY_SHARED.
 *
 * Deliberately Lead-scoped only: CatalogueShare/Visit/
 * CataloguePropertyPreference all key off Lead.id in the current schema, with
 * no equivalent join for a CONTACT-sourced (CustomerContact) candidate - a
 * CONTACT-sourced recommendation is always labeled NEW. Extending that is a
 * separate, larger schema change and out of scope for this hardening pass.
 *
 * Never deletes or mutates history - this is a read-time annotation only,
 * and never excludes anything from a direct, explicit property/lead search;
 * it only affects what recomputeMatchesForProperty's GET consumer treats as
 * a "fresh recommendation".
 */

import { prisma } from "./prisma";

export type MatchHistoryStatus = "NEW" | "LIKED" | "ALREADY_SHARED" | "VISITED" | "REJECTED";

export interface MatchHistoryLookup {
  alreadySharedLeadIds: Set<string>;
  visitedLeadIds: Set<string>;
  rejectedLeadIds: Set<string>;
  likedLeadIds: Set<string>;
}

/** One batched, indexed query per table - never one query per candidate. */
export async function loadMatchHistory(organizationId: string, propertyId: string, leadIds: string[]): Promise<MatchHistoryLookup> {
  if (leadIds.length === 0) {
    return { alreadySharedLeadIds: new Set(), visitedLeadIds: new Set(), rejectedLeadIds: new Set(), likedLeadIds: new Set() };
  }

  const [sharedRows, visitedRows, preferenceRows] = await Promise.all([
    prisma.catalogueShareProperty.findMany({
      where: { propertyId, removedAt: null, catalogueShare: { organizationId, leadId: { in: leadIds } } },
      select: { catalogueShare: { select: { leadId: true } } },
    }),
    prisma.visitProperty.findMany({
      where: { organizationId, propertyId, status: "VISITED", visit: { leadId: { in: leadIds } } },
      select: { visit: { select: { leadId: true } } },
    }),
    prisma.cataloguePropertyPreference.findMany({
      where: { organizationId, propertyId, leadId: { in: leadIds }, status: { in: ["NOT_INTERESTED", "LIKED"] } },
      select: { leadId: true, status: true },
    }),
  ]);

  const alreadySharedLeadIds = new Set(sharedRows.map((r) => r.catalogueShare.leadId).filter((id): id is string => Boolean(id)));
  const visitedLeadIds = new Set(visitedRows.map((r) => r.visit.leadId).filter((id): id is string => Boolean(id)));
  const rejectedLeadIds = new Set(preferenceRows.filter((r) => r.status === "NOT_INTERESTED").map((r) => r.leadId));
  const likedLeadIds = new Set(preferenceRows.filter((r) => r.status === "LIKED").map((r) => r.leadId));

  return { alreadySharedLeadIds, visitedLeadIds, rejectedLeadIds, likedLeadIds };
}

/** Pure - the actual precedence rule, independently testable without touching Prisma. */
export function matchHistoryStatusFor(leadId: string | null, lookup: MatchHistoryLookup): MatchHistoryStatus {
  if (!leadId) return "NEW"; // CONTACT-sourced candidate - no lead-keyed history table applies.
  if (lookup.rejectedLeadIds.has(leadId)) return "REJECTED";
  if (lookup.visitedLeadIds.has(leadId)) return "VISITED";
  if (lookup.alreadySharedLeadIds.has(leadId)) return "ALREADY_SHARED";
  if (lookup.likedLeadIds.has(leadId)) return "LIKED";
  return "NEW";
}

/** Sort weight so genuinely new inventory surfaces first within an existing tier/score ordering - never changes the stored score/tier itself. */
export function matchHistorySortRank(status: MatchHistoryStatus): number {
  switch (status) {
    case "LIKED":
      return 0;
    case "NEW":
      return 1;
    case "ALREADY_SHARED":
      return 2;
    case "VISITED":
      return 3;
    case "REJECTED":
      return 4;
  }
}
