export type MapsProviderName = "GOOGLE" | "DISABLED";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeInput {
  /** Free-text address, ideally already locality-normalized (see locality.ts). */
  query: string;
  /** ISO 3166-1 alpha-2 region bias, e.g. "IN". */
  region?: string;
}

export interface GeocodeResult {
  formattedAddress: string;
  placeId: string;
  location: Coordinates;
  /** True only when the provider reports a rooftop/exact match; approximate/locality-level matches are false. */
  isPreciseMatch: boolean;
}

export interface AddressResult {
  formattedAddress: string;
  placeId: string | null;
}

export interface DirectionsInput {
  origin: Coordinates;
  destination: Coordinates;
  /** Departure time for traffic-aware duration; defaults to "now" at call time. */
  departAt?: Date;
}

export interface DirectionsResult {
  distanceMeters: number;
  durationSeconds: number;
  /** Duration including live/typical traffic, when the provider supports it - falls back to durationSeconds otherwise. */
  durationInTrafficSeconds: number | null;
  polyline: string | null;
}

export interface DistanceMatrixInput {
  origins: Coordinates[];
  destinations: Coordinates[];
}

export interface DistanceMatrixElement {
  distanceMeters: number | null;
  durationSeconds: number | null;
  status: "OK" | "NOT_FOUND" | "ZERO_RESULTS";
}

export interface DistanceMatrixResult {
  /** rows[i][j] = element from origins[i] to destinations[j]. */
  rows: DistanceMatrixElement[][];
}

export interface PlaceSearchInput {
  query: string;
  region?: string;
  /** Biases results near this point (e.g. the user's currently-selected city center) without hard-restricting them. */
  near?: Coordinates;
}

export interface PlaceResult {
  placeId: string;
  description: string;
}

export interface MapsDiagnosticsResult {
  ok: boolean;
  /** Safe, human-readable details only - never the API key or a raw provider payload. */
  details: Record<string, string>;
}

/**
 * Provider-agnostic maps interface. `DisabledMapsProvider` throws a clear
 * MapsConfigError from every method so callers can present a uniform
 * "maps not configured" state; `GoogleMapsProvider` implements the same
 * shape against the real Google Maps Platform APIs. Adding a future
 * provider (e.g. Mapbox) means adding one file here, not touching any
 * route or UI component - the same pattern already used for storage and
 * WhatsApp providers in this codebase.
 */
export interface MapsProvider {
  readonly name: MapsProviderName;
  geocode(input: GeocodeInput): Promise<GeocodeResult[]>;
  reverseGeocode(input: Coordinates): Promise<AddressResult>;
  getDirections(input: DirectionsInput): Promise<DirectionsResult>;
  getDistanceMatrix(input: DistanceMatrixInput): Promise<DistanceMatrixResult>;
  searchPlaces(input: PlaceSearchInput): Promise<PlaceResult[]>;
  getDiagnostics(): Promise<MapsDiagnosticsResult>;
}
