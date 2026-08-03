export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

/** True for a real, plausible WGS84 coordinate pair - rejects NaN, out-of-range, and the common "0,0" placeholder (null island) that a bad client-side default would otherwise silently accept as real. */
export function isValidCoordinates(input: unknown): input is Coordinates {
  if (!input || typeof input !== "object") return false;
  const { latitude, longitude } = input as Record<string, unknown>;
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

/** A coordinate pair that is at least plausibly within the Delhi-NCR bounding box - a soft sanity check, not a hard validation rule, since brokerages occasionally list a property just outside NCR. */
export function isPlausibleDelhiNcrCoordinates(input: Coordinates): boolean {
  return input.latitude >= 28.0 && input.latitude <= 29.2 && input.longitude >= 76.5 && input.longitude <= 77.7;
}

/** Great-circle distance in meters (haversine formula) - used for nearby-property radius filtering and as the client-side/offline fallback when the Maps API is disabled. */
export function haversineDistanceMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function metersToKm(meters: number): number {
  return meters / 1000;
}
