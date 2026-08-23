import { describe, it, expect, vi } from "vitest";
import type { Property, User } from "@prisma/client";

/**
 * Regression test for seed:demo's self-reported "Demand pool requirement
 * count is 24, expected 28" issue: createDemoDemandPool() genuinely
 * creates 28 CustomerRequirement rows (confirmed against production - the
 * real row count was always 28), but 4 of them (the noMatch/dnc/optOut/
 * stale scenario requirements) had their upsertRequirement() return value
 * discarded instead of collected into the function's own `requirements`
 * return array - a self-reporting bug, not a creation bug. Fixed by
 * capturing and pushing all 10 of the individually-created requirement ids
 * (on top of the 18-item baseline loop), for 28 total.
 */
function upsertMock() {
  return vi.fn().mockImplementation(({ where, create }: { where: { id: string }; create?: Record<string, unknown> }) =>
    Promise.resolve({ id: where.id, ...(create ?? {}) })
  );
}

vi.mock("../prisma", () => ({
  prisma: {
    customerContact: { upsert: upsertMock(), update: vi.fn().mockResolvedValue({}) },
    customerRequirement: { upsert: upsertMock(), update: vi.fn().mockResolvedValue({}) },
    propertyRecommendation: { upsert: upsertMock() },
    lead: { upsert: vi.fn().mockImplementation(({ where, create }) => Promise.resolve({ id: where.id, ...(create ?? {}) })) },
  },
}));

vi.mock("../demand-matching", () => ({
  scoreDemandCandidate: vi.fn().mockReturnValue({ tier: "STRONG", score: 80, reasons: [] }),
  normalizeCustomerRequirement: vi.fn().mockReturnValue({ source: "CONTACT", candidateId: "x", contactable: true }),
  candidateKeyFor: vi.fn().mockReturnValue("candidate-key"),
}));

import { createDemoDemandPool } from "./demand-pool";
import { DEMO_SEED_PLAN } from "./plan";

function makeProperty(overrides: Partial<Property>): Property {
  return {
    id: "kp-demo-prop-00001", assetClass: "RESIDENTIAL", listingType: "RENT", status: "AVAILABLE",
    area: "Karol Bagh", bhk: 2, furnishing: "SEMI_FURNISHED", monthlyRent: 25000, salePrice: null,
    ...overrides,
  } as Property;
}

describe("createDemoDemandPool - requirement count parity", () => {
  it("returns exactly DEMO_SEED_PLAN.demandPoolRequirements (28) requirement ids, matching what is actually created", async () => {
    const properties = [
      makeProperty({ id: "kp-demo-prop-00001", listingType: "RENT", monthlyRent: 25000, salePrice: null }),
      makeProperty({ id: "kp-demo-prop-00002", listingType: "SALE", monthlyRent: null, salePrice: 6000000 }),
    ];
    const admin = { id: "kp-demo-emp-00001" } as User;

    const result = await createDemoDemandPool(properties, admin);

    expect(result.requirements.length).toBe(DEMO_SEED_PLAN.demandPoolRequirements);
    expect(new Set(result.requirements).size).toBe(result.requirements.length); // no duplicate ids
  });

  it("includes the no-match/DNC/opt-out/stale scenario requirements, not just the 18-item baseline + 6-item explicit list", async () => {
    const properties = [
      makeProperty({ id: "kp-demo-prop-00001", listingType: "RENT", monthlyRent: 25000, salePrice: null }),
      makeProperty({ id: "kp-demo-prop-00002", listingType: "SALE", monthlyRent: null, salePrice: 6000000 }),
    ];
    const admin = { id: "kp-demo-emp-00001" } as User;

    const result = await createDemoDemandPool(properties, admin);

    expect(result.requirements).toContain("kp-demo-dp-req-00021"); // noMatch
    expect(result.requirements).toContain("kp-demo-dp-req-00022"); // dnc
    expect(result.requirements).toContain("kp-demo-dp-req-00023"); // optOut
    expect(result.requirements).toContain("kp-demo-dp-req-00026"); // stale
  });
});
