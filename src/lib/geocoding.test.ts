import { describe, it, expect, vi, beforeEach } from "vitest";

const geocode = vi.fn();
const reverseGeocode = vi.fn();
const getDirections = vi.fn();
const getDistanceMatrix = vi.fn();
const searchPlaces = vi.fn();

vi.mock("@/integrations/maps", () => ({
  getMapsProvider: () => ({ geocode, reverseGeocode, getDirections, getDistanceMatrix, searchPlaces }),
  loadMapsConfig: () => ({ defaultRegion: "IN", defaultLanguage: "en", defaultCity: "Delhi" }),
}));

const { geocodeAddressCached, reverseGeocodeCached, getDirectionsCached, getDistanceMatrixCached, searchPlacesValidated, MapsQueryTooShortError } = await import("./geocoding");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("geocodeAddressCached", () => {
  it("rejects a query shorter than the minimum length before calling the provider", async () => {
    await expect(geocodeAddressCached("ab")).rejects.toThrow(MapsQueryTooShortError);
    expect(geocode).not.toHaveBeenCalled();
  });

  it("calls the provider with the default region for a valid query", async () => {
    geocode.mockResolvedValue([{ formattedAddress: "x", placeId: "p", location: { latitude: 1, longitude: 2 }, isPreciseMatch: true }]);
    const results = await geocodeAddressCached("Janakpuri, Delhi");
    expect(results).toHaveLength(1);
    expect(geocode).toHaveBeenCalledWith({ query: "Janakpuri, Delhi", region: "IN" });
  });
});

describe("reverseGeocodeCached", () => {
  it("calls the provider with the given coordinates", async () => {
    reverseGeocode.mockResolvedValue({ formattedAddress: "Connaught Place", placeId: "cp1" });
    const result = await reverseGeocodeCached({ latitude: 28.63, longitude: 77.21 });
    expect(result.formattedAddress).toBe("Connaught Place");
  });
});

describe("getDirectionsCached", () => {
  it("calls the provider and returns its result", async () => {
    getDirections.mockResolvedValue({ distanceMeters: 5000, durationSeconds: 900, durationInTrafficSeconds: 1000, polyline: null });
    const result = await getDirectionsCached({ latitude: 28.6, longitude: 77.2 }, { latitude: 28.7, longitude: 77.3 });
    expect(result.distanceMeters).toBe(5000);
    expect(getDirections).toHaveBeenCalledTimes(1);
  });
});

describe("getDistanceMatrixCached", () => {
  it("calls the provider and returns its result", async () => {
    getDistanceMatrix.mockResolvedValue({ rows: [[{ distanceMeters: 100, durationSeconds: 60, status: "OK" }]] });
    const result = await getDistanceMatrixCached([{ latitude: 0, longitude: 0 }], [{ latitude: 1, longitude: 1 }]);
    expect(result.rows[0][0].status).toBe("OK");
  });
});

describe("searchPlacesValidated", () => {
  it("rejects a query shorter than the minimum length", async () => {
    await expect(searchPlacesValidated("ja")).rejects.toThrow(MapsQueryTooShortError);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it("passes a valid query through to the provider", async () => {
    searchPlaces.mockResolvedValue([{ placeId: "p1", description: "Janakpuri, Delhi" }]);
    const results = await searchPlacesValidated("Janak");
    expect(results).toEqual([{ placeId: "p1", description: "Janakpuri, Delhi" }]);
  });
});
