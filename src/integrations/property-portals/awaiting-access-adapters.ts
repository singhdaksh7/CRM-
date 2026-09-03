import "server-only";
import type { PropertyPortalAdapter } from "./adapter";
import { propertyPortalRegistry, type PropertyPortalProviderId } from "./registry";
import type { CanonicalPortalLead } from "./ingestion";

function awaitingAccessAdapter(provider: Exclude<PropertyPortalProviderId, "HOUSING">): PropertyPortalAdapter {
  return {
    provider,
    capabilities: propertyPortalRegistry[provider],
    normalizeLead(lead: CanonicalPortalLead) { return lead; },
  };
}

const AWAITING_ACCESS_PROVIDERS = ["OLX", "MAGICBRICKS", "NINETY_NINE_ACRES", "META", "OTHER"] as const;
export const awaitingAccessAdapters = AWAITING_ACCESS_PROVIDERS.map((provider) => awaitingAccessAdapter(provider));
