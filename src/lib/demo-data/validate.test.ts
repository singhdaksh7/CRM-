import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildAndValidateProjectedDataset } from "./validate";
import { DEMO_SEED_PLAN } from "./plan";
import { PROPERTY_ISSUE_SCENARIO_INDEX } from "./property-issues";
import { matchPropertiesToLead as matchingModuleExport } from "../matching";

/**
 * Deterministic - buildAndValidateProjectedDataset() is pure (fixed Rng
 * seed, no I/O beyond idempotent SVG placeholder generation), so this
 * dataset is byte-identical on every run/machine. If a future change to
 * any generator (properties.ts/leads.ts/owners.ts/employees.ts) or to the
 * shared plan.ts counts breaks the "every lead matches 3-8 properties"
 * guarantee, this test fails immediately without needing a database.
 */
describe("buildAndValidateProjectedDataset", () => {
  it("generates exactly the planned counts", () => {
    const result = buildAndValidateProjectedDataset();
    expect(result.properties.length).toBe(DEMO_SEED_PLAN.properties);
    expect(result.leads.length).toBe(DEMO_SEED_PLAN.leads);
    expect(result.perLead.length).toBe(DEMO_SEED_PLAN.leads);
  });

  it("has at least the minimum total lead-property match pairs", () => {
    const result = buildAndValidateProjectedDataset();
    expect(result.totalMatchPairs).toBeGreaterThanOrEqual(DEMO_SEED_PLAN.minLeadPropertyMatches);
  });

  it("has every lead within the 3-8 match range", () => {
    const result = buildAndValidateProjectedDataset();
    const { min, max } = DEMO_SEED_PLAN.leadPropertyMatchRange;
    for (const lead of result.perLead) {
      expect(lead.matches, `${lead.leadCode} should have ${min}-${max} matches`).toBeGreaterThanOrEqual(min);
      expect(lead.matches, `${lead.leadCode} should have ${min}-${max} matches`).toBeLessThanOrEqual(max);
    }
    expect(result.outsideRange).toEqual([]);
  });

  it("reports passed=true with no errors when the dataset is valid", () => {
    const result = buildAndValidateProjectedDataset();
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("is deterministic - two runs produce identical match counts", () => {
    const first = buildAndValidateProjectedDataset();
    const second = buildAndValidateProjectedDataset();
    expect(second.perLead).toEqual(first.perLead);
    expect(second.totalMatchPairs).toBe(first.totalMatchPairs);
  });
});

/**
 * Regression coverage for the incident where seed:demo produced 0/20 leads
 * in range despite this exact projection passing: the projection was
 * internally self-consistent (Property.assetClass/Lead.assetClass/
 * Lead.transactionType were all simply absent/undefined on both sides, so
 * matchPropertyToLead's `property.assetClass !== lead.assetClass` gate
 * spuriously passed) while the real DB-persisted rows had Prisma's schema
 * @default() values (RESIDENTIAL/RENT) silently filled in - asymmetrically,
 * since the pure builders never explicitly set these fields. Fixed by
 * having buildPropertyData/buildLeadData set them explicitly. These tests
 * assert the fields are actually present (not undefined) on the objects
 * this projection produces, so this exact "looks fine in-memory, wrong in
 * the database" class of bug cannot silently reappear.
 */
describe("buildAndValidateProjectedDataset - matching-hard-gate field completeness", () => {
  it("every projected property has an explicit assetClass (not left to Prisma's schema default)", () => {
    const result = buildAndValidateProjectedDataset();
    for (const p of result.properties) {
      expect(p.assetClass, `property ${p.id} must have an explicit assetClass`).toBeDefined();
      expect(["RESIDENTIAL", "COMMERCIAL"]).toContain(p.assetClass);
    }
  });

  it("commercial property types get assetClass=COMMERCIAL, everything else RESIDENTIAL", () => {
    const result = buildAndValidateProjectedDataset();
    for (const p of result.properties) {
      const expected = p.propertyType === "COMMERCIAL_SHOP" || p.propertyType === "COMMERCIAL_OFFICE" ? "COMMERCIAL" : "RESIDENTIAL";
      expect(p.assetClass, `property ${p.id} (${p.propertyType})`).toBe(expected);
    }
  });

  it("every projected lead has an explicit assetClass and transactionType (not left to Prisma's schema default)", () => {
    const result = buildAndValidateProjectedDataset();
    for (const l of result.leads) {
      expect(l.assetClass, `lead ${l.id} must have an explicit assetClass`).toBeDefined();
      expect(l.transactionType, `lead ${l.id} must have an explicit transactionType`).toBeDefined();
      expect(l.transactionType).toBe(l.requirementType === "RENT" ? "RENT" : "SALE");
    }
  });
});

describe("buildAndValidateProjectedDataset - post-calibration scenario mutations are modeled", () => {
  it("reflects property-issues.ts's approved-availability-report mutation (status flipped to RENTED) before lead budgets are calibrated", () => {
    const result = buildAndValidateProjectedDataset();
    const mutatedProperty = result.properties[PROPERTY_ISSUE_SCENARIO_INDEX.approvedAvailability - 1];
    expect(mutatedProperty.status).toBe("RENTED");
    // And therefore excluded from the available pool leads were calibrated against.
    expect(result.availableProperties.find((p) => p.id === mutatedProperty.id)).toBeUndefined();
  });
});

/**
 * Static regression guard: fails loudly if a future demo-data module adds
 * a new prisma.property.update()/prisma.lead.update() call touching a
 * matching-relevant field without validate.ts's projection being updated
 * to model it - exactly the class of bug this whole incident was. Not a
 * runtime dry-run check (that would need a live DB); this is a build-time
 * source audit, matching the same technique already proven in
 * scripts/seed-demo.import-safety.test.ts's static import-graph walk.
 */
describe("demo-data modules - post-calibration Property/Lead mutation audit", () => {
  const DEMO_DATA_DIR = path.resolve(__dirname);
  const MATCHING_RELEVANT_FIELDS = ["status", "assetClass", "transactionType", "listingType", "requirementType", "monthlyRent", "salePrice", "minBudget", "maxBudget"];

  function findMutationLines(): { file: string; line: string }[] {
    const hits: { file: string; line: string }[] = [];
    for (const entry of fs.readdirSync(DEMO_DATA_DIR)) {
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
      const file = path.join(DEMO_DATA_DIR, entry);
      const source = fs.readFileSync(file, "utf-8");
      if (!/prisma\.(property|lead)\.(update|updateMany)\s*\(/.test(source)) continue;
      for (const rawLine of source.split("\n")) {
        const line = rawLine.trim();
        if (/prisma\.(property|lead)\.(update|updateMany)\s*\(/.test(line) && MATCHING_RELEVANT_FIELDS.some((f) => line.includes(`${f}:`))) {
          hits.push({ file: entry, line });
        }
      }
    }
    return hits;
  }

  it("the only matching-relevant Property/Lead mutation in the whole demo-data module set is property-issues.ts's known, modeled one", () => {
    const hits = findMutationLines();
    const files = new Set(hits.map((h) => h.file));
    expect([...files]).toEqual(["property-issues.ts"]);
  });

  it("that known mutation is exactly the one buildAndValidateProjectedDataset() applies (status -> RENTED on the approvedAvailability scenario index)", () => {
    const hits = findMutationLines();
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.line.includes('status: "RENTED"'))).toBe(true);
  });
});

describe("buildAndValidateProjectedDataset - uses the real production matcher, not a parallel implementation", () => {
  it("the matching function this projection imports is the same export src/lib/matching.ts provides (identity check, not a behavioral approximation)", async () => {
    const { matchPropertiesToLead: realMatcher } = await import("../matching");
    expect(matchingModuleExport).toBe(realMatcher);
  });
});
