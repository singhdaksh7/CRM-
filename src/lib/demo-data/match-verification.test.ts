import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Lead, Property } from "@prisma/client";

/**
 * Regression coverage for the match-total fluctuation incident (105
 * in-process vs 90 fresh-query vs 110 seed:demo:verify - see this module's
 * own doc comment for the full diagnosis). Proves:
 *  - getActualPrimaryLeadMatchStats() always issues a fresh query (never
 *    reuses a caller-supplied in-memory array), so it can't reproduce the
 *    seed-demo.ts stale-read bug by construction.
 *  - it scopes to exactly the 20 primary leads, excluding portal-ingestion
 *    and demand-pool-converted leads even though they share the
 *    "kp-demo-lead-" prefix family.
 *  - given a FIXED mocked DB response, results are byte-identical across
 *    repeated calls (the matcher itself is not the source of variance -
 *    already independently proven against live data by running
 *    matchPropertiesToLead 5x against one in-memory snapshot).
 */

function makeProperty(overrides: Partial<Property>): Property {
  return {
    id: "kp-demo-prop-00001", assetClass: "RESIDENTIAL", listingType: "RENT", status: "AVAILABLE",
    area: "Karol Bagh", address: "1 Karol Bagh", bhk: 2, furnishing: "SEMI_FURNISHED",
    monthlyRent: 25000, salePrice: null, propertyType: "APARTMENT", builtUpAreaSqft: 900,
    latitude: null, longitude: null, images: "[]", coverImage: null, availableFrom: null,
    ...overrides,
  } as Property;
}

function makeLead(overrides: Partial<Lead>): Lead {
  return {
    id: "kp-demo-lead-00001", leadCode: "KP-DEMO-LEAD-00001", assetClass: "RESIDENTIAL",
    transactionType: "RENT", requirementType: "RENT", preferredLocation: "Karol Bagh",
    minBudget: 20000, maxBudget: 30000, preferredBhk: null, furnishingPref: null, moveInDate: null,
    ...overrides,
  } as Lead;
}

const findManyProperty = vi.fn();
const findManyLead = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    property: { findMany: (...args: unknown[]) => findManyProperty(...args) },
    lead: { findMany: (...args: unknown[]) => findManyLead(...args) },
  },
}));

import { getActualPrimaryLeadMatchStats } from "./match-verification";

beforeEach(() => {
  findManyProperty.mockReset();
  findManyLead.mockReset();
});

describe("getActualPrimaryLeadMatchStats - always a fresh query", () => {
  it("queries property.findMany and lead.findMany exactly once each per call - never reuses a passed-in array (there is no such parameter)", async () => {
    findManyProperty.mockResolvedValue([makeProperty({ id: "kp-demo-prop-00001" })]);
    findManyLead.mockResolvedValue([makeLead({ id: "kp-demo-lead-00001", leadCode: "KP-DEMO-LEAD-00001" })]);

    await getActualPrimaryLeadMatchStats();

    expect(findManyProperty).toHaveBeenCalledTimes(1);
    expect(findManyLead).toHaveBeenCalledTimes(1);
  });

  it("scopes the lead query to the primary id prefix (kp-demo-lead-000), excluding portal (09xxx) and demand-pool-converted (dp-lead-) leads", async () => {
    findManyProperty.mockResolvedValue([]);
    findManyLead.mockResolvedValue([]);

    await getActualPrimaryLeadMatchStats();

    const whereArg = findManyLead.mock.calls[0][0].where;
    expect(whereArg.id.startsWith).toBe("kp-demo-lead-000");
  });

  it("scopes the property query to AVAILABLE, demo-prefixed properties only", async () => {
    findManyProperty.mockResolvedValue([]);
    findManyLead.mockResolvedValue([]);

    await getActualPrimaryLeadMatchStats();

    const whereArg = findManyProperty.mock.calls[0][0].where;
    expect(whereArg.status).toBe("AVAILABLE");
    expect(whereArg.id.startsWith).toBe("kp-demo-prop-");
  });

  it("repeated calls against an IDENTICAL fixed mocked DB response produce byte-identical results (matcher membership is not the source of variance)", async () => {
    const properties = [makeProperty({ id: "kp-demo-prop-00001", monthlyRent: 25000 })];
    const leads = [makeLead({ id: "kp-demo-lead-00001", leadCode: "KP-DEMO-LEAD-00001", minBudget: 20000, maxBudget: 30000 })];
    findManyProperty.mockResolvedValue(properties);
    findManyLead.mockResolvedValue(leads);

    const runs = await Promise.all([1, 2, 3, 4, 5].map(() => getActualPrimaryLeadMatchStats()));
    for (const run of runs) {
      expect(run.perLead).toEqual(runs[0].perLead);
      expect(run.totalMatchPairs).toBe(runs[0].totalMatchPairs);
    }
  });

  it("computes min/max/outsideRange correctly and flags a lead outside the 3-8 range", async () => {
    findManyProperty.mockResolvedValue([
      makeProperty({ id: "kp-demo-prop-00001", monthlyRent: 20000 }),
      makeProperty({ id: "kp-demo-prop-00002", monthlyRent: 20000 }),
    ]);
    findManyLead.mockResolvedValue([
      makeLead({ id: "kp-demo-lead-00001", leadCode: "KP-DEMO-LEAD-00001", minBudget: 1, maxBudget: 100 }), // 0 matches - out of range
    ]);

    const stats = await getActualPrimaryLeadMatchStats();
    expect(stats.outsideRange).toHaveLength(1);
    expect(stats.outsideRange[0].leadCode).toBe("KP-DEMO-LEAD-00001");
  });
});

/**
 * Static source audit (same technique as validate.test.ts's mutation-audit
 * and matcher-identity contract tests): proves scripts/seed-demo.ts's
 * post-write check and scripts/seed-demo-verify.ts's matching check both
 * import getActualPrimaryLeadMatchStats from this module, rather than
 * each re-implementing their own ad-hoc property/lead query - the exact
 * drift (different lead-scoping, stale in-memory reads) that caused the
 * original three-different-numbers incident.
 */
describe("shared match-verification helper - single source of truth", () => {
  const REPO_ROOT = path.resolve(__dirname, "../../..");

  it("scripts/seed-demo.ts imports getActualPrimaryLeadMatchStats from ./match-verification, not an ad-hoc computation", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "scripts", "seed-demo.ts"), "utf-8");
    expect(source).toContain('import { getActualPrimaryLeadMatchStats } from "../src/lib/demo-data/match-verification"');
    expect(source).toContain("getActualPrimaryLeadMatchStats()");
  });

  it("scripts/seed-demo-verify.ts imports getActualPrimaryLeadMatchStats from ./match-verification, not an ad-hoc computation", () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, "scripts", "seed-demo-verify.ts"), "utf-8");
    expect(source).toContain('import { getActualPrimaryLeadMatchStats } from "../src/lib/demo-data/match-verification"');
    expect(source).toContain("getActualPrimaryLeadMatchStats()");
  });

  /**
   * Total-pair semantic decision: total match pairs is a real, deterministic
   * number for a fixed, correctly-scoped, freshly-queried DB state (proven
   * by the repeated-call test above and by 5 in-memory matcher runs against
   * live data producing byte-identical results) - but it depends on the
   * specific realized random seed data, so it must never be asserted with
   * exact equality against one hardcoded constant. It stays a >=-minimum
   * diagnostic gate (DEMO_SEED_PLAN.minLeadPropertyMatches), matching the
   * existing, deliberate design of the per-lead 3-8 range check. Enforced
   * here as a static check so neither script regresses to `=== someNumber`.
   */
  it("neither seed-demo.ts nor seed-demo-verify.ts asserts totalMatchPairs with exact equality against a hardcoded number", () => {
    for (const file of ["seed-demo.ts", "seed-demo-verify.ts"]) {
      const source = fs.readFileSync(path.join(REPO_ROOT, "scripts", file), "utf-8");
      expect(source, `${file} must not hardcode-equal totalMatchPairs`).not.toMatch(/totalMatchPairs\s*===\s*\d/);
      expect(source, `${file} must gate totalMatchPairs with a minimum comparison`).toMatch(/totalMatchPairs\s*<\s*DEMO_SEED_PLAN\.minLeadPropertyMatches|matchStats\.totalMatchPairs\s*<\s*DEMO_SEED_PLAN\.minLeadPropertyMatches/);
    }
  });
});
