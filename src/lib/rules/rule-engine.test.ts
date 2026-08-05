import { describe, it, expect } from "vitest";
import { buildHealthScore, clampScore, daysBetween, healthLabelForScore, makeRule, sortRulesBySeverity } from "./rule-engine";

describe("clampScore", () => {
  it("clamps below zero to 0", () => {
    expect(clampScore(-25)).toBe(0);
  });
  it("clamps above 100 to 100", () => {
    expect(clampScore(140)).toBe(100);
  });
  it("rounds fractional scores", () => {
    expect(clampScore(55.6)).toBe(56);
  });
});

describe("healthLabelForScore", () => {
  it.each([
    [95, "Excellent"],
    [85, "Excellent"],
    [70, "Healthy"],
    [65, "Healthy"],
    [50, "Needs Attention"],
    [45, "Needs Attention"],
    [30, "At Risk"],
    [25, "At Risk"],
    [10, "Critical"],
    [0, "Critical"],
  ])("scores %i as %s", (score, label) => {
    expect(healthLabelForScore(score)).toBe(label);
  });
});

describe("buildHealthScore", () => {
  it("starts from the base and applies factor deltas", () => {
    const result = buildHealthScore([{ label: "a", delta: 10, detail: "d1" }, { label: "b", delta: -5, detail: "d2" }], 50);
    expect(result.score).toBe(55);
  });

  it("buckets positive factors as positives and negative as warnings", () => {
    const result = buildHealthScore([{ label: "a", delta: 10, detail: "good" }, { label: "b", delta: -5, detail: "bad" }], 50);
    expect(result.positives).toEqual([{ label: "a", detail: "good" }]);
    expect(result.warnings).toEqual([{ label: "b", detail: "bad" }]);
  });

  it("recommends the most negative warning's detail", () => {
    const result = buildHealthScore(
      [{ label: "minor", delta: -2, detail: "minor issue" }, { label: "major", delta: -20, detail: "major issue" }],
      50
    );
    expect(result.recommendedAction).toBe("major issue");
  });

  it("falls back to the provided default when there are no warnings", () => {
    const result = buildHealthScore([{ label: "a", delta: 10, detail: "good" }], 50, "all clear");
    expect(result.recommendedAction).toBe("all clear");
  });

  it("clamps the final score into 0-100", () => {
    const result = buildHealthScore([{ label: "a", delta: -1000, detail: "d" }], 50);
    expect(result.score).toBe(0);
  });
});

describe("sortRulesBySeverity", () => {
  it("orders CRITICAL before HIGH before MEDIUM before LOW before INFO", () => {
    const now = new Date();
    const rules = [
      makeRule({ id: "1", category: "SYSTEM", severity: "INFO", title: "t", description: "d", reason: "r", generatedAt: now }),
      makeRule({ id: "2", category: "SYSTEM", severity: "CRITICAL", title: "t", description: "d", reason: "r", generatedAt: now }),
      makeRule({ id: "3", category: "SYSTEM", severity: "MEDIUM", title: "t", description: "d", reason: "r", generatedAt: now }),
    ];
    const sorted = sortRulesBySeverity(rules);
    expect(sorted.map((r) => r.id)).toEqual(["2", "3", "1"]);
  });

  it("does not mutate the input array", () => {
    const rules = [makeRule({ id: "1", category: "SYSTEM", severity: "LOW", title: "t", description: "d", reason: "r" })];
    const sorted = sortRulesBySeverity(rules);
    expect(sorted).not.toBe(rules);
  });
});

describe("daysBetween", () => {
  it("computes whole days between two dates", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-05T00:00:00Z");
    expect(daysBetween(from, to)).toBe(4);
  });
});
