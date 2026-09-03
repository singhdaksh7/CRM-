import "server-only";
import { registerPortalAdapter, type PropertyPortalAdapter } from "./adapter";
import { propertyPortalRegistry, type PropertyPortalProviderId } from "./registry";
import type { CanonicalPortalLead } from "./ingestion";

function awaitingAccessAdapter(provider: Exclude<PropertyPortalProviderId, "HOUSING">): PropertyPortalAdapter {
  return {
    provider,
    capabilities: propertyPortalRegistry[provider],
    normalizeLead(lead: CanonicalPortalLead) { return lead; },
  };
}

for (const provider of ["OLX", "MAGICBRICKS", "NINETY_NINE_ACRES", "META", "OTHER"] as const) {
  registerPortalAdapter(awaitingAccessAdapter(provider));
}
