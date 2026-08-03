import { getMapsProvider, loadMapsConfig } from "@/integrations/maps";
import { withMapsCache, geocodeCacheKey, reverseGeocodeCacheKey, directionsCacheKey, distanceMatrixCacheKey, GEOCODE_CACHE_TTL_SECONDS, ROUTE_CACHE_TTL_SECONDS } from "./maps-cache";
import type { GeocodeResult, AddressResult, DirectionsResult, DistanceMatrixResult, Coordinates } from "@/integrations/maps";

const MIN_QUERY_LENGTH = 3;

export class MapsQueryTooShortError extends Error {}

function assertQueryLength(query: string) {
  if (query.trim().length < MIN_QUERY_LENGTH) {
    throw new MapsQueryTooShortError(`Search query must be at least ${MIN_QUERY_LENGTH} characters`);
  }
}

/** Cached geocoding - a real address's coordinates don't change, so results are cached for a long TTL to avoid paying for the same lookup twice. */
export async function geocodeAddressCached(query: string): Promise<GeocodeResult[]> {
  assertQueryLength(query);
  const provider = getMapsProvider();
  const config = loadMapsConfig();
  const key = geocodeCacheKey(query, config.defaultRegion);
  return withMapsCache(key, GEOCODE_CACHE_TTL_SECONDS, () => provider.geocode({ query, region: config.defaultRegion }));
}

export async function reverseGeocodeCached(coordinates: Coordinates): Promise<AddressResult> {
  const provider = getMapsProvider();
  const key = reverseGeocodeCacheKey(coordinates.latitude, coordinates.longitude);
  return withMapsCache(key, GEOCODE_CACHE_TTL_SECONDS, () => provider.reverseGeocode(coordinates));
}

/** Directions depend on live traffic, so cached only briefly (see ROUTE_CACHE_TTL_SECONDS) - avoids recalculating the same pair of stops repeatedly within a short window (e.g. re-rendering a visit planner). */
export async function getDirectionsCached(origin: Coordinates, destination: Coordinates): Promise<DirectionsResult> {
  const provider = getMapsProvider();
  const key = directionsCacheKey(origin, destination);
  return withMapsCache(key, ROUTE_CACHE_TTL_SECONDS, () => provider.getDirections({ origin, destination }));
}

export async function getDistanceMatrixCached(origins: Coordinates[], destinations: Coordinates[]): Promise<DistanceMatrixResult> {
  const provider = getMapsProvider();
  const key = distanceMatrixCacheKey(origins, destinations);
  return withMapsCache(key, ROUTE_CACHE_TTL_SECONDS, () => provider.getDistanceMatrix({ origins, destinations }));
}

export async function searchPlacesValidated(query: string, near?: Coordinates) {
  assertQueryLength(query);
  const provider = getMapsProvider();
  const config = loadMapsConfig();
  // Place predictions change too often (new businesses, closures) to cache
  // safely for long, and autocomplete keystrokes are already debounced
  // client-side + minimum-length-gated here, so this intentionally isn't cached.
  return provider.searchPlaces({ query, region: config.defaultRegion, near });
}
