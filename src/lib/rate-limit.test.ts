import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const counters = new Map<string, number>();
let lastConstructorOptions: Record<string, unknown> | undefined;

vi.mock("ioredis", () => {
  class FakeRedis {
    constructor(_url: string, options: Record<string, unknown>) {
      lastConstructorOptions = options;
    }
    on() {}
    async incr(key: string) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }
    async expire() {
      return 1;
    }
    async ttl() {
      return 60;
    }
  }
  return { default: FakeRedis };
});

let savedRedisUrl: string | undefined;

beforeEach(() => {
  counters.clear();
  savedRedisUrl = process.env.REDIS_URL;
  process.env.REDIS_URL = "redis://localhost:6379";
});

afterEach(() => {
  if (savedRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = savedRedisUrl;
});

describe("Redis client bounded latency", () => {
  it("configures a bounded connect and command timeout so a slow/unreachable Redis fails fast on cold serverless instances", async () => {
    const { checkRateLimit } = await import("./rate-limit");
    await checkRateLimit("login", "probe-connection-config");
    expect(lastConstructorOptions?.connectTimeout).toBeTypeOf("number");
    expect(lastConstructorOptions?.connectTimeout as number).toBeGreaterThan(0);
    expect(lastConstructorOptions?.connectTimeout as number).toBeLessThanOrEqual(2000);
    expect(lastConstructorOptions?.commandTimeout).toBeTypeOf("number");
    expect(lastConstructorOptions?.commandTimeout as number).toBeGreaterThan(0);
    expect(lastConstructorOptions?.commandTimeout as number).toBeLessThanOrEqual(2000);
  });
});

describe("checkMapsQuota", () => {
  it("allows a request within both the per-user and org-wide limits", async () => {
    const { checkMapsQuota } = await import("./rate-limit");
    const result = await checkMapsQuota("mapsGeocode", "user1", "org1");
    expect(result.allowed).toBe(true);
  });

  it("blocks once the per-user limit is exceeded, even if the org-wide cap has room", async () => {
    const { checkMapsQuota, RATE_LIMITS } = await import("./rate-limit");
    for (let i = 0; i < RATE_LIMITS.mapsGeocode.limit; i++) {
      await checkMapsQuota("mapsGeocode", "user1", "org1");
    }
    const result = await checkMapsQuota("mapsGeocode", "user1", "org1");
    expect(result.allowed).toBe(false);
  });

  it("blocks once the org-wide daily cap is exceeded, even for a fresh user", async () => {
    const { checkMapsQuota, RATE_LIMITS } = await import("./rate-limit");
    for (let i = 0; i < RATE_LIMITS.mapsOrgDaily.limit; i++) {
      await checkMapsQuota("mapsGeocode", `user-${i}`, "org1");
    }
    const result = await checkMapsQuota("mapsGeocode", "brand-new-user", "org1");
    expect(result.allowed).toBe(false);
  });

  it("tracks org-wide caps independently per organization", async () => {
    const { checkMapsQuota, RATE_LIMITS } = await import("./rate-limit");
    for (let i = 0; i < RATE_LIMITS.mapsOrgDaily.limit; i++) {
      await checkMapsQuota("mapsGeocode", `user-${i}`, "org1");
    }
    const otherOrgResult = await checkMapsQuota("mapsGeocode", "user-in-other-org", "org2");
    expect(otherOrgResult.allowed).toBe(true);
  });
});
