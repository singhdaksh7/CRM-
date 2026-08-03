import { getMapsProvider, loadMapsConfig } from "@/integrations/maps";

export interface MapsCapabilitiesDTO {
  provider: "GOOGLE" | "DISABLED";
  configured: boolean;
  browserKeyConfigured: boolean;
  defaultRegion: string;
  defaultLanguage: string;
  defaultCity: string;
}

/** Safe, non-sensitive capability DTO - separated from the route handler so it's testable without pulling in next-auth. Never includes the server or browser key values themselves. */
export function getMapsCapabilitiesDTO(): MapsCapabilitiesDTO {
  const provider = getMapsProvider().name;
  const config = loadMapsConfig();
  return {
    provider,
    configured: provider !== "DISABLED",
    browserKeyConfigured: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY),
    defaultRegion: config.defaultRegion,
    defaultLanguage: config.defaultLanguage,
    defaultCity: config.defaultCity,
  };
}
