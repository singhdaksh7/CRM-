import { prisma } from "../prisma";
import { buildLeadWhere, buildPropertyWhere } from "../search/filters";
import { parseSearchQuery } from "../search/parser";
import type { Role } from "@prisma/client";

/**
 * Seed-safe, standalone-tsx-safe replacement for verify.ts's old call to
 * the real runGlobalSearch() (src/lib/search/entity-search.ts) for its
 * globalSearch/commandPalette checks.
 *
 * entity-search.ts's NOTIFICATION searcher imports
 * notificationVisibilityWhere from src/lib/notifications.ts, which imports
 * DEFAULT_ORGANIZATION_ID from src/lib/organization.ts - the same
 * `import "server-only"` module that broke the dashboard check (see
 * dashboard-verify.ts) - and that import is unconditional at module scope,
 * so it fires the moment entity-search.ts is imported at all, regardless
 * of which entity type a given query actually needs.
 *
 * This reuses the REAL production query-builders
 * (buildLeadWhere/buildPropertyWhere/parseSearchQuery from src/lib/search/,
 * none of which touch notifications.ts) rather than reimplementing lead/
 * property matching logic - only the small orchestration entity-search.ts's
 * searchLeads()/searchProperties() do is re-created here, for exactly the
 * two entity types verify.ts's fixed demo-verification query set needs.
 *
 * KNOWN, DELIBERATE COVERAGE GAP vs. the old check: NOTIFICATION-entity
 * search results are not counted here - that's the one entity-search.ts
 * branch that can't be reached without importing notifications.ts. None of
 * verify.ts's fixed queries ("Karol Bagh", "DEMO-PROP", "DEMO-LEAD",
 * "DEMO") were ever asserting on notification results specifically (the
 * old check only counted `res.results.length` across every entity type),
 * so this only narrows what's being smoke-tested, not what's asserted on.
 */
const PER_ENTITY_LIMIT = 8;

export async function countDemoSearchResults(
  rawQuery: string,
  ctx: { organizationId: string; role: Role; userId: string }
): Promise<number> {
  const parsed = parseSearchQuery(rawQuery);
  const scopedAssignedToId = ctx.role === "FIELD_EXECUTIVE" ? ctx.userId : undefined;
  const [leadCount, propertyCount] = await Promise.all([
    prisma.lead.count({ where: buildLeadWhere(parsed, ctx.organizationId, scopedAssignedToId) }),
    prisma.property.count({ where: buildPropertyWhere(parsed, ctx.organizationId) }),
  ]);
  return Math.min(leadCount, PER_ENTITY_LIMIT) + Math.min(propertyCount, PER_ENTITY_LIMIT);
}
