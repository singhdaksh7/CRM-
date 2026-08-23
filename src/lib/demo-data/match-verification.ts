import { prisma } from "../prisma";
import { matchPropertiesToLead } from "../matching";
import { DEMO_ORGANIZATION_ID, DEMO_ID_PREFIX } from "./constants";
import { DEMO_SEED_PLAN } from "./plan";

/**
 * Single source of truth for "what are the ACTUAL, currently-persisted
 * lead-property match counts for the 20 primary demo leads" - always a
 * fresh read against the live database, never a reused in-memory array.
 *
 * Fixes two real bugs found while diagnosing a match-total fluctuation
 * incident (105 in-process vs 90 fresh-query vs 110 seed:demo:verify, all
 * for what was assumed to be "the same 20 leads"):
 *
 *  1. scripts/seed-demo.ts's own post-write "actual" recomputation reused
 *     the in-memory `properties.all` array returned by createDemoProperties()
 *     earlier in the run. src/lib/demo-data/property-issues.ts's
 *     "approved availability report" scenario later flips one property's
 *     `status` to RENTED via `prisma.property.update()` - a real DB write -
 *     but never reassigns the result back into that in-memory array, so
 *     the array's copy of that property object silently keeps its
 *     stale/original status forever. seed-demo.ts's recomputation therefore
 *     counted that one property as still AVAILABLE, over-counting matches
 *     for every lead it happened to satisfy. A fresh query correctly sees
 *     the real, mutated state.
 *  2. scripts/seed-demo-verify.ts's matching section queried leads by
 *     `id: { startsWith: "kp-demo-lead-" }`, which also matches the 5
 *     portal-ingestion demo leads (ids like "kp-demo-lead-09001") on top
 *     of the 20 primary ones (ids "kp-demo-lead-00001".."00020") - so its
 *     total silently included 25 leads, not 20, comparing apples to a
 *     mixed fruit bowl against the other two reports.
 *
 * Neither of the observed numeric differences was matcher nondeterminism -
 * matchPropertiesToLead() is a pure function with no Date.now()/Math.random()
 * in its membership logic, confirmed by running it 5x against one fixed
 * in-memory snapshot with byte-identical results every time. Both were
 * ordinary bugs: one stale-read, one over-broad query scope.
 */

const PRIMARY_LEAD_ID_PREFIX = `${DEMO_ID_PREFIX}lead-000`; // "kp-demo-lead-000" - matches only 00001-00999, i.e. exactly the primary 1..DEMO_SEED_PLAN.leads range, never the portal (09xxx) or demand-pool-converted (dp-lead-...) leads.

export interface PrimaryLeadMatchCount {
  leadCode: string;
  matches: number;
}

export interface ActualMatchStats {
  availablePropertyCount: number;
  perLead: PrimaryLeadMatchCount[];
  totalMatchPairs: number;
  min: number;
  max: number;
  outsideRange: PrimaryLeadMatchCount[];
}

/**
 * Fresh, read-only query against the live database - never reuses an
 * in-memory array from earlier in a seed run. Scoped to exactly the
 * primary demo leads (see PRIMARY_LEAD_ID_PREFIX above), matching what the
 * 3-8-matches-per-lead business guarantee actually applies to.
 */
export async function getActualPrimaryLeadMatchStats(): Promise<ActualMatchStats> {
  const [availableProperties, primaryLeads] = await Promise.all([
    prisma.property.findMany({
      where: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}prop-` }, status: "AVAILABLE" },
      include: { owner: true },
    }),
    prisma.lead.findMany({
      where: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: PRIMARY_LEAD_ID_PREFIX } },
      orderBy: { id: "asc" },
    }),
  ]);

  const perLead: PrimaryLeadMatchCount[] = primaryLeads.map((lead) => ({
    leadCode: lead.leadCode,
    matches: matchPropertiesToLead(availableProperties, lead, 0.2).length,
  }));
  const totalMatchPairs = perLead.reduce((sum, l) => sum + l.matches, 0);
  const { min, max } = DEMO_SEED_PLAN.leadPropertyMatchRange;
  const outsideRange = perLead.filter((l) => l.matches < min || l.matches > max);

  return {
    availablePropertyCount: availableProperties.length,
    perLead,
    totalMatchPairs,
    min: perLead.length > 0 ? Math.min(...perLead.map((l) => l.matches)) : 0,
    max: perLead.length > 0 ? Math.max(...perLead.map((l) => l.matches)) : 0,
    outsideRange,
  };
}
