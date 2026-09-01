import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const store = new Map<string, string>();
let lastConstructorOptions: Record<string, unknown> | undefined;

vi.mock("ioredis", () => {
  class FakeRedis {
    constructor(_url: string, options: Record<string, unknown>) {
      lastConstructorOptions = options;
    }
    on() {}
    async get(key: string) {
      return store.get(key) ?? null;
    }
    async set(key: string, value: string) {
      store.set(key, value);
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

describe("cached", () => {
  it("configures a bounded connect and command timeout so a slow/unreachable Redis fails fast on cold serverless instances", async () => {
    const { cached, _resetCacheClientForTests } = await import("./cache");
    _resetCacheClientForTests();
    await cached("probe-connection-config", 30, async () => "value");
    expect(lastConstructorOptions?.connectTimeout).toBeTypeOf("number");
    expect(lastConstructorOptions?.connectTimeout as number).toBeGreaterThan(0);
    expect(lastConstructorOptions?.connectTimeout as number).toBeLessThanOrEqual(2000);
    expect(lastConstructorOptions?.commandTimeout).toBeTypeOf("number");
    expect(lastConstructorOptions?.commandTimeout as number).toBeGreaterThan(0);
    expect(lastConstructorOptions?.commandTimeout as number).toBeLessThanOrEqual(2000);
  });

  it("calls compute() on a cache miss and caches the result", async () => {
    const { cached, _resetCacheClientForTests } = await import("./cache");
    _resetCacheClientForTests();
    const compute = vi.fn().mockResolvedValue({ value: 42 });

    const first = await cached("test-key-1", 30, compute);
    const second = await cached("test-key-1", 30, compute);

    expect(first).toEqual({ value: 42 });
    expect(second).toEqual({ value: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("falls open (always calls compute) when REDIS_URL is unset", async () => {
    delete process.env.REDIS_URL;
    const { cached, _resetCacheClientForTests } = await import("./cache");
    _resetCacheClientForTests();
    const compute = vi.fn().mockResolvedValue({ value: "fresh" });

    await cached("test-key-2", 30, compute);
    await cached("test-key-2", 30, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });
});
