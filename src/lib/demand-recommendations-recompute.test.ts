import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Feature 1 (daily-ops hardening): recomputeMatchesForProperty is reused
// unchanged as the scoring/upsert engine, but is now also invoked
// automatically from property create/update (see
// src/app/api/properties/route.ts and src/app/api/properties/[id]/route.ts)
// instead of only from the manual POST /api/properties/[id]/matches
// Recalculate button. These tests cover the two behavioral additions made
// directly inside recomputeMatchesForProperty for that automatic path:
//   1. it never overwrites a human-decided PropertyRecommendation (anything
//      past PENDING) on recompute - this already existed and must survive;
//   2. a PENDING row for a candidate that no longer matches after an edit is
//      moved to EXPIRED (never deleted) instead of being left stale forever.
// ---------------------------------------------------------------------------

const propertyFindFirst = vi.fn();
const customerRequirementFindMany = vi.fn();
const leadFindMany = vi.fn();
const propertyRecommendationFindUnique = vi.fn();
const propertyRecommendationCreate = vi.fn();
const propertyRecommendationUpdate = vi.fn();
const propertyRecommendationUpdateMany = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    customerRequirement: { findMany: (...a: unknown[]) => customerRequirementFindMany(...a) },
    lead: { findMany: (...a: unknown[]) => leadFindMany(...a) },
    propertyRecommendation: {
      findUnique: (...a: unknown[]) => propertyRecommendationFindUnique(...a),
      create: (...a: unknown[]) => propertyRecommendationCreate(...a),
      update: (...a: unknown[]) => propertyRecommendationUpdate(...a),
      updateMany: (...a: unknown[]) => propertyRecommendationUpdateMany(...a),
    },
  },
}));

vi.mock("./system-config", () => ({
  getSystemConfig: async () => ({ propertyMatchBudgetStretchPct: 0.2, requirementStaleAfterDays: 90 }),
}));

const scoreDemandCandidate = vi.fn();
vi.mock("./demand-matching", async () => {
  const actual = await vi.importActual<typeof import("./demand-matching")>("./demand-matching");
  return {
    ...actual,
    scoreDemandCandidate: (...a: unknown[]) => scoreDemandCandidate(...a),
  };
});

const { recomputeMatchesForProperty } = await import("./demand-recommendations");

const BASE_PROPERTY = {
  id: "prop1",
  organizationId: "org1",
  listingType: "RENT" as const,
  monthlyRent: 30000,
  salePrice: null,
  assetClass: "RESIDENTIAL" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  propertyFindFirst.mockResolvedValue(BASE_PROPERTY);
  customerRequirementFindMany.mockResolvedValue([]);
  leadFindMany.mockResolvedValue([
    { id: "lead1", organizationId: "org1", status: "NEW", maxBudget: 40000 },
    { id: "lead2", organizationId: "org1", status: "NEW", maxBudget: 40000 },
  ]);
  propertyRecommendationUpdateMany.mockResolvedValue({ count: 0 });
});

describe("recomputeMatchesForProperty - automatic recompute (Feature 1)", () => {
  it("creates a PENDING recommendation for a newly matching lead", async () => {
    scoreDemandCandidate.mockReturnValue({ tier: "STRONG", score: 80, reasons: [] });
    propertyRecommendationFindUnique.mockResolvedValue(null);

    const result = await recomputeMatchesForProperty("prop1", "org1");

    expect(result.created).toBeGreaterThan(0);
    expect(propertyRecommendationCreate).toHaveBeenCalled();
  });

  it("never overwrites status/sentAt/response fields on an already-acted-on recommendation", async () => {
    scoreDemandCandidate.mockReturnValue({ tier: "STRONG", score: 85, reasons: [] });
    propertyRecommendationFindUnique.mockResolvedValue({
      id: "rec1",
      status: "SENT",
      sentAt: new Date("2026-01-01"),
      responseOutcome: "INTERESTED",
    });

    await recomputeMatchesForProperty("prop1", "org1");

    expect(propertyRecommendationUpdate).toHaveBeenCalled();
    const updateCall = propertyRecommendationUpdate.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty("status");
    expect(updateCall.data).not.toHaveProperty("sentAt");
    expect(updateCall.data).not.toHaveProperty("responseOutcome");
  });

  it("marks stale PENDING recommendations EXPIRED when a candidate no longer matches", async () => {
    // Neither lead scores a match this time (e.g. property edited out of budget range).
    scoreDemandCandidate.mockReturnValue(null);

    const result = await recomputeMatchesForProperty("prop1", "org1");

    expect(result.created).toBe(0);
    expect(propertyRecommendationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org1", propertyId: "prop1", status: "PENDING" }),
        data: { status: "EXPIRED" },
      })
    );
  });

  it("returns {created:0, updated:0} without touching other tables when the property doesn't exist", async () => {
    propertyFindFirst.mockResolvedValue(null);
    const result = await recomputeMatchesForProperty("missing", "org1");
    expect(result).toEqual({ created: 0, updated: 0 });
    expect(customerRequirementFindMany).not.toHaveBeenCalled();
    expect(propertyRecommendationUpdateMany).not.toHaveBeenCalled();
  });
});
