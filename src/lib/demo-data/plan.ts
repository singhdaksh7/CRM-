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
  /** createDemoDocuments()'s own batch only (lease agreements, Aadhaar, PAN, property papers, Owner KYC) - see propertyMediaBrochures below for the one additional Document row a different creator adds to the same table. */
  documents: 10,
  /**
   * One additional Document row (category PROPERTY_BROCHURE, id
   * "kp-demo-brochure-00001") created by createDemoPropertyMedia()
   * (property-media.ts) - a completely separate creator from
   * createDemoDocuments() above, but both write to the same Document
   * table. Kept as its own named constant (same pattern as
   * visits/workflowVisits above) so any verifier counting ALL Document
   * rows in demo scope - regardless of which creator made them, e.g.
   * previewTeardownCounts()'s relation-based count - has an unambiguous
   * combined target: `documents + propertyMediaBrochures` (11), not just
   * `documents` (10). A verifier that previously compared the combined
   * actual count against `documents` alone reported a false "document
   * count is 11, expected 10" MISMATCH even on a correctly-seeded dataset.
   */
  propertyMediaBrochures: 1,
  catalogues: 10,
  /** Not one of the Phase 2 spec's explicit counts - exists only so Payment Pending / dashboard revenue have real data. */
  deals: 10,
  minLeadPropertyMatches: 25,
  leadPropertyMatchRange: { min: 3, max: 8 },

  // --- Phase 4 workflow demo scenarios (release-readiness closure pass) ---
  /**
   * One feedback record per COMPLETED demo visit with an assignee (see
   * visits.ts's status bucket split, ~35% of `visits` above lands
   * COMPLETED) - the exact count is otherwise an emergent property of the
   * deterministic Rng(DEMO_SEED) stream, not something set directly here.
   * 5 was an analytical estimate (35% of 15 ~= 5.25); the actual
   * deterministic result for this seed/plan is 6 - verified by both the
   * real seed run and src/lib/demo-data/validate.test.ts's fixed-seed
   * assertion, not re-estimated.
   */
  visitFeedback: 6,
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

  // --- Property-portal + commercial business scenarios (MOCK-only; see
  // src/lib/demo-data/portals.ts). These are additive to the residential
  // counts above: `properties` and `leads` describe only what
  // createDemoProperties/createDemoLeads generate, so a fully seeded
  // database holds properties + portalCommercialProperties properties and
  // leads + portalLeads leads. ---
  /** One PropertyPortalConnection per registry provider (Housing, 99acres, MagicBricks, OLX, Square Connect). */
  portalConnections: 5,
  /** One commercial rental + one commercial sale property - properties.ts only generates residential stock. */
  portalCommercialProperties: 2,
  /** One portal-originated lead per provider, spanning both asset classes and both transaction types. */
  portalLeads: 5,
  /** New / matched / ambiguous / duplicate / failed ingestion events. */
  portalExternalLeadEvents: 9,
  /** Published, sync-conflict, and capability-blocked draft listings. */
  portalListings: 3,
  /** Retryable, dead-letter, and capability-blocked operations. */
  portalOperations: 3,

  // --- Demand Pool + Customer Requirements + Two-Way Matching (see
  // src/lib/demo-data/demand-pool.ts). Contact ids kp-demo-dp-contact-1..27,
  // requirement ids kp-demo-dp-req-1..30 (with gaps at indices already used
  // for the converted-lead pairing), recommendation ids kp-demo-dp-rec-1..5,
  // one demo Lead (kp-demo-dp-lead-1) linked back to its converting
  // requirement. ---
  /** 18 baseline + 9 scenario contacts (exact/stretch/no-match/DNC/opt-out/multi-requirement/stale/converted-to-lead/rejected-response). */
  demandPoolContacts: 27,
  /** 18 baseline + 10 scenario requirements (the multi-requirement and converted-to-lead contacts each carry 2). */
  demandPoolRequirements: 28,
  /** SENT (property-already-sent history), PREPARED (unsent), RESPONDED x2 (INTERESTED + NOT_INTERESTED), and one PENDING scored live through the real matching engine. */
  demandPoolRecommendations: 5,
  /** One Lead created via [Create Lead from Requirement], proving the Contact<->Lead linkage never duplicates identity. */
  demandPoolConvertedLeads: 1,
} as const;

export type DemoSeedPlan = typeof DEMO_SEED_PLAN;
