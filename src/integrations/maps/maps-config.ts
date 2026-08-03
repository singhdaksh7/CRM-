import { MapsConfigError } from "./maps-errors";
import type { MapsProviderName } from "./maps-types";

/**
 * Server-only. Never import this module from a "use client" component -
 * GOOGLE_MAPS_SERVER_API_KEY must never reach the browser bundle. The
 * browser-side key (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY) is separate,
 * intentionally public, and must be domain-restricted in the Google Cloud
 * console - see GOOGLE_MAPS_SETUP.md.
 */

export interface MapsConfig {
  provider: MapsProviderName;
  serverApiKey?: string;
  mapId?: string;
  defaultRegion: string;
  defaultLanguage: string;
  defaultCity: string;
}

function resolveProviderName(): MapsProviderName {
  const raw = (process.env.MAPS_PROVIDER ?? "DISABLED").toUpperCase();
  if (raw === "GOOGLE" || raw === "DISABLED") return raw;
  throw new MapsConfigError(`Unknown MAPS_PROVIDER "${raw}". Expected GOOGLE or DISABLED.`);
}

/** Reads env vars and validates them. Throws MapsConfigError with a clear message if GOOGLE is selected but incomplete. */
export function loadMapsConfig(): MapsConfig {
  const provider = resolveProviderName();
  const config: MapsConfig = {
    provider,
    serverApiKey: process.env.GOOGLE_MAPS_SERVER_API_KEY,
    mapId: process.env.GOOGLE_MAPS_MAP_ID,
    defaultRegion: process.env.GOOGLE_MAPS_DEFAULT_REGION || "IN",
    defaultLanguage: process.env.GOOGLE_MAPS_DEFAULT_LANGUAGE || "en",
    defaultCity: process.env.GOOGLE_MAPS_DEFAULT_CITY || "Delhi",
  };

  if (provider === "GOOGLE" && !config.serverApiKey) {
    throw new MapsConfigError("MAPS_PROVIDER=GOOGLE requires GOOGLE_MAPS_SERVER_API_KEY. Set it in your environment, or switch MAPS_PROVIDER to DISABLED for local development.");
  }

  return config;
}

/** Non-secret status snapshot for the Settings UI - never includes actual key values. */
export function getMapsConfigStatus() {
  const provider = (() => {
    try {
      return resolveProviderName();
    } catch {
      return "DISABLED" as const;
    }
  })();

  const presence = (v: string | undefined): "configured" | "missing" => (v ? "configured" : "missing");

  return {
    provider,
    serverKey: presence(process.env.GOOGLE_MAPS_SERVER_API_KEY),
    browserKey: presence(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY),
    mapId: presence(process.env.GOOGLE_MAPS_MAP_ID),
    defaultRegion: process.env.GOOGLE_MAPS_DEFAULT_REGION || "IN",
    defaultLanguage: process.env.GOOGLE_MAPS_DEFAULT_LANGUAGE || "en",
    defaultCity: process.env.GOOGLE_MAPS_DEFAULT_CITY || "Delhi",
    googleReady: provider === "GOOGLE" && Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY),
  };
}
