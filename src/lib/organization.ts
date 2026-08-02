/**
 * Single source of truth for "which organization is this request for".
 *
 * The product is single-tenant today (one brokerage), so this always
 * resolves to the seeded default org. Every query that should eventually
 * be tenant-scoped already takes organizationId as a parameter - swapping
 * this for a real lookup (e.g. from session.user.organizationId once users
 * can belong to different orgs) is the only change needed to go multi-tenant.
 */
export const DEFAULT_ORGANIZATION_ID = "org_default";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for the future multi-tenant lookup signature; see comment above
export function getOrganizationId(sessionUserId?: string): string {
  return DEFAULT_ORGANIZATION_ID;
}
