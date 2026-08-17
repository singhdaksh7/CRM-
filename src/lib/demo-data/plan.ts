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
  /** Phase 4 - roughly a third of demo properties link to one of these instead of a direct owner. */
  inventoryPartners: 10,
  properties: 50,
  leads: 20,
  visits: 15,
  /**
   * Three extra hand-built multi-property visits appended by
   * createDemoWorkflowVisits on top of the 15 randomized ones above:
   * A (3 properties, upcoming, untouched), B (2 properties, 1 visited at
   * 4 stars, 1 pending), C (completed, 3 properties rated 2/4/5 with the
   * 5-star one marked as the client's preferred property).
   */
  workflowVisits: 3,
  followUps: 20,
  notifications: 40,
  documents: 10,
  catalogues: 10,
  /** Not one of the Phase 2 spec's explicit counts - exists only so Payment Pending / dashboard revenue have real data. */
  deals: 10,
  minLeadPropertyMatches: 25,
  leadPropertyMatchRange: { min: 3, max: 8 },

  // --- Phase 4 workflow demo scenarios (release-readiness closure pass) ---
  /** One feedback record per COMPLETED demo visit - see visits.ts's bucket split (35% of `visits` above). */
  visitFeedback: 5,
  /** One PENDING + one APPROVED PropertyAvailabilityReport, each with a required evidence photo. */
  availabilityReports: 2,
  /** One PENDING + one RESOLVED general PropertyReport. */
  propertyReports: 2,
  /**
   * Data-dependent, not a fixed count: removes up to 2 properties from
   * whichever demo catalogue happens to have the most shareProperties (each
   * catalogue is sized 2-5 via rng.int - see catalogues.ts), so the exact
   * number depends on that draw. Checked with >= in seed-demo-verify.ts,
   * same idiom as minLeadPropertyMatches above, rather than a brittle exact
   * equality on a value this framework doesn't fully control.
   */
  minCatalogueVersionEvents: 1,
  /** 2 field executives x 2 favorited properties each. */
  propertyFavorites: 4,
  /** 2 field executives x (2 favorite-implied views + 2 additional recently-viewed). */
  propertyViewLogs: 8,
  dealOffers: 4,
  requirementBroadcasts: 2,
  requirementBroadcastRecipients: 4,
  matchRecommendations: 4,
  preparedWhatsAppMessages: 1,
  whatsappInboxConversations: 4,
  whatsappInboxMessages: 10,
  inventoryImportFixtureRows: 15,
} as const;

export type DemoSeedPlan = typeof DEMO_SEED_PLAN;
