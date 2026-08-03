import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadMapsConfig, getMapsConfigStatus } from "./maps-config";
import { MapsConfigError } from "./maps-errors";

const ENV_KEYS = [
  "MAPS_PROVIDER",
  "GOOGLE_MAPS_SERVER_API_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY",
  "GOOGLE_MAPS_MAP_ID",
  "GOOGLE_MAPS_DEFAULT_REGION",
  "GOOGLE_MAPS_DEFAULT_LANGUAGE",
  "GOOGLE_MAPS_DEFAULT_CITY",
] as const;

let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

describe("loadMapsConfig", () => {
  it("defaults to DISABLED when MAPS_PROVIDER is unset", () => {
    expect(loadMapsConfig().provider).toBe("DISABLED");
  });

  it("is case-insensitive", () => {
    process.env.MAPS_PROVIDER = "google";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "key";
    expect(loadMapsConfig().provider).toBe("GOOGLE");
  });

  it("throws MapsConfigError for an unknown provider name", () => {
    process.env.MAPS_PROVIDER = "MAPBOX";
    expect(() => loadMapsConfig()).toThrow(MapsConfigError);
  });

  it("throws MapsConfigError when GOOGLE is selected without a server key", () => {
    process.env.MAPS_PROVIDER = "GOOGLE";
    expect(() => loadMapsConfig()).toThrow(/GOOGLE_MAPS_SERVER_API_KEY/);
  });

  it("succeeds when GOOGLE has a server key, with sensible defaults", () => {
    process.env.MAPS_PROVIDER = "GOOGLE";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "key";
    const config = loadMapsConfig();
    expect(config.defaultRegion).toBe("IN");
    expect(config.defaultLanguage).toBe("en");
    expect(config.defaultCity).toBe("Delhi");
  });

  it("respects overridden defaults", () => {
    process.env.MAPS_PROVIDER = "GOOGLE";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "key";
    process.env.GOOGLE_MAPS_DEFAULT_REGION = "US";
    expect(loadMapsConfig().defaultRegion).toBe("US");
  });
});

describe("getMapsConfigStatus", () => {
  it("never leaks the actual key value, only presence", () => {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "super-secret-key";
    const status = getMapsConfigStatus();
    expect(status.serverKey).toBe("configured");
    expect(JSON.stringify(status)).not.toContain("super-secret-key");
  });

  it("reports missing for unset keys", () => {
    const status = getMapsConfigStatus();
    expect(status.serverKey).toBe("missing");
    expect(status.browserKey).toBe("missing");
    expect(status.googleReady).toBe(false);
  });

  it("falls back to DISABLED in the status snapshot for an unknown provider, instead of throwing", () => {
    process.env.MAPS_PROVIDER = "MAPBOX";
    expect(getMapsConfigStatus().provider).toBe("DISABLED");
  });

  it("googleReady is true only once GOOGLE is selected and the server key is present", () => {
    process.env.MAPS_PROVIDER = "GOOGLE";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "key";
    expect(getMapsConfigStatus().googleReady).toBe(true);
  });
});
