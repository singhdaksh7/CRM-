import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countValidPropertyPhotos, hasPropertyPhotos, hasPropertyCoverImage, parseLegacyImages, isValidPhotoRow } from "./property-photo-count";
import { computePropertyHealth, type PropertyHealthInput } from "./rules/property-health";

const NOW = new Date("2026-08-05T12:00:00Z");

function baseInput(overrides: Partial<PropertyHealthInput> = {}): PropertyHealthInput {
  return {
    status: "AVAILABLE",
    hasOwner: true,
    ownerVerificationStatus: "VERIFIED",
    hasCompleteAddress: true,
    hasPrice: true,
    imageCount: 0,
    hasCoverImage: false,
    updatedAt: new Date("2026-08-02T12:00:00Z"),
    recentLeadMatchesCount: 1,
    recentCatalogueShareCount: 0,
    recentVisitCount: 0,
    recentRejectionCount: 0,
    pendingVerification: false,
    daysSinceOwnerResponse: 2,
    recentVisitOutcomeCount: { positive: 0, negative: 0 },
    photoUpdatedAt: null,
    daysSinceLastVerified: 3,
    now: NOW,
    ...overrides,
  };
}

const warningLabels = (r: { warnings: { label: string }[] }) => r.warnings.map((w) => w.label);
const row = (o: Record<string, unknown> = {}) => ({ status: "ACTIVE", purpose: "IMAGE", storageKey: "org/p/a.jpg", isCover: false, ...o });

describe("countValidPropertyPhotos", () => {
  it("zero photos", () => {
    expect(countValidPropertyPhotos({ photoRows: [], legacyImages: "[]" })).toBe(0);
    expect(hasPropertyPhotos({})).toBe(false);
  });
  it("counts 1 and many active IMAGE rows, without needing a cover", () => {
    expect(countValidPropertyPhotos({ photoRows: [row()] })).toBe(1);
    expect(countValidPropertyPhotos({ photoRows: [row(), row({ storageKey: "b" }), row({ storageKey: "c" })] })).toBe(3);
    expect(hasPropertyPhotos({ photoRows: [row({ isCover: false })] })).toBe(true);
  });
  it("ignores DELETED, non-IMAGE, empty/whitespace/missing storageKey", () => {
    const rows = [row({ status: "DELETED" }), row({ purpose: "FLOOR_PLAN" }), row({ purpose: "AVAILABILITY_REPORT" }), row({ storageKey: "" }), row({ storageKey: "   " }), row({ storageKey: null }), null as never];
    expect(countValidPropertyPhotos({ photoRows: rows })).toBe(0);
    expect(isValidPhotoRow(undefined)).toBe(false);
  });
  it("legacy images JSON: tolerates invalid values, counts only non-empty strings", () => {
    expect(parseLegacyImages("not json")).toEqual([]);
    expect(parseLegacyImages('{"a":1}')).toEqual([]);
    expect(parseLegacyImages('["", "  ", null, 3, "x.jpg"]')).toEqual(["x.jpg"]);
    expect(parseLegacyImages(null)).toEqual([]);
  });
  it("cover is separate from photo presence", () => {
    expect(hasPropertyCoverImage({ photoRows: [row()] })).toBe(false);
    expect(hasPropertyCoverImage({ photoRows: [row({ isCover: true })] })).toBe(true);
    expect(hasPropertyCoverImage({ photoRows: [row({ isCover: true, status: "DELETED" })] })).toBe(false);
    expect(hasPropertyCoverImage({ legacyCoverImage: "https://x/y.jpg" })).toBe(true);
  });
  it("production-shaped fixtures: Property A has 4 gallery photos, Property B none", () => {
    const a = countValidPropertyPhotos({ photoRows: [row(), row({ storageKey: "2" }), row({ storageKey: "3" }), row({ storageKey: "4", isCover: true })], legacyImages: "[]" });
    const b = countValidPropertyPhotos({ photoRows: [], legacyImages: "[]" });
    expect(a).toBe(4);
    expect(b).toBe(0);
    const healthA = computePropertyHealth(baseInput({ imageCount: a }));
    const healthB = computePropertyHealth(baseInput({ imageCount: b }));
    expect(warningLabels(healthA)).not.toContain("No images");
    expect(warningLabels(healthB)).toContain("No images");
    expect(healthA.score).toBeGreaterThan(healthB.score);
  });
});

describe("property health weights are unchanged", () => {
  // Owner not linked keeps the total below the 100 clamp so score deltas are exact.
  const score = (o: Partial<PropertyHealthInput>) => computePropertyHealth(baseInput({ hasOwner: false, ownerVerificationStatus: null, ...o })).score;
  it("0 -> -20, 1-4 -> +5, 5+ -> +12, cover +4", () => {
    const s0 = score({ imageCount: 0 });
    expect(score({ imageCount: 1 }) - s0).toBe(25);
    expect(score({ imageCount: 4 }) - s0).toBe(25);
    expect(score({ imageCount: 5 }) - s0).toBe(32);
    expect(score({ imageCount: 2, hasCoverImage: true }) - score({ imageCount: 2 })).toBe(4);
  });
  it("no cover does not produce a no-photos warning", () => {
    const r = computePropertyHealth(baseInput({ imageCount: 3, hasCoverImage: false }));
    expect(warningLabels(r)).not.toContain("No images");
  });
});

describe("shared helper wiring", () => {
  it("health scoring (single + overview) uses the shared helper, not raw images JSON length", () => {
    const src = readFileSync(join(__dirname, "rules/property-health.ts"), "utf8");
    expect(src).toContain("countValidPropertyPhotos");
    expect(src).not.toMatch(/imageCount:\s*images\.length/);
  });
  it("gallery refreshes the server-rendered health panel after changes", () => {
    const src = readFileSync(join(__dirname, "../components/properties/property-gallery.tsx"), "utf8");
    expect(src).toContain("router.refresh()");
    expect(src).toContain("onUploaded={reload}");
  });
});
