import { describe, it, expect } from "vitest";
import { buildRowCountExpectations } from "./seed-demo-verify";
import { DEMO_SEED_PLAN } from "../src/lib/demo-data/plan";

/**
 * Regression coverage for the "document count is 11, expected 10" false
 * MISMATCH: seed-demo-verify.ts's row-count check compares
 * previewTeardownCounts()'s `document` count (relation-scoped to ANY
 * Document row linked to a demo property/owner/deal, regardless of which
 * creator made it) against a target - documents.ts's own batch
 * (DEMO_SEED_PLAN.documents, 10) never included the one brochure row
 * property-media.ts's createDemoPropertyMedia() also writes to the same
 * table (DEMO_SEED_PLAN.propertyMediaBrochures, 1). Fixed by summing both,
 * the same pattern already used for visit (visits + workflowVisits).
 */
function makeHealthyCounts(): Record<string, number> {
  // Only the fields buildRowCountExpectations actually reads need real
  // values; everything else defaults to 0 (unused by this function).
  return {
    user: DEMO_SEED_PLAN.employees,
    owner: DEMO_SEED_PLAN.owners,
    inventoryPartner: DEMO_SEED_PLAN.inventoryPartners,
    property: DEMO_SEED_PLAN.properties + DEMO_SEED_PLAN.portalCommercialProperties,
    lead: DEMO_SEED_PLAN.leads + DEMO_SEED_PLAN.portalLeads,
    visit: DEMO_SEED_PLAN.visits + DEMO_SEED_PLAN.workflowVisits,
    followUp: DEMO_SEED_PLAN.followUps,
    document: DEMO_SEED_PLAN.documents + DEMO_SEED_PLAN.propertyMediaBrochures,
    catalogueShare: DEMO_SEED_PLAN.catalogues,
    deal: DEMO_SEED_PLAN.deals,
    visitFeedback: DEMO_SEED_PLAN.visitFeedback,
    propertyAvailabilityReport: DEMO_SEED_PLAN.availabilityReports,
    propertyReport: DEMO_SEED_PLAN.propertyReports,
    propertyFavorite: DEMO_SEED_PLAN.propertyFavorites,
    propertyViewLog: DEMO_SEED_PLAN.propertyViewLogs,
    propertyPortalConnection: DEMO_SEED_PLAN.portalConnections,
    externalLeadEvent: DEMO_SEED_PLAN.portalExternalLeadEvents,
    portalListing: DEMO_SEED_PLAN.portalListings,
    portalOperation: DEMO_SEED_PLAN.portalOperations,
  };
}

function documentExpectation(counts: Record<string, number>) {
  return buildRowCountExpectations(counts).find(([label]) => label === "document")!;
}

describe("seed-demo-verify document/brochure count", () => {
  it("plan constants: documents (10 normal docs) + propertyMediaBrochures (1 brochure) sum to the correct total (11)", () => {
    expect(DEMO_SEED_PLAN.documents).toBe(10);
    expect(DEMO_SEED_PLAN.propertyMediaBrochures).toBe(1);
    expect(DEMO_SEED_PLAN.documents + DEMO_SEED_PLAN.propertyMediaBrochures).toBe(11);
  });

  it("10 normal docs + 1 brochure (11 total) is OK - the correctly-seeded state", () => {
    const [, actual, target] = documentExpectation(makeHealthyCounts());
    expect(actual).toBe(target);
    expect(actual).toBe(11);
  });

  it("a missing brochure (10 total, matching only documents.ts's own batch) is flagged as a mismatch", () => {
    const counts = makeHealthyCounts();
    counts.document = 10; // brochure never got created
    const [, actual, target] = documentExpectation(counts);
    expect(actual).not.toBe(target);
    expect(target).toBe(11);
  });

  it("a duplicate brochure (12 total) is flagged as a mismatch, not silently accepted", () => {
    const counts = makeHealthyCounts();
    counts.document = 12;
    const [, actual, target] = documentExpectation(counts);
    expect(actual).not.toBe(target);
  });

  it("the document target is always exactly 11 regardless of unrelated plan fields changing", () => {
    // Sanity: the document expectation must not accidentally depend on any
    // other field in `counts` - only `counts.document` should vary the result.
    const counts = makeHealthyCounts();
    counts.user = 999;
    counts.property = 1;
    const [, , target] = documentExpectation(counts);
    expect(target).toBe(11);
  });
});
