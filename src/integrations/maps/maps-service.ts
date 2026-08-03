import { loadMapsConfig } from "./maps-config";
import { GoogleMapsProvider } from "./google-maps-provider";
import { DisabledMapsProvider } from "./disabled-maps-provider";
import type { MapsProvider } from "./maps-types";

let cachedProvider: MapsProvider | null = null;

/**
 * Resolves the single active maps provider from environment configuration.
 * Cached per process, mirroring getWhatsAppProvider()/getStorageProvider().
 * Throws MapsConfigError if GOOGLE is selected without an API key.
 */
export function getMapsProvider(): MapsProvider {
  if (cachedProvider) return cachedProvider;

  const config = loadMapsConfig();
  switch (config.provider) {
    case "GOOGLE":
      cachedProvider = new GoogleMapsProvider(config);
      break;
    case "DISABLED":
      cachedProvider = new DisabledMapsProvider();
      break;
  }
  return cachedProvider;
}

/** Test-only: clears the cached provider so tests can re-resolve after changing env vars. */
export function resetMapsProviderCache() {
  cachedProvider = null;
}

export * from "./maps-types";
export * from "./maps-config";
export * from "./maps-errors";
