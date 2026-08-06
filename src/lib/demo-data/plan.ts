/**
 * Single source of truth for "how many of each thing should exist" -
 * imported by scripts/seed-demo.ts (to actually create them),
 * scripts/seed-demo-dry-run.ts (to project them without writing), and
 * scripts/seed-demo-verify.ts (to check what's actually there against this
 * target). Keeping one shared object means dry-run/verify can never drift
 * out of sync with what seed-demo.ts actually does.
 */
export const DEMO_SEED_PLAN = {
  employees: 8,
  owners: 20,
  properties: 50,
  leads: 20,
  visits: 15,
  followUps: 20,
  notifications: 40,
  documents: 10,
  catalogues: 10,
  /** Not one of the Phase 2 spec's explicit counts - exists only so Payment Pending / dashboard revenue have real data. */
  deals: 10,
  minLeadPropertyMatches: 25,
  leadPropertyMatchRange: { min: 3, max: 8 },
} as const;

export type DemoSeedPlan = typeof DEMO_SEED_PLAN;
