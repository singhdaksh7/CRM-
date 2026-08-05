import { describe, it, expect } from "vitest";
import { mergeSystemConfig, DEFAULT_SYSTEM_CONFIG } from "./system-config";

describe("mergeSystemConfig", () => {
  it("returns the defaults untouched when there are no overrides", () => {
    expect(mergeSystemConfig(null)).toEqual(DEFAULT_SYSTEM_CONFIG);
    expect(mergeSystemConfig(undefined)).toEqual(DEFAULT_SYSTEM_CONFIG);
  });

  it("overrides only the provided top-level keys", () => {
    const merged = mergeSystemConfig({ hotLeadThreshold: 90 });
    expect(merged.hotLeadThreshold).toBe(90);
    expect(merged.matchingRadiusKm).toBe(DEFAULT_SYSTEM_CONFIG.matchingRadiusKm);
  });

  it("deep-merges healthScoreWeights instead of replacing the whole object", () => {
    const merged = mergeSystemConfig({ healthScoreWeights: { location: 40 } as never });
    expect(merged.healthScoreWeights.location).toBe(40);
    expect(merged.healthScoreWeights.budget).toBe(DEFAULT_SYSTEM_CONFIG.healthScoreWeights.budget);
  });

  it("deep-merges businessHours instead of replacing the whole object", () => {
    const merged = mergeSystemConfig({ businessHours: { startHour: 8 } as never });
    expect(merged.businessHours.startHour).toBe(8);
    expect(merged.businessHours.endHour).toBe(DEFAULT_SYSTEM_CONFIG.businessHours.endHour);
  });
});
