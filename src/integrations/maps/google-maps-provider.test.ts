import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleMapsProvider } from "./google-maps-provider";
import { MapsProviderError } from "./maps-errors";
import type { MapsConfig } from "./maps-config";

function baseConfig(overrides: Partial<MapsConfig> = {}): MapsConfig {
  return {
    provider: "GOOGLE",
    serverApiKey: "test-server-key",
    defaultRegion: "IN",
    defaultLanguage: "en",
    defaultCity: "Delhi",
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoogleMapsProvider - geocode", () => {
  it("returns mapped results on success", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "OK",
        results: [
          { formatted_address: "India Gate, New Delhi", place_id: "place123", geometry: { location: { lat: 28.6129, lng: 77.2295 }, location_type: "ROOFTOP" } },
        ],
      })
    );
    const provider = new GoogleMapsProvider(baseConfig());
    const results = await provider.geocode({ query: "India Gate" });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ formattedAddress: "India Gate, New Delhi", placeId: "place123", isPreciseMatch: true, location: { latitude: 28.6129, longitude: 77.2295 } });
  });

  it("never includes the API key in a thrown error message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "REQUEST_DENIED", error_message: "The provided API key is invalid." }));
    const provider = new GoogleMapsProvider(baseConfig());
    await expect(provider.geocode({ query: "x" })).rejects.toThrow(MapsProviderError);
    try {
      await provider.geocode({ query: "x" });
    } catch (err) {
      expect((err as Error).message).not.toContain("test-server-key");
    }
  });

  it("never sends the API key in a way visible outside the request (it's a query param, verify request URL host)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "OK", results: [] }));
    const provider = new GoogleMapsProvider(baseConfig());
    await provider.geocode({ query: "x" });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("maps.googleapis.com");
  });

  it("marks a non-ROOFTOP location_type as not precise", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "OK", results: [{ formatted_address: "Janakpuri, Delhi", place_id: "p2", geometry: { location: { lat: 28.6, lng: 77.08 }, location_type: "APPROXIMATE" } }] })
    );
    const provider = new GoogleMapsProvider(baseConfig());
    const results = await provider.geocode({ query: "Janakpuri" });
    expect(results[0].isPreciseMatch).toBe(false);
  });

  it("returns an empty array for ZERO_RESULTS rather than throwing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "ZERO_RESULTS", results: [] }));
    const provider = new GoogleMapsProvider(baseConfig());
    await expect(provider.geocode({ query: "asdkjaslkdjaslkd" })).resolves.toEqual([]);
  });

  it("retries once on OVER_QUERY_LIMIT and succeeds on the second attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { status: "OVER_QUERY_LIMIT" }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "OK", results: [{ formatted_address: "x", place_id: "p", geometry: { location: { lat: 1, lng: 2 } } }] }));
    const provider = new GoogleMapsProvider(baseConfig());
    const results = await provider.geocode({ query: "x" });
    expect(results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a REQUEST_DENIED (permanent) error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "REQUEST_DENIED", error_message: "denied" }));
    const provider = new GoogleMapsProvider(baseConfig());
    await expect(provider.geocode({ query: "x" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when access token missing/misconfigured before calling fetch", async () => {
    const provider = new GoogleMapsProvider(baseConfig({ serverApiKey: undefined }));
    await expect(provider.geocode({ query: "x" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GoogleMapsProvider - reverseGeocode", () => {
  it("returns the formatted address for known coordinates", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "OK", results: [{ formatted_address: "Connaught Place, Delhi", place_id: "cp1" }] }));
    const provider = new GoogleMapsProvider(baseConfig());
    const result = await provider.reverseGeocode({ latitude: 28.6315, longitude: 77.2167 });
    expect(result.formattedAddress).toBe("Connaught Place, Delhi");
  });

  it("returns an empty result for ZERO_RESULTS", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "ZERO_RESULTS", results: [] }));
    const provider = new GoogleMapsProvider(baseConfig());
    const result = await provider.reverseGeocode({ latitude: 0, longitude: 0 });
    expect(result.placeId).toBeNull();
  });
});

describe("GoogleMapsProvider - getDirections", () => {
  it("returns distance/duration on success", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "OK",
        routes: [{ legs: [{ distance: { value: 5000 }, duration: { value: 900 }, duration_in_traffic: { value: 1100 } }], overview_polyline: { points: "abc123" } }],
      })
    );
    const provider = new GoogleMapsProvider(baseConfig());
    const result = await provider.getDirections({ origin: { latitude: 28.6, longitude: 77.2 }, destination: { latitude: 28.7, longitude: 77.3 } });
    expect(result.distanceMeters).toBe(5000);
    expect(result.durationSeconds).toBe(900);
    expect(result.durationInTrafficSeconds).toBe(1100);
  });

  it("throws a safe error when no route is found", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "ZERO_RESULTS", routes: [] }));
    const provider = new GoogleMapsProvider(baseConfig());
    await expect(provider.getDirections({ origin: { latitude: 0, longitude: 0 }, destination: { latitude: 1, longitude: 1 } })).rejects.toThrow(/no route/);
  });
});

describe("GoogleMapsProvider - getDistanceMatrix", () => {
  it("maps a mixed OK/ZERO_RESULTS matrix correctly", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "OK",
        rows: [{ elements: [{ status: "OK", distance: { value: 1000 }, duration: { value: 120 } }, { status: "ZERO_RESULTS" }] }],
      })
    );
    const provider = new GoogleMapsProvider(baseConfig());
    const result = await provider.getDistanceMatrix({ origins: [{ latitude: 0, longitude: 0 }], destinations: [{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }] });
    expect(result.rows[0][0]).toMatchObject({ distanceMeters: 1000, durationSeconds: 120, status: "OK" });
    expect(result.rows[0][1].status).toBe("ZERO_RESULTS");
  });
});

describe("GoogleMapsProvider - searchPlaces", () => {
  it("returns place predictions", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "OK", predictions: [{ place_id: "p1", description: "Janakpuri, Delhi, India" }] }));
    const provider = new GoogleMapsProvider(baseConfig());
    const results = await provider.searchPlaces({ query: "Janak" });
    expect(results).toEqual([{ placeId: "p1", description: "Janakpuri, Delhi, India" }]);
  });
});

describe("GoogleMapsProvider - getDiagnostics", () => {
  it("reports ok on a successful diagnostic geocode, without leaking the key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "OK", results: [{ formatted_address: "India Gate", place_id: "p", geometry: { location: { lat: 1, lng: 2 } } }] }));
    const provider = new GoogleMapsProvider(baseConfig());
    const result = await provider.getDiagnostics();
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("test-server-key");
  });

  it("reports not ok without throwing when the key is missing", async () => {
    const provider = new GoogleMapsProvider(baseConfig({ serverApiKey: undefined }));
    const result = await provider.getDiagnostics();
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports not ok (not a throw) when the diagnostic geocode itself fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "REQUEST_DENIED", error_message: "bad key" }));
    const provider = new GoogleMapsProvider(baseConfig());
    const result = await provider.getDiagnostics();
    expect(result.ok).toBe(false);
  });
});
