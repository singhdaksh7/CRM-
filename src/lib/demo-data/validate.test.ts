import { describe, it, expect } from "vitest";
import { buildAndValidateProjectedDataset } from "./validate";
import { DEMO_SEED_PLAN } from "./plan";

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
