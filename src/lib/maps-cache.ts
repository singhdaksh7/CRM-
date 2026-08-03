import Redis from "ioredis";
import { logger } from "./logger";

/**
 * Small Redis-backed cache for geocoding/directions/distance-matrix results
 * - mirrors the lazy-singleton style already used independently in
 * rate-limit.ts and notifications.ts's sweep lock (this codebase's
 * established pattern rather than a shared client). Falls open (no
 * caching, calls always go through) if REDIS_URL is unset or unreachable -
 * caching is a cost optimization, never a correctness requirement, so its
 * absence must never break a maps feature.
 */

let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return null;
  }
  client = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false, enableOfflineQueue: true });
  client.on("error", (err) => logger.error("maps_cache_redis_error", { message: err.message }));
  return client;
}

/** Geocoding results are stable for a long time - an address's coordinates essentially never change. */
export const GEOCODE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
/** Directions/distance-matrix depend on live traffic, so cached only briefly. */
export const ROUTE_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

async function getCached<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logger.warn("maps_cache_read_failed", { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function setCached(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn("maps_cache_write_failed", { message: err instanceof Error ? err.message : String(err) });
  }
}

/** Wraps `compute()` with a get-or-set cache lookup. Never caches a thrown error - a transient failure should not "poison" the cache for the TTL window. */
export async function withMapsCache<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const cached = await getCached<T>(key);
  if (cached !== null) return cached;
  const result = await compute();
  await setCached(key, result, ttlSeconds);
  return result;
}

function roundCoord(n: number): string {
  // ~11m precision (5 decimal places) - collapses near-duplicate requests
  // (e.g. a click a few meters off a previous one) into the same cache key
  // without meaningfully harming route accuracy.
  return n.toFixed(5);
}

export function geocodeCacheKey(query: string, region: string): string {
  return `maps:geocode:${region.toLowerCase()}:${query.trim().toLowerCase()}`;
}

export function reverseGeocodeCacheKey(latitude: number, longitude: number): string {
  return `maps:reverse:${roundCoord(latitude)},${roundCoord(longitude)}`;
}

export function directionsCacheKey(origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }): string {
  return `maps:directions:${roundCoord(origin.latitude)},${roundCoord(origin.longitude)}->${roundCoord(destination.latitude)},${roundCoord(destination.longitude)}`;
}

export function distanceMatrixCacheKey(origins: { latitude: number; longitude: number }[], destinations: { latitude: number; longitude: number }[]): string {
  const o = origins.map((p) => `${roundCoord(p.latitude)},${roundCoord(p.longitude)}`).join(";");
  const d = destinations.map((p) => `${roundCoord(p.latitude)},${roundCoord(p.longitude)}`).join(";");
  return `maps:matrix:${o}->${d}`;
}

/** Test-only: forces the next getClient() call to re-read REDIS_URL. */
export function _resetMapsCacheClientForTests(): void {
  client = undefined;
}
