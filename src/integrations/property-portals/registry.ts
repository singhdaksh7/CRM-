import "server-only";

export const PROPERTY_PORTAL_PROVIDERS = ["HOUSING", "OLX", "MAGICBRICKS", "NINETY_NINE_ACRES", "META", "OTHER"] as const;
export type PropertyPortalProviderId = (typeof PROPERTY_PORTAL_PROVIDERS)[number];
/** Evidence-based capability state. UNKNOWN deliberately does not mean unsupported. */
export type PortalCapabilityState = "SUPPORTED" | "UNSUPPORTED" | "UNKNOWN";
/** Legacy listing-workflow status retained until its persisted enum is migrated. */
export type CapabilityStatus = "AVAILABLE" | "CONFIGURATION_REQUIRED" | "PARTNER_ACCESS_REQUIRED" | "NOT_SUPPORTED" | "UNKNOWN";

export interface PropertyPortalCapabilities {
  leadWebhook: PortalCapabilityState;
  leadPull: PortalCapabilityState;
  emailIngestion: PortalCapabilityState;
  listingPush: PortalCapabilityState;
  listingPull: PortalCapabilityState;
  connectionTest: PortalCapabilityState;
  // Kept as aliases while the existing listing workflow consumes these names.
  supportsLeadWebhook: CapabilityStatus;
  supportsLeadPull: CapabilityStatus;
  supportsListingPublish: CapabilityStatus;
  supportsListingUpdate: CapabilityStatus;
  supportsListingDeactivate: CapabilityStatus;
}

/**
 * Contract-only registry: no endpoints, browser automation, or scraping - the
 * portal never receives an outbound call from this app. The sole exception is
 * HOUSING's `supportsLeadWebhook`: Housing pushes leads to
 * `/api/integrations/housing/leads` (this app never calls out to Housing),
 * so that inbound capability is genuinely implemented and live, unlike every
 * other capability below which still requires an authorized partner
 * integration that does not exist yet.
 */
export const propertyPortalRegistry: Record<PropertyPortalProviderId, PropertyPortalCapabilities> = Object.fromEntries(
  PROPERTY_PORTAL_PROVIDERS.map((provider) => [provider, {
    leadWebhook: provider === "HOUSING" ? "SUPPORTED" : "UNKNOWN",
    leadPull: "UNKNOWN",
    emailIngestion: "UNKNOWN",
    listingPush: "UNKNOWN",
    listingPull: "UNKNOWN",
    connectionTest: "UNKNOWN",
    supportsLeadWebhook: provider === "HOUSING" ? "AVAILABLE" : "PARTNER_ACCESS_REQUIRED",
    supportsLeadPull: "PARTNER_ACCESS_REQUIRED",
    supportsListingPublish: "PARTNER_ACCESS_REQUIRED",
    supportsListingUpdate: "PARTNER_ACCESS_REQUIRED",
    supportsListingDeactivate: "PARTNER_ACCESS_REQUIRED",
  }])
) as Record<PropertyPortalProviderId, PropertyPortalCapabilities>;

export function canPublish(capabilities: PropertyPortalCapabilities) {
  return capabilities.supportsListingPublish === "AVAILABLE";
}

export function providerReadiness(provider: PropertyPortalProviderId) {
  return provider === "HOUSING" ? "CONNECTED_WEBHOOK" : "AWAITING_PROVIDER_ACCESS" as const;
}
