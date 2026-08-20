import "server-only";
import { prisma } from "./prisma";

/**
 * Deliberately NOT the ApiError class from ./api-auth - that module (via
 * ./auth) pulls in the full NextAuth stack, and organization.ts is
 * imported by ~180 modules across the codebase, many of them far from any
 * request/session context (analytics, background jobs, plain unit tests
 * for those). Importing ApiError here would drag NextAuth into all of
 * them. handleApiError() in ./api-auth duck-types on `status` for exactly
 * this reason, so this still turns into the correct 401 response.
 */
class OrganizationResolutionError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
  }
}

/**
 * Historically the single seeded organization every request resolved to
 * (see git history of this file). Kept only as: (a) the literal fallback
 * inside getSystemOrganizationId() for trusted, non-interactive contexts
 * that have no per-org configuration set, and (b) what demo/seed/test
 * fixtures attach their rows to. It must NEVER be used as a fallback for
 * an authenticated interactive request - see getOrganizationId() below,
 * which fails closed instead.
 */
export const DEFAULT_ORGANIZATION_ID = "org_default";

type SessionUserLike = { organizationId?: string | null } | null | undefined;

/**
 * Canonical, fail-closed resolver of "which organization is this
 * INTERACTIVE (session-based) request for".
 *
 * organizationId now travels on the Auth.js session itself
 * (session.user.organizationId - see src/lib/auth.ts), sourced from the
 * User row's own organizationId column and re-verified on every request by
 * the same per-request DB check that already revalidates role/authVersion
 * (src/lib/session-guard.ts) - so reading it here costs no additional
 * query. Pass the session's `user` object (not just its `id`) - a client
 * can never influence this value; it is never accepted from a query
 * param, request body, or route id.
 *
 * Throws instead of silently defaulting: an authenticated user with no
 * valid organization association must never fall through to another
 * tenant's data.
 */
export function getOrganizationId(sessionUser: SessionUserLike): string {
  const organizationId = sessionUser?.organizationId;
  if (!organizationId) {
    throw new OrganizationResolutionError("Your account is not associated with an organization. Contact an administrator.");
  }
  return organizationId;
}

/**
 * For internal/library code that only has a bare user id in hand (e.g. an
 * actorId recorded on a background write) and no session object to read
 * organizationId off of directly. Does one indexed lookup - prefer
 * getOrganizationId(session.user) wherever a session is already available;
 * this exists for the minority of call sites where it genuinely isn't.
 * Fails closed, same as getOrganizationId().
 */
export async function resolveOrganizationIdForUser(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
  if (!user?.organizationId) {
    throw new OrganizationResolutionError("User not found or has no organization.");
  }
  return user.organizationId;
}

/**
 * For TRUSTED, NON-INTERACTIVE system contexts that have no user session at
 * all - this app's own internal cron/background jobs (e.g. the
 * notification sweep). Organization identity here comes from server-side
 * configuration only, never a session and never client input. Distinct
 * from an external integration's own resolver (e.g.
 * src/integrations/housing/config.ts getHousingOrganizationId(), which
 * reads its own HOUSING_ORGANIZATION_ID env var) - this is the generic
 * "run as the system's configured organization" resolver for jobs that
 * aren't tied to one specific external integration. Falls back to
 * DEFAULT_ORGANIZATION_ID only because this product runs a single
 * organization in practice today; set SYSTEM_ORGANIZATION_ID explicitly
 * once that's no longer true.
 *
 * INVARIANT - every current caller (the notification-sweep cron, the
 * WhatsApp Meta webhook, mock-portal webhook lead ingestion) is, and must
 * remain, a SINGLE-ORGANIZATION job: the whole deployment has exactly one
 * WhatsApp provider config and one set of portal integrations, so there is
 * only ever one correct org for these jobs to run as - the fallback to
 * org_default is safe because it can never be one org among several that
 * silently absorbs another org's activity. This function must NEVER be
 * used by a job that logically needs to act across multiple organizations
 * (e.g. a future scheduled job that sweeps every tenant). Such a job must
 * NOT call this and silently process only org_default - it must instead
 * enumerate `Organization` rows explicitly (`prisma.organization.findMany()`)
 * and run its logic once per org with that org's own id, or take an
 * explicit trusted tenant context per invocation. Do not add a new
 * multi-org iteration path here "for convenience" - if one is ever
 * genuinely needed, it belongs in the caller, not folded into this
 * single-org resolver.
 */
export function getSystemOrganizationId(): string {
  return process.env.SYSTEM_ORGANIZATION_ID?.trim() || DEFAULT_ORGANIZATION_ID;
}
