import "server-only";
import type { CanonicalPortalLead } from "./ingestion";
import type { PropertyPortalCapabilities, PropertyPortalProviderId } from "./registry";

/** Official-contract boundary. Implementations must not call undocumented endpoints or automate portals. */
export interface PropertyPortalAdapter {
  readonly provider: PropertyPortalProviderId;
  readonly capabilities: PropertyPortalCapabilities;
  validateConfig(config: unknown): Promise<{ valid: boolean; state: "NOT_CONFIGURED" | "PARTNER_ACCESS_REQUIRED" | "AUTH_FAILED"; reason?: string }>;
  verifyWebhook(request: Request): Promise<{ verified: boolean; reason?: string }>;
  parseLead(payload: unknown): CanonicalPortalLead | null;
  canonicalizeLead(lead: CanonicalPortalLead): CanonicalPortalLead;
  mapProperty(property: unknown): { valid: boolean; preview: Record<string, unknown>; errors: string[] };
  publishListing(): Promise<never>;
  updateListing(): Promise<never>;
  deactivateListing(): Promise<never>;
  fetchLeads(): Promise<never>;
  healthCheck(): Promise<{ state: "PARTNER_ACCESS_REQUIRED" }>;
}
