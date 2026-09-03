import "server-only";
import type { CanonicalPortalLead } from "./ingestion";
import type { PropertyPortalCapabilities, PropertyPortalProviderId } from "./registry";

/** Official-contract boundary. Implementations must not call undocumented endpoints or automate portals. */
export interface PropertyPortalAdapter {
  readonly provider: PropertyPortalProviderId;
  readonly capabilities: PropertyPortalCapabilities;
  normalizeLead(lead: CanonicalPortalLead): CanonicalPortalLead;
  verifyWebhook?(request: Request): Promise<{ verified: boolean; reason?: string }>;
  parseWebhook?(payload: unknown): CanonicalPortalLead | null;
  fetchLeads?(): Promise<CanonicalPortalLead[]>;
  testConnection?(): Promise<{ success: boolean; checkedAt: Date; message: string }>;
}

/** Central registration point. Adapters without authorized contracts intentionally have no network operations. */
const adapters = new Map<PropertyPortalProviderId, PropertyPortalAdapter>();
export function registerPortalAdapter(adapter: PropertyPortalAdapter) { adapters.set(adapter.provider, adapter); }
export function getPortalAdapter(provider: PropertyPortalProviderId) { return adapters.get(provider); }
