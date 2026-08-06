import { describe, it, expect } from "vitest";
import { computePropertyHealth, type PropertyHealthInput } from "./property-health";

const NOW = new Date("2026-08-05T12:00:00Z");

function baseInput(overrides: Partial<PropertyHealthInput> = {}): PropertyHealthInput {
  return {
    status: "AVAILABLE",
    hasOwner: true,
    ownerVerificationStatus: "VERIFIED",
    hasCompleteAddress: true,
    hasPrice: true,
    imageCount: 8,
    hasCoverImage: true,
    updatedAt: new Date("2026-08-02T12:00:00Z"),
    recentLeadMatchesCount: 3,
    recentCatalogueShareCount: 2,
    recentVisitCount: 1,
    recentRejectionCount: 0,
    pendingVerification: false,
    daysSinceOwnerResponse: 2,
    recentVisitOutcomeCount: { positive: 0, negative: 0 },
    photoUpdatedAt: new Date("2026-08-01T12:00:00Z"),
    daysSinceLastVerified: 3,
    now: NOW,
    ...overrides,
  };
}

describe("computePropertyHealth", () => {
  it("scores a complete, verified, active property as Healthy or Excellent", () => {
    const result = computePropertyHealth(baseInput());
    expect(["Healthy", "Excellent"]).toContain(result.label);
  });

  it("heavily penalizes a listing with no images", () => {
    const withImages = computePropertyHealth(baseInput());
    const noImages = computePropertyHealth(baseInput({ imageCount: 0 }));
    expect(noImages.score).toBeLessThan(withImages.score);
    expect(noImages.warnings.some((w) => /no images/i.test(w.detail))).toBe(true);
  });

  it("penalizes a listing with no owner linked", () => {
    const result = computePropertyHealth(baseInput({ hasOwner: false, ownerVerificationStatus: null }));
    expect(result.warnings.some((w) => /no owner/i.test(w.detail))).toBe(true);
  });

  it("penalizes an inactive property", () => {
    const active = computePropertyHealth(baseInput());
    const inactive = computePropertyHealth(baseInput({ status: "INACTIVE" }));
    expect(inactive.score).toBeLessThan(active.score);
  });

  it("flags stale availability past the 30-day threshold", () => {
    const result = computePropertyHealth(baseInput({ updatedAt: new Date("2026-06-01T12:00:00Z") }));
    expect(result.warnings.some((w) => /confirm this listing/i.test(w.detail))).toBe(true);
  });

  it("rewards recent lead matches, catalogue shares and visit activity", () => {
    const inactive = computePropertyHealth(baseInput({ recentLeadMatchesCount: 0, recentCatalogueShareCount: 0, recentVisitCount: 0 }));
    const active = computePropertyHealth(baseInput());
    expect(active.score).toBeGreaterThan(inactive.score);
  });

  it("clamps the score to 0-100 for a property with every negative factor", () => {
    const result = computePropertyHealth(
      baseInput({
        status: "INACTIVE",
        hasOwner: false,
        ownerVerificationStatus: null,
        hasCompleteAddress: false,
        hasPrice: false,
        imageCount: 0,
        hasCoverImage: false,
        updatedAt: new Date("2026-01-01T12:00:00Z"),
        recentLeadMatchesCount: 0,
        recentCatalogueShareCount: 0,
        recentVisitCount: 0,
        recentRejectionCount: 5,
        pendingVerification: true,
        daysSinceOwnerResponse: 60,
        recentVisitOutcomeCount: { positive: 0, negative: 3 },
        photoUpdatedAt: new Date("2026-01-01T12:00:00Z"),
        daysSinceLastVerified: null,
      })
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.label).toBe("Critical");
  });

  it("clamps the score to 0-100 for a property with every positive factor", () => {
    const result = computePropertyHealth(baseInput({ imageCount: 20, recentLeadMatchesCount: 10 }));
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("penalizes a property pending availability verification", () => {
    const midLevel = { imageCount: 3, recentCatalogueShareCount: 0, recentVisitCount: 0 } as const;
    const verified = computePropertyHealth(baseInput(midLevel));
    const pending = computePropertyHealth(baseInput({ ...midLevel, pendingVerification: true }));
    expect(pending.score).toBeLessThan(verified.score);
    expect(pending.warnings.some((w) => /pending verification/i.test(w.label))).toBe(true);
  });

  it("penalizes an unresponsive owner past 14 days", () => {
    const result = computePropertyHealth(baseInput({ daysSinceOwnerResponse: 20 }));
    expect(result.warnings.some((w) => /owner unresponsive/i.test(w.label))).toBe(true);
  });

  it("does not penalize owner responsiveness when there is no owner at all", () => {
    const result = computePropertyHealth(baseInput({ hasOwner: false, ownerVerificationStatus: null, daysSinceOwnerResponse: null }));
    expect(result.warnings.some((w) => /owner unresponsive/i.test(w.label))).toBe(false);
  });

  it("rewards positive recent visit outcomes", () => {
    const midLevel = { imageCount: 3, hasCoverImage: false, recentCatalogueShareCount: 0, recentVisitCount: 0, recentLeadMatchesCount: 0 } as const;
    const neutral = computePropertyHealth(baseInput(midLevel));
    const positive = computePropertyHealth(baseInput({ ...midLevel, recentVisitOutcomeCount: { positive: 2, negative: 0 } }));
    expect(positive.score).toBeGreaterThan(neutral.score);
  });

  it("penalizes multiple negative recent visit outcomes", () => {
    const result = computePropertyHealth(baseInput({ recentVisitOutcomeCount: { positive: 0, negative: 2 } }));
    expect(result.warnings.some((w) => /negative visit outcomes/i.test(w.label))).toBe(true);
  });

  it("penalizes stale photos past 60 days", () => {
    const result = computePropertyHealth(baseInput({ photoUpdatedAt: new Date("2026-05-01T12:00:00Z") }));
    expect(result.warnings.some((w) => /stale photos/i.test(w.label))).toBe(true);
  });

  it("penalizes a property that has never been verified", () => {
    const result = computePropertyHealth(baseInput({ daysSinceLastVerified: null }));
    expect(result.warnings.some((w) => /not recently verified/i.test(w.label))).toBe(true);
  });

  it("penalizes a property not verified in over 30 days", () => {
    const result = computePropertyHealth(baseInput({ daysSinceLastVerified: 45 }));
    expect(result.warnings.some((w) => /not recently verified/i.test(w.label))).toBe(true);
  });

  it("does not penalize a recently verified property", () => {
    const result = computePropertyHealth(baseInput({ daysSinceLastVerified: 3 }));
    expect(result.warnings.some((w) => /not recently verified/i.test(w.label))).toBe(false);
  });
});
