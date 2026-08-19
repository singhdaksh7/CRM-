import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEMO_ID_PREFIX, DEMO_ORGANIZATION_ID } from "./constants";

/**
 * Proves the fix for a production P2003 incident: Property.deleteMany()
 * failed with a foreign key violation on catalogue_share_properties_propertyId_fkey
 * because teardownDemoData() only ever scoped catalogueShareProperty
 * deletion through its parent CatalogueShare (`catalogueShare: startsWith("cat")`)
 * - it never checked the row's own propertyId. A REAL (non-demo-prefixed)
 * catalogue built against a demo property via the live catalogue-builder UI
 * therefore left its catalogue_share_properties row behind, and
 * property.deleteMany() then hit the FK. The fix ORs in a property-scoped
 * branch for catalogueInteraction/catalogueShareProperty/sharedPropertyLog,
 * without ever touching the real parent CatalogueShare/Lead row itself.
 */

const MODEL_NAMES = [
  "dealOffer", "requirementBroadcastRecipient", "requirementBroadcast", "matchRecommendation",
  "catalogueInteraction", "catalogueShareProperty", "catalogueVersionEvent", "catalogueShare",
  "whatsAppMessage", "whatsAppConversation", "sharedPropertyLog",
  "portalOperation", "externalLeadEvent", "portalListing", "propertyPortalConnection",
  "payment", "brokerageCalculation", "deal", "document",
  "visitFeedback", "visitProperty", "visit", "followUp", "leadScoreHistory", "activity", "notification", "savedView",
  "propertyAvailabilityReport", "propertyReport", "propertyFavorite", "propertyViewLog", "propertyImage",
  "lead", "property", "owner", "inventoryPartner", "employeeServiceArea", "leadAssignmentRule", "user",
] as const;

let callOrder: string[] = [];
type MockModel = { deleteMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
let mockPrisma: Record<(typeof MODEL_NAMES)[number], MockModel>;

function buildMockPrisma(counts: Partial<Record<(typeof MODEL_NAMES)[number], number>> = {}) {
  const client = {} as Record<(typeof MODEL_NAMES)[number], MockModel>;
  for (const name of MODEL_NAMES) {
    const n = counts[name] ?? 0;
    client[name] = {
      deleteMany: vi.fn().mockImplementation(async () => {
        callOrder.push(name);
        return { count: n };
      }),
      count: vi.fn().mockResolvedValue(n),
    };
  }
  return client;
}

vi.mock("../prisma", () => ({
  get prisma() {
    return mockPrisma;
  },
}));

import { teardownDemoData, previewTeardownCounts } from "./teardown";

beforeEach(() => {
  callOrder = [];
  mockPrisma = buildMockPrisma();
});

describe("teardownDemoData - catalogue_share_properties before property (P2003 regression)", () => {
  it("deletes catalogueShareProperty strictly before property, in every teardown run", async () => {
    await teardownDemoData();
    const catalogueShareIdx = callOrder.indexOf("catalogueShareProperty");
    const propertyIdx = callOrder.indexOf("property");
    expect(catalogueShareIdx).toBeGreaterThanOrEqual(0);
    expect(propertyIdx).toBeGreaterThanOrEqual(0);
    expect(catalogueShareIdx).toBeLessThan(propertyIdx);
  });

  it("also deletes catalogueInteraction and sharedPropertyLog before property", async () => {
    await teardownDemoData();
    const propertyIdx = callOrder.indexOf("property");
    expect(callOrder.indexOf("catalogueInteraction")).toBeLessThan(propertyIdx);
    expect(callOrder.indexOf("sharedPropertyLog")).toBeLessThan(propertyIdx);
  });

  it("scopes catalogueShareProperty deletion by EITHER a demo catalogue OR a demo property, not catalogue alone - this is the exact fix for the reported FK violation (a real catalogue referencing a demo property)", async () => {
    await teardownDemoData();
    const [{ where }] = mockPrisma.catalogueShareProperty.deleteMany.mock.calls[0];
    expect(where).toEqual({
      OR: [
        { catalogueShare: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}cat-` } } },
        { property: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}prop-` } } },
      ],
    });
  });

  it("scopes catalogueInteraction deletion by EITHER a demo catalogue OR a demo property, org-scoped", async () => {
    await teardownDemoData();
    const [{ where }] = mockPrisma.catalogueInteraction.deleteMany.mock.calls[0];
    expect(where).toEqual({
      organizationId: DEMO_ORGANIZATION_ID,
      OR: [
        { catalogueShare: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}cat-` } } },
        { property: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}prop-` } } },
      ],
    });
  });

  it("scopes sharedPropertyLog deletion by EITHER a demo lead OR a demo property (via the capitalized `Property` relation field), org-scoped", async () => {
    await teardownDemoData();
    const [{ where }] = mockPrisma.sharedPropertyLog.deleteMany.mock.calls[0];
    expect(where).toEqual({
      organizationId: DEMO_ORGANIZATION_ID,
      OR: [
        { lead: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}lead-` } } },
        { Property: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}prop-` } } },
      ],
    });
  });
});

describe("teardownDemoData - succeeds with a demo property present in a demo catalogue", () => {
  it("completes without throwing and reports non-zero counts for the catalogue tree and property", async () => {
    mockPrisma = buildMockPrisma({ catalogueShareProperty: 3, catalogueShare: 1, property: 50 });
    const { deletedCounts } = await teardownDemoData();
    expect(deletedCounts.catalogueShareProperty).toBe(3);
    expect(deletedCounts.property).toBe(50);
  });
});

describe("teardownDemoData - succeeds when Phase 4 child records exist", () => {
  it("deletes every Phase 4 property-linked table before property, and completes without throwing", async () => {
    mockPrisma = buildMockPrisma({
      propertyAvailabilityReport: 2,
      propertyReport: 2,
      propertyFavorite: 4,
      propertyViewLog: 8,
      propertyImage: 2,
      visitFeedback: 5,
      catalogueVersionEvent: 2,
      property: 50,
    });
    const { deletedCounts } = await teardownDemoData();
    const propertyIdx = callOrder.indexOf("property");
    for (const phase4Table of ["propertyAvailabilityReport", "propertyReport", "propertyFavorite", "propertyViewLog", "propertyImage", "visitFeedback", "catalogueVersionEvent"] as const) {
      expect(callOrder.indexOf(phase4Table)).toBeGreaterThanOrEqual(0);
      expect(callOrder.indexOf(phase4Table)).toBeLessThan(propertyIdx);
    }
    expect(deletedCounts.propertyAvailabilityReport).toBe(2);
    expect(deletedCounts.propertyReport).toBe(2);
    expect(deletedCounts.propertyFavorite).toBe(4);
    expect(deletedCounts.propertyViewLog).toBe(8);
  });

  it("deletes propertyAvailabilityReport before propertyImage (photoId FK has no cascade)", async () => {
    await teardownDemoData();
    expect(callOrder.indexOf("propertyAvailabilityReport")).toBeLessThan(callOrder.indexOf("propertyImage"));
  });
});

describe("teardownDemoData - real/non-demo property and catalogue links are untouched", () => {
  it("every deleteMany call is scoped by the demo id prefix and/or organizationId - never an unscoped filter that could match a real row", async () => {
    await teardownDemoData();
    for (const name of MODEL_NAMES) {
      const calls = mockPrisma[name].deleteMany.mock.calls;
      for (const [{ where }] of calls) {
        const serialized = JSON.stringify(where);
        // Every filter must reference either the demo id prefix or organizationId scoping -
        // an empty/unscoped `{}` would match every row of that model, real or demo.
        expect(where).not.toEqual({});
        expect(serialized.includes(DEMO_ID_PREFIX) || serialized.includes(DEMO_ORGANIZATION_ID)).toBe(true);
      }
    }
  });

  it("property.deleteMany is scoped to the demo id prefix only - never touches a real property", async () => {
    await teardownDemoData();
    const [{ where }] = mockPrisma.property.deleteMany.mock.calls[0];
    expect(where).toEqual({ organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}prop-` } });
  });
});

describe("teardownDemoData - idempotent, safe to rerun when nothing exists", () => {
  it("returns all-zero counts and does not throw when every model reports zero", async () => {
    mockPrisma = buildMockPrisma();
    const { deletedCounts } = await teardownDemoData();
    expect(Object.values(deletedCounts).every((c) => c === 0)).toBe(true);
  });

  it("running teardown twice in a row is safe and produces the same shape both times", async () => {
    const first = await teardownDemoData();
    const second = await teardownDemoData();
    expect(Object.keys(first.deletedCounts).sort()).toEqual(Object.keys(second.deletedCounts).sort());
  });
});

describe("previewTeardownCounts - mirrors teardownDemoData's filters exactly (read-only)", () => {
  it("scopes catalogueShareProperty count by the same OR-by-catalogue-or-property filter as the delete path", async () => {
    await previewTeardownCounts(mockPrisma as never);
    const [{ where }] = mockPrisma.catalogueShareProperty.count.mock.calls[0];
    expect(where).toEqual({
      OR: [
        { catalogueShare: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}cat-` } } },
        { property: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}prop-` } } },
      ],
    });
  });

  it("never writes anything - only .count() is called on every model, never .deleteMany()", async () => {
    await previewTeardownCounts(mockPrisma as never);
    for (const name of MODEL_NAMES) {
      expect(mockPrisma[name].deleteMany).not.toHaveBeenCalled();
    }
  });
});

/**
 * Portal teardown: the four portal tables reference Property (required FK),
 * Lead and each other, so they must be removed strictly before the core
 * entities - and, like every other filter here, must be incapable of
 * touching a real (non-demo-prefixed) portal connection or listing.
 */
describe("teardownDemoData - property-portal tree", () => {
  it("deletes every portal table strictly before lead and property", async () => {
    await teardownDemoData();
    const leadIdx = callOrder.indexOf("lead");
    const propertyIdx = callOrder.indexOf("property");
    for (const model of ["portalOperation", "externalLeadEvent", "portalListing", "propertyPortalConnection"]) {
      const idx = callOrder.indexOf(model);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(leadIdx);
      expect(idx).toBeLessThan(propertyIdx);
    }
  });

  it("deletes portal children before the connection they hang off", async () => {
    await teardownDemoData();
    const connectionIdx = callOrder.indexOf("propertyPortalConnection");
    expect(callOrder.indexOf("portalOperation")).toBeLessThan(connectionIdx);
    expect(callOrder.indexOf("externalLeadEvent")).toBeLessThan(connectionIdx);
    expect(callOrder.indexOf("portalListing")).toBeLessThan(connectionIdx);
  });

  it("scopes every portal delete by BOTH the demo id prefix and the organization", async () => {
    await teardownDemoData();
    const expectations: [keyof typeof mockPrisma, string][] = [
      ["portalOperation", "portal-op-"],
      ["externalLeadEvent", "portal-evt-"],
      ["portalListing", "portal-listing-"],
      ["propertyPortalConnection", "portal-conn-"],
    ];
    for (const [model, prefix] of expectations) {
      const [{ where }] = mockPrisma[model].deleteMany.mock.calls[0];
      expect(where).toEqual({ organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}${prefix}` } });
    }
  });

  it("reports portal counts alongside every other model", async () => {
    mockPrisma = buildMockPrisma({ propertyPortalConnection: 5, externalLeadEvent: 9, portalListing: 3, portalOperation: 3 });
    const { deletedCounts } = await teardownDemoData();
    expect(deletedCounts.propertyPortalConnection).toBe(5);
    expect(deletedCounts.externalLeadEvent).toBe(9);
    expect(deletedCounts.portalListing).toBe(3);
    expect(deletedCounts.portalOperation).toBe(3);
  });

  it("previews portal counts with .count() and never .deleteMany()", async () => {
    mockPrisma = buildMockPrisma({ propertyPortalConnection: 5, externalLeadEvent: 9, portalListing: 3, portalOperation: 3 });
    const counts = await previewTeardownCounts(mockPrisma as never);
    expect(counts.propertyPortalConnection).toBe(5);
    expect(counts.externalLeadEvent).toBe(9);
    expect(counts.portalListing).toBe(3);
    expect(counts.portalOperation).toBe(3);
    for (const model of ["portalOperation", "externalLeadEvent", "portalListing", "propertyPortalConnection"] as const) {
      expect(mockPrisma[model].deleteMany).not.toHaveBeenCalled();
    }
  });
});

/**
 * A database that has not yet had the property-business/portal migration
 * applied has no portal tables at all. Prisma raises P2021 there, which
 * previously aborted the whole teardown preview - and with it
 * `seed:demo:verify`, documented as safe to run anywhere, anytime. "Table
 * absent" and "table present but empty" mean the same thing for teardown.
 */
describe("teardownDemoData - pre-migration database (portal tables absent)", () => {
  function missingTableError() {
    return Object.assign(new Error("The table `public.external_lead_events` does not exist"), { code: "P2021" });
  }

  it("still completes and reports 0, rather than aborting the whole teardown", async () => {
    mockPrisma = buildMockPrisma({ property: 50 });
    mockPrisma.externalLeadEvent.deleteMany.mockRejectedValue(missingTableError());
    mockPrisma.portalListing.deleteMany.mockRejectedValue(missingTableError());
    const { deletedCounts } = await teardownDemoData();
    expect(deletedCounts.externalLeadEvent).toBe(0);
    expect(deletedCounts.portalListing).toBe(0);
    expect(deletedCounts.property).toBe(50);
  });

  it("keeps previewTeardownCounts usable, so verify never crashes pre-migration", async () => {
    mockPrisma = buildMockPrisma({ lead: 25 });
    for (const model of ["portalOperation", "externalLeadEvent", "portalListing", "propertyPortalConnection"] as const) {
      mockPrisma[model].count.mockRejectedValue(missingTableError());
    }
    const counts = await previewTeardownCounts(mockPrisma as never);
    expect(counts.propertyPortalConnection).toBe(0);
    expect(counts.lead).toBe(25);
  });

  it("never swallows a non-P2021 failure", async () => {
    mockPrisma = buildMockPrisma();
    mockPrisma.portalOperation.deleteMany.mockRejectedValue(Object.assign(new Error("connection reset"), { code: "P1001" }));
    await expect(teardownDemoData()).rejects.toThrow("connection reset");
  });

  it("never swallows a non-P2021 failure in the read-only preview either", async () => {
    mockPrisma = buildMockPrisma();
    mockPrisma.portalListing.count.mockRejectedValue(Object.assign(new Error("permission denied"), { code: "P2010" }));
    await expect(previewTeardownCounts(mockPrisma as never)).rejects.toThrow("permission denied");
  });
});
