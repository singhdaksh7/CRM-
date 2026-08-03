import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getMapsProvider, resetMapsProviderCache } from "./maps-service";
import { GoogleMapsProvider } from "./google-maps-provider";
import { DisabledMapsProvider } from "./disabled-maps-provider";

let saved: string | undefined;
let savedKey: string | undefined;

beforeEach(() => {
  saved = process.env.MAPS_PROVIDER;
  savedKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  resetMapsProviderCache();
});

afterEach(() => {
  if (saved === undefined) delete process.env.MAPS_PROVIDER;
  else process.env.MAPS_PROVIDER = saved;
  if (savedKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
  else process.env.GOOGLE_MAPS_SERVER_API_KEY = savedKey;
  resetMapsProviderCache();
});

describe("getMapsProvider", () => {
  it("selects Disabled when MAPS_PROVIDER is unset", () => {
    delete process.env.MAPS_PROVIDER;
    expect(getMapsProvider()).toBeInstanceOf(DisabledMapsProvider);
    expect(getMapsProvider().name).toBe("DISABLED");
  });

  it("selects Google when MAPS_PROVIDER=GOOGLE and a key is set", () => {
    process.env.MAPS_PROVIDER = "GOOGLE";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "key";
    expect(getMapsProvider()).toBeInstanceOf(GoogleMapsProvider);
    expect(getMapsProvider().name).toBe("GOOGLE");
  });

  it("is a singleton within the process", () => {
    const first = getMapsProvider();
    const second = getMapsProvider();
    expect(first).toBe(second);
  });

  it("re-selects after the test-only cache reset", () => {
    const first = getMapsProvider();
    resetMapsProviderCache();
    process.env.MAPS_PROVIDER = "GOOGLE";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "key";
    const second = getMapsProvider();
    expect(first).not.toBe(second);
    expect(second).toBeInstanceOf(GoogleMapsProvider);
  });
});

describe("DisabledMapsProvider", () => {
  it("throws MapsConfigError from every data method", async () => {
    const provider = new DisabledMapsProvider();
    await expect(provider.geocode({ query: "x" })).rejects.toThrow();
    await expect(provider.reverseGeocode({ latitude: 0, longitude: 0 })).rejects.toThrow();
    await expect(provider.getDirections({ origin: { latitude: 0, longitude: 0 }, destination: { latitude: 1, longitude: 1 } })).rejects.toThrow();
    await expect(provider.getDistanceMatrix({ origins: [], destinations: [] })).rejects.toThrow();
    await expect(provider.searchPlaces({ query: "x" })).rejects.toThrow();
  });

  it("reports not-ok from getDiagnostics without throwing", async () => {
    const provider = new DisabledMapsProvider();
    const result = await provider.getDiagnostics();
    expect(result.ok).toBe(false);
  });
});
