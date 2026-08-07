import { describe, it, expect } from "vitest";
import { computeInventoryFreshness, type InventoryFreshnessInput, type FreshnessThresholds } from "./inventory-freshness";

const NOW = new Date("2026-08-05T12:00:00Z");
const THRESHOLDS: FreshnessThresholds = { needsVerificationDays: 30, staleDays: 60 };

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function baseInput(overrides: Partial<InventoryFreshnessInput> = {}): InventoryFreshnessInput {
  return {
    lastVisitAt: null,
    updatedAt: daysAgo(90),
    lastVerifiedAt: null,
    now: NOW,
    ...overrides,
  };
}

describe("computeInventoryFreshness", () => {
  it("returns FRESH when verified within the last 7 days, regardless of other signals", () => {
    const result = computeInventoryFreshness(baseInput({ lastVerifiedAt: daysAgo(2), updatedAt: daysAgo(200) }), THRESHOLDS);
    expect(result).toBe("FRESH");
  });

  it("returns FRESH at exactly the 7-day boundary", () => {
    const result = computeInventoryFreshness(baseInput({ lastVerifiedAt: daysAgo(7) }), THRESHOLDS);
    expect(result).toBe("FRESH");
  });

  it("returns VERIFIED just past the fresh window but within needsVerificationDays", () => {
    const result = computeInventoryFreshness(baseInput({ lastVerifiedAt: daysAgo(8) }), THRESHOLDS);
    expect(result).toBe("VERIFIED");
  });

  it("returns VERIFIED at exactly the needsVerificationDays boundary", () => {
    const result = computeInventoryFreshness(baseInput({ lastVerifiedAt: daysAgo(30) }), THRESHOLDS);
    expect(result).toBe("VERIFIED");
  });

  it("returns NEEDS_VERIFICATION just past needsVerificationDays", () => {
    const result = computeInventoryFreshness(baseInput({ lastVerifiedAt: daysAgo(31) }), THRESHOLDS);
    expect(result).toBe("NEEDS_VERIFICATION");
  });

  it("returns NEEDS_VERIFICATION at exactly the staleDays boundary", () => {
    const result = computeInventoryFreshness(baseInput({ lastVerifiedAt: daysAgo(60) }), THRESHOLDS);
    expect(result).toBe("NEEDS_VERIFICATION");
  });

  it("returns STALE just past staleDays", () => {
    const result = computeInventoryFreshness(baseInput({ lastVerifiedAt: daysAgo(61) }), THRESHOLDS);
    expect(result).toBe("STALE");
  });

  it("falls back to the most recent visit when never verified", () => {
    const result = computeInventoryFreshness(baseInput({ lastVisitAt: daysAgo(5), updatedAt: daysAgo(200) }), THRESHOLDS);
    expect(result).toBe("VERIFIED");
  });

  it("falls back to updatedAt when never verified and never visited", () => {
    const result = computeInventoryFreshness(baseInput({ updatedAt: daysAgo(10) }), THRESHOLDS);
    expect(result).toBe("VERIFIED");
  });

  it("returns STALE for a property that has never been verified, visited, or updated recently", () => {
    const result = computeInventoryFreshness(baseInput({ updatedAt: daysAgo(200) }), THRESHOLDS);
    expect(result).toBe("STALE");
  });

  it("uses whichever signal is most recent among verified/visited/updated", () => {
    const result = computeInventoryFreshness(
      baseInput({ lastVerifiedAt: daysAgo(50), lastVisitAt: daysAgo(10), updatedAt: daysAgo(200) }),
      THRESHOLDS
    );
    expect(result).toBe("VERIFIED"); // most recent signal (visit, 10 days) wins over the older verification
  });
});
