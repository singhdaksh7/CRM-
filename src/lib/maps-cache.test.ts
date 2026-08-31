import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const store = new Map<string, { value: string; expiresAt: number }>();
let lastConstructorOptions: Record<string, unknown> | undefined;

vi.mock("ioredis", () => {
  class FakeRedis {
    constructor(_url: string, options: Record<string, unknown>) {
      lastConstructorOptions = options;
    }
    on() {}
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    }
    async set(key: string, value: string, _ex: string, ttlSeconds: number) {
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return "OK";
    }
  }
  return { default: FakeRedis };
});

let savedRedisUrl: string | undefined;

beforeEach(() => {
  store.clear();
  savedRedisUrl = process.env.REDIS_URL;
  process.env.REDIS_URL = "redis://localhost:6379";
});

afterEach(() => {
  if (savedRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = savedRedisUrl;
});

describe("withMapsCache", () => {
  it("configures a bounded connect and command timeout so a slow/unreachable Redis fails fast on cold serverless instances", async () => {
    const { withMapsCache, _resetMapsCacheClientForTests } = await import("./maps-cache");
    _resetMapsCacheClientForTests();
    await withMapsCache("probe-connection-config", 60, async () => "value");
    expect(lastConstructorOptions?.connectTimeout).toBeTypeOf("number");
    expect(lastConstructorOptions?.connectTimeout as number).toBeGreaterThan(0);
    expect(lastConstructorOptions?.connectTimeout as number).toBeLessThanOrEqual(2000);
    expect(lastConstructorOptions?.commandTimeout).toBeTypeOf("number");
    expect(lastConstructorOptions?.commandTimeout as number).toBeGreaterThan(0);
    expect(lastConstructorOptions?.commandTimeout as number).toBeLessThanOrEqual(2000);
  });

  it("calls compute() on a cache miss and caches the result", async () => {
    const { withMapsCache, _resetMapsCacheClientForTests } = await import("./maps-cache");
    _resetMapsCacheClientForTests();
    const compute = vi.fn().mockResolvedValue({ value: 42 });

    const first = await withMapsCache("test-key-1", 60, compute);
    const second = await withMapsCache("test-key-1", 60, compute);

    expect(first).toEqual({ value: 42 });
    expect(second).toEqual({ value: 42 });
    expect(compute).toHaveBeenCalledTimes(1); // second call was a cache hit
  });

  it("does not cache a thrown error", async () => {
    const { withMapsCache, _resetMapsCacheClientForTests } = await import("./maps-cache");
    _resetMapsCacheClientForTests();
    const compute = vi.fn().mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce({ value: "recovered" });

    await expect(withMapsCache("test-key-2", 60, compute)).rejects.toThrow("transient");
    const result = await withMapsCache("test-key-2", 60, compute);
    expect(result).toEqual({ value: "recovered" });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("falls open (always calls compute, no caching) when REDIS_URL is unset", async () => {
    delete process.env.REDIS_URL;
    const { withMapsCache, _resetMapsCacheClientForTests } = await import("./maps-cache");
    _resetMapsCacheClientForTests();
    const compute = vi.fn().mockResolvedValue({ value: "always-fresh" });

    await withMapsCache("test-key-3", 60, compute);
    await withMapsCache("test-key-3", 60, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });
});

describe("cache key builders", () => {
  it("geocodeCacheKey is stable for the same query/region and case-insensitive", async () => {
    const { geocodeCacheKey } = await import("./maps-cache");
    expect(geocodeCacheKey("Janakpuri, Delhi", "IN")).toBe(geocodeCacheKey("janakpuri, delhi", "in"));
  });

  it("directionsCacheKey rounds coordinates to a stable precision", async () => {
    const { directionsCacheKey } = await import("./maps-cache");
    const key1 = directionsCacheKey({ latitude: 28.612345, longitude: 77.229461 }, { latitude: 28.7, longitude: 77.1 });
    const key2 = directionsCacheKey({ latitude: 28.6123451, longitude: 77.2294609 }, { latitude: 28.7, longitude: 77.1 });
    expect(key1).toBe(key2);
  });

  it("distanceMatrixCacheKey differs for different destination sets", async () => {
    const { distanceMatrixCacheKey } = await import("./maps-cache");
    const origins = [{ latitude: 28.6, longitude: 77.2 }];
    const keyA = distanceMatrixCacheKey(origins, [{ latitude: 28.7, longitude: 77.1 }]);
    const keyB = distanceMatrixCacheKey(origins, [{ latitude: 28.8, longitude: 77.0 }]);
    expect(keyA).not.toBe(keyB);
  });
});
