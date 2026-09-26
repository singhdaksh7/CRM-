/**
 * Permanent boundary between the retired Demand Pool workspace and the
 * still-active property matching workflow.
 *
 * Retired (HTTP 410): the customer-contact workspace under `/api/customers`,
 * including customer requirements, contact import, analytics, and
 * requirement-to-lead conversion. Those pages redirect to Leads.
 *
 * Still active, and therefore not retired here:
 * - GET/POST `/api/properties/:id/matches` (Best Matching Leads)
 * - POST `/api/recommendations/:id/prepare|mark-sent|respond`
 *   (explicit employee lifecycle; each route enforces its own session,
 *   role, and organization checks)
 *
 * Historical module names (`demand-pool`, `demand-recommendations`) are not
 * a reason to block those routes. Unknown `/api/recommendations` paths are
 * left to the router (404) rather than blanket-retired, so a future
 * authorized matching route is not silently disabled the way property
 * matches were.
 */
export function isRetiredDemandPoolApi(pathname: string): boolean {
  return pathname === "/api/customers" || pathname.startsWith("/api/customers/");
}
