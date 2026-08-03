import { MapsConfigError, MapsProviderError } from "./maps-errors";
import type { MapsConfig } from "./maps-config";
import type {
  MapsProvider,
  GeocodeInput,
  GeocodeResult,
  Coordinates,
  AddressResult,
  DirectionsInput,
  DirectionsResult,
  DistanceMatrixInput,
  DistanceMatrixResult,
  DistanceMatrixElement,
  PlaceSearchInput,
  PlaceResult,
  MapsDiagnosticsResult,
} from "./maps-types";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 2; // one retry, transient failures only - never for a rejected/invalid request

/** Rooftop/exact matches are treated as precise; everything else (approximate, geometric center, range interpolated) is not. */
const PRECISE_LOCATION_TYPES = new Set(["ROOFTOP"]);

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Real Google Maps Platform client, using the plain REST endpoints (Geocoding,
 * Directions, Distance Matrix, Places Autocomplete) directly via fetch rather
 * than the `@googlemaps/*` SDK - no new dependency needed for a handful of
 * well-documented JSON GET endpoints. Structurally complete but has NOT been
 * exercised against a real Google Cloud project in this environment - no API
 * key was available. Wiring this up only requires setting
 * GOOGLE_MAPS_SERVER_API_KEY (and enabling the relevant APIs); no code
 * changes are needed.
 */
export class GoogleMapsProvider implements MapsProvider {
  readonly name = "GOOGLE" as const;

  constructor(private config: MapsConfig) {}

  private async get(path: string, params: Record<string, string>, attempt = 1): Promise<Record<string, unknown>> {
    if (!this.config.serverApiKey) {
      throw new MapsConfigError("Google Maps provider is not configured (missing GOOGLE_MAPS_SERVER_API_KEY).");
    }

    const url = new URL(`https://maps.googleapis.com/maps/api/${path}/json`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("key", this.config.serverApiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url.toString(), { signal: controller.signal });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

      if (!res.ok) {
        if (isTransientStatus(res.status) && attempt < MAX_ATTEMPTS) return this.get(path, params, attempt + 1);
        throw new MapsProviderError(this.name, `Google Maps API returned HTTP ${res.status}`);
      }

      const status = String(json?.status ?? "UNKNOWN_ERROR");
      // Never log the API key - only the status/error_message Google returns are safe.
      if (status !== "OK" && status !== "ZERO_RESULTS") {
        const errorMessage = typeof json?.error_message === "string" ? json.error_message : status;
        if ((status === "OVER_QUERY_LIMIT" || status === "UNKNOWN_ERROR") && attempt < MAX_ATTEMPTS) {
          return this.get(path, params, attempt + 1);
        }
        throw new MapsProviderError(this.name, `Google Maps ${path} failed: ${errorMessage}`);
      }

      return json ?? {};
    } catch (err) {
      if (err instanceof MapsProviderError || err instanceof MapsConfigError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        if (attempt < MAX_ATTEMPTS) return this.get(path, params, attempt + 1);
        throw new MapsProviderError(this.name, `Request to Google Maps API timed out after ${REQUEST_TIMEOUT_MS}ms`, err);
      }
      throw new MapsProviderError(this.name, "Unexpected error calling Google Maps API", err);
    } finally {
      clearTimeout(timeout);
    }
  }

  async geocode(input: GeocodeInput): Promise<GeocodeResult[]> {
    const json = await this.get("geocode", {
      address: input.query,
      region: input.region ?? this.config.defaultRegion,
      language: this.config.defaultLanguage,
    });
    const results = (json.results as Record<string, unknown>[] | undefined) ?? [];
    return results.map((r) => toGeocodeResult(r));
  }

  async reverseGeocode(input: Coordinates): Promise<AddressResult> {
    const json = await this.get("geocode", {
      latlng: `${input.latitude},${input.longitude}`,
      language: this.config.defaultLanguage,
    });
    const results = (json.results as Record<string, unknown>[] | undefined) ?? [];
    const first = results[0];
    if (!first) return { formattedAddress: "", placeId: null };
    return { formattedAddress: String(first.formatted_address ?? ""), placeId: (first.place_id as string) ?? null };
  }

  async getDirections(input: DirectionsInput): Promise<DirectionsResult> {
    const json = await this.get("directions", {
      origin: `${input.origin.latitude},${input.origin.longitude}`,
      destination: `${input.destination.latitude},${input.destination.longitude}`,
      departure_time: String(Math.floor((input.departAt ?? new Date()).getTime() / 1000)),
      region: this.config.defaultRegion,
    });
    const route = (json.routes as Record<string, unknown>[] | undefined)?.[0];
    const leg = (route?.legs as Record<string, unknown>[] | undefined)?.[0];
    if (!leg) throw new MapsProviderError(this.name, "Google Maps returned no route for this pair of coordinates.");

    const distance = leg.distance as { value?: number } | undefined;
    const duration = leg.duration as { value?: number } | undefined;
    const durationInTraffic = leg.duration_in_traffic as { value?: number } | undefined;

    return {
      distanceMeters: distance?.value ?? 0,
      durationSeconds: duration?.value ?? 0,
      durationInTrafficSeconds: durationInTraffic?.value ?? null,
      polyline: (route?.overview_polyline as { points?: string } | undefined)?.points ?? null,
    };
  }

  async getDistanceMatrix(input: DistanceMatrixInput): Promise<DistanceMatrixResult> {
    const json = await this.get("distancematrix", {
      origins: input.origins.map((o) => `${o.latitude},${o.longitude}`).join("|"),
      destinations: input.destinations.map((d) => `${d.latitude},${d.longitude}`).join("|"),
      region: this.config.defaultRegion,
    });
    const rows = (json.rows as Record<string, unknown>[] | undefined) ?? [];
    return {
      rows: rows.map((row) =>
        ((row.elements as Record<string, unknown>[] | undefined) ?? []).map((el): DistanceMatrixElement => {
          const status = String(el.status ?? "NOT_FOUND");
          if (status !== "OK") return { distanceMeters: null, durationSeconds: null, status: status === "ZERO_RESULTS" ? "ZERO_RESULTS" : "NOT_FOUND" };
          return {
            distanceMeters: (el.distance as { value?: number } | undefined)?.value ?? null,
            durationSeconds: (el.duration as { value?: number } | undefined)?.value ?? null,
            status: "OK",
          };
        })
      ),
    };
  }

  async searchPlaces(input: PlaceSearchInput): Promise<PlaceResult[]> {
    const params: Record<string, string> = {
      input: input.query,
      components: `country:${(input.region ?? this.config.defaultRegion).toLowerCase()}`,
      language: this.config.defaultLanguage,
    };
    if (input.near) {
      params.location = `${input.near.latitude},${input.near.longitude}`;
      params.radius = "30000"; // 30km bias, not a hard restriction
    }
    const json = await this.get("place/autocomplete", params);
    const predictions = (json.predictions as Record<string, unknown>[] | undefined) ?? [];
    return predictions.map((p) => ({ placeId: String(p.place_id ?? ""), description: String(p.description ?? "") }));
  }

  /** Read-only connectivity check - a single cheap geocode of a well-known, fixed Delhi landmark. Never sends a real user query or exposes the key. */
  async getDiagnostics(): Promise<MapsDiagnosticsResult> {
    if (!this.config.serverApiKey) {
      return { ok: false, details: { provider: "GOOGLE", error: "GOOGLE_MAPS_SERVER_API_KEY is not configured" } };
    }
    try {
      const results = await this.geocode({ query: "India Gate, New Delhi", region: this.config.defaultRegion });
      if (results.length === 0) {
        return { ok: false, details: { provider: "GOOGLE", geocodingStatus: "error", error: "No results for the diagnostic query" } };
      }
      return { ok: true, details: { provider: "GOOGLE", geocodingStatus: "ok", defaultRegion: this.config.defaultRegion } };
    } catch (err) {
      return { ok: false, details: { provider: "GOOGLE", geocodingStatus: "error", error: err instanceof Error ? err.message : "Request failed" } };
    }
  }
}

function toGeocodeResult(r: Record<string, unknown>): GeocodeResult {
  const geometry = r.geometry as { location?: { lat?: number; lng?: number }; location_type?: string } | undefined;
  const location = geometry?.location;
  return {
    formattedAddress: String(r.formatted_address ?? ""),
    placeId: String(r.place_id ?? ""),
    location: { latitude: location?.lat ?? 0, longitude: location?.lng ?? 0 },
    isPreciseMatch: PRECISE_LOCATION_TYPES.has(String(geometry?.location_type ?? "")),
  };
}
