import "server-only";

export const PROPERTY_PORTAL_PROVIDERS = ["HOUSING", "NINETY_NINE_ACRES", "MAGICBRICKS", "OLX", "SQUARE_CONNECT"] as const;
export type PropertyPortalProviderId = (typeof PROPERTY_PORTAL_PROVIDERS)[number];
export type CapabilityStatus = "AVAILABLE" | "CONFIGURATION_REQUIRED" | "PARTNER_ACCESS_REQUIRED" | "NOT_SUPPORTED" | "UNKNOWN";

export interface PropertyPortalCapabilities {
  supportsLeadWebhook: CapabilityStatus;
  supportsLeadPull: CapabilityStatus;
  supportsListingPublish: CapabilityStatus;
  supportsListingUpdate: CapabilityStatus;
  supportsListingDeactivate: CapabilityStatus;
  supportsListingStatus: CapabilityStatus;
  supportsMedia: CapabilityStatus;
  supportsCommercial: CapabilityStatus;
  supportsResidential: CapabilityStatus;
  supportsRent: CapabilityStatus;
  supportsSale: CapabilityStatus;
}

/** Contract-only registry: no endpoints, browser automation, or scraping. */
export const propertyPortalRegistry: Record<PropertyPortalProviderId, PropertyPortalCapabilities> = Object.fromEntries(
  PROPERTY_PORTAL_PROVIDERS.map((provider) => [provider, {
    supportsLeadWebhook: "PARTNER_ACCESS_REQUIRED",
    supportsLeadPull: "PARTNER_ACCESS_REQUIRED",
    supportsListingPublish: "PARTNER_ACCESS_REQUIRED",
    supportsListingUpdate: "PARTNER_ACCESS_REQUIRED",
    supportsListingDeactivate: "PARTNER_ACCESS_REQUIRED",
    supportsListingStatus: "UNKNOWN",
    supportsMedia: "UNKNOWN",
    supportsCommercial: "UNKNOWN",
    supportsResidential: "UNKNOWN",
    supportsRent: "UNKNOWN",
    supportsSale: "UNKNOWN",
  }])
) as Record<PropertyPortalProviderId, PropertyPortalCapabilities>;

export function canPublish(capabilities: PropertyPortalCapabilities) {
  return capabilities.supportsListingPublish === "AVAILABLE";
}
