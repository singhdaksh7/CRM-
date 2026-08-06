import { describe, it, expect, vi, beforeEach } from "vitest";

const systemConfigFindUnique = vi.fn();
const systemConfigUpsert = vi.fn();
const cacheGet = vi.fn();
const cacheDel = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    systemConfig: {
      findUnique: (...a: unknown[]) => systemConfigFindUnique(...a),
      upsert: (...a: unknown[]) => systemConfigUpsert(...a),
    },
  },
}));

// Mirrors src/lib/cache.ts's real "fail open, no Redis configured -> always
// compute" behavior (REDIS_URL is unset in the test environment), but lets
// invalidateCache be asserted on directly instead of needing a real Redis.
vi.mock("./cache", () => ({
  cached: async (_key: string, _ttl: number, compute: () => Promise<unknown>) => {
    cacheGet();
    return compute();
  },
  invalidateCache: async (prefix: string) => {
    cacheDel(prefix);
  },
}));

import { mergeSystemConfig, DEFAULT_SYSTEM_CONFIG, getSystemConfig, updateSystemConfig } from "./system-config";

beforeEach(() => {
  vi.clearAllMocks();
});

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

describe("getSystemConfig - defaults preserve old behavior", () => {
  it("returns DEFAULT_SYSTEM_CONFIG (exactly matching the previous hardcoded constants) when no row exists for the organization", async () => {
    systemConfigFindUnique.mockResolvedValue(null);
    const config = await getSystemConfig("org_default");
    expect(config).toEqual(DEFAULT_SYSTEM_CONFIG);
  });
});

describe("getSystemConfig - missing-table fallback", () => {
  it("falls back to DEFAULT_SYSTEM_CONFIG (never throws) when the system_configs table doesn't exist yet on this database", async () => {
    systemConfigFindUnique.mockRejectedValue(new Error('The table `public.system_configs` does not exist in the current database.'));
    const config = await getSystemConfig("org_default");
    expect(config).toEqual(DEFAULT_SYSTEM_CONFIG);
  });
});

describe("getSystemConfig - organization isolation", () => {
  it("looks up the row scoped to the given organizationId, never a different org's config", async () => {
    systemConfigFindUnique.mockResolvedValue(null);
    await getSystemConfig("org_a");
    expect(systemConfigFindUnique).toHaveBeenCalledWith({ where: { organizationId: "org_a" } });

    systemConfigFindUnique.mockClear();
    await getSystemConfig("org_b");
    expect(systemConfigFindUnique).toHaveBeenCalledWith({ where: { organizationId: "org_b" } });
  });
});

describe("updateSystemConfig - cache invalidation", () => {
  it("invalidates the cache for the affected organization after a successful update", async () => {
    systemConfigFindUnique.mockResolvedValue(null);
    systemConfigUpsert.mockResolvedValue({});
    await updateSystemConfig({ organizationId: "org_a", updatedById: "u1", patch: { hotLeadThreshold: 80 } });
    expect(cacheDel).toHaveBeenCalledWith("system-config:org_a");
  });

  it("scopes the upsert to the given organizationId", async () => {
    systemConfigFindUnique.mockResolvedValue(null);
    systemConfigUpsert.mockResolvedValue({});
    await updateSystemConfig({ organizationId: "org_b", updatedById: "u1", patch: { hotLeadThreshold: 80 } });
    expect(systemConfigUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org_b" } }));
  });
});
