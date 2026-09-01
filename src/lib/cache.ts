import Redis from "ioredis";
import { logger } from "./logger";

/**
 * Short-lived read-through cache for safe-to-serve-slightly-stale data
 * (dashboard aggregates, reports summaries, directory listings). Backed by
 * the same Upstash/standard Redis used by src/lib/rate-limit.ts. Fails open
 * on any Redis error - a cache outage degrades to "always compute", never
 * to a broken page.
 *
 * Do NOT use this for anything requiring immediate consistency (payments,
 * deal stage transitions, document permissions, auth) - see call sites.
 */
let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return null;
  }
  // See src/lib/rate-limit.ts for why connectTimeout/commandTimeout are
  // bounded - same fix, same root cause (ioredis's 10s default connectTimeout
  // stalls cold serverless requests when Redis is slow/unreachable).
  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: false,
    enableOfflineQueue: true,
    connectTimeout: 1500,
    commandTimeout: 750,
  });
  client.on("error", (err) => logger.error("redis_cache_error", { message: err.message }));
  return client;
}

export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const redis = getClient();
  if (!redis) return compute();

  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn("cache_read_failed", { key, message: err instanceof Error ? err.message : String(err) });
  }

  const value = await compute();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn("cache_write_failed", { key, message: err instanceof Error ? err.message : String(err) });
  }

  return value;
}

/** Test-only: forces the next getClient() call to re-read REDIS_URL. */
export function _resetCacheClientForTests(): void {
  client = undefined;
}

/** Deletes every cached key starting with `prefix` - call after a write that makes cached data stale. Uses SCAN (not KEYS) so it never blocks Redis. */
export async function invalidateCache(prefix: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;

  try {
    let cursor = "0";
    const keysToDelete: string[] = [];
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      cursor = next;
      keysToDelete.push(...keys);
    } while (cursor !== "0");
    if (keysToDelete.length > 0) await redis.del(...keysToDelete);
  } catch (err) {
    logger.warn("cache_invalidate_failed", { prefix, message: err instanceof Error ? err.message : String(err) });
  }
}
