import "server-only";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/organization";

/**
 * Housing webhook configuration - the only place in the codebase that reads
 * Housing-specific environment variables. Kept out of `src/integrations/property-portals`
 * deliberately: that directory is asserted (see provider-safety.test.ts) to
 * never read a provider credential, because every *other* provider there is
 * contract-only with no live integration. Housing is different - this is a
 * real, inbound-only webhook (Housing calls us, we never call Housing), and
 * every setting below is optional and safe to leave unset.
 */

const CANONICAL_PRODUCTION_URL = "https://crm.kpproperties.co.in";

/** Every request is attributed to this organization; the payload's own data is never trusted for tenancy. */
export function getHousingOrganizationId(): string {
  return process.env.HOUSING_ORGANIZATION_ID?.trim() || DEFAULT_ORGANIZATION_ID;
}

/**
 * Optional shared-secret header check. Housing's documented sample payload
 * carries no authentication, so this is disabled (endpoint stays open) unless
 * an operator explicitly sets HOUSING_WEBHOOK_SECRET - future-proofing without
 * being a hard requirement today.
 */
export function getHousingWebhookSecret(): string | null {
  const value = process.env.HOUSING_WEBHOOK_SECRET?.trim();
  return value ? value : null;
}

/** Optional IP allowlist (comma-separated), same disabled-unless-set behavior as the shared secret. */
export function getHousingAllowedIps(): string[] | null {
  const raw = process.env.HOUSING_ALLOWED_IPS?.trim();
  if (!raw) return null;
  const ips = raw.split(",").map((ip) => ip.trim()).filter(Boolean);
  return ips.length ? ips : null;
}

/**
 * Canonical, publicly quotable webhook URL for documentation/UI display -
 * always the production CRM domain (`crm.kpproperties.co.in`), deliberately
 * never derived from NEXT_PUBLIC_APP_URL/a deployment hostname, so a preview
 * or vercel.app URL can never leak into anything handed to Housing.
 */
export function getHousingWebhookUrl(): string {
  return `${CANONICAL_PRODUCTION_URL}/api/integrations/housing/leads`;
}
