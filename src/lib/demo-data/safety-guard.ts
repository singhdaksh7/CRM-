/**
 * Hard stop between this framework and production data.
 *
 * This codebase's local dev DB and its production DB are, at the time this
 * was written, two genuinely different Postgres instances (production is a
 * Supabase project; local dev is docker-compose's postgres service on
 * :5434) - but the only thing standing between "seed the demo dataset" and
 * "insert 400+ fake rows into the live CRM real staff use" is whatever
 * DATABASE_URL happens to be in the environment when the script runs. This
 * guard makes that check automatic and loud instead of relying on whoever
 * runs `npm run seed:demo` to remember to check first.
 *
 * Refuses to run unless the resolved DB host looks like local/dev
 * (localhost/127.0.0.1/docker service name), UNLESS the caller sets
 * DEMO_SEED_ALLOW_REMOTE=true - an explicit, deliberate opt-in for the rare
 * case of a genuinely separate (non-production) hosted staging database.
 * Either way, ALLOW_DEMO_SEED=true must also be set, so a bare `tsx
 * prisma/demo-seed.ts` invocation without the npm script's env can never
 * silently write anything.
 *
 * The known-production-host check below requires BOTH of:
 *   I_UNDERSTAND_THIS_WRITES_DEMO_DATA_TO_PRODUCTION=true
 *   DEMO_SEED_CONFIRMATION=KP_PROPERTIES_DEMO
 * - two independent, deliberately unguessable values (the second is not a
 * generic "true", it names this specific dataset, so it can't be copy-
 * pasted from an unrelated script/template by accident). Neither is set by
 * accident. This exists because a real conversation happened where the
 * operator, after being told exactly what would leak into which real
 * screens (property list, dashboard revenue, role notifications),
 * explicitly chose to proceed anyway for a client demo. It does not make
 * that leakage stop happening - it only removes the automatic refusal.
 */

const KNOWN_PRODUCTION_HOST_FRAGMENTS = ["supabase.co", "supabase.com", "pooler.supabase.com"];
const LOCAL_HOST_FRAGMENTS = ["localhost", "127.0.0.1", "::1", "postgres:5432", "postgres:5434"];
export const REQUIRED_DEMO_SEED_CONFIRMATION = "KP_PROPERTIES_DEMO";

export interface SafetyCheckResult {
  allowed: boolean;
  reason: string;
  resolvedHost: string;
}

function extractHost(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return url.hostname;
  } catch {
    return "unparseable";
  }
}

export function checkDemoSeedSafety(env: NodeJS.ProcessEnv = process.env): SafetyCheckResult {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    return { allowed: false, reason: "DATABASE_URL is not set - refusing to run.", resolvedHost: "none" };
  }

  const host = extractHost(databaseUrl);

  if (env.ALLOW_DEMO_SEED !== "true") {
    return {
      allowed: false,
      reason: "ALLOW_DEMO_SEED=true was not set. This script is not runnable by accident - see `npm run seed:demo`.",
      resolvedHost: host,
    };
  }

  const looksProduction = KNOWN_PRODUCTION_HOST_FRAGMENTS.some((f) => host.includes(f));
  const looksLocal = LOCAL_HOST_FRAGMENTS.some((f) => host.includes(f)) || host === "postgres" || host === "db";

  if (looksProduction) {
    const hasUnderstanding = env.I_UNDERSTAND_THIS_WRITES_DEMO_DATA_TO_PRODUCTION === "true";
    const hasConfirmation = env.DEMO_SEED_CONFIRMATION === REQUIRED_DEMO_SEED_CONFIRMATION;
    if (!hasUnderstanding || !hasConfirmation) {
      const missing = [
        !hasUnderstanding ? "I_UNDERSTAND_THIS_WRITES_DEMO_DATA_TO_PRODUCTION=true" : null,
        !hasConfirmation ? `DEMO_SEED_CONFIRMATION=${REQUIRED_DEMO_SEED_CONFIRMATION}` : null,
      ].filter(Boolean);
      return {
        allowed: false,
        reason: `DATABASE_URL host "${host}" matches a known production database pattern (Supabase). Point DATABASE_URL at docker-compose's local Postgres instead (see docker-compose.yml, port 5434), or set BOTH of the following to proceed anyway - this will insert demo rows into the live database real staff use, visible in the real property list, dashboard, and notifications: ${missing.join(" AND ")}`,
        resolvedHost: host,
      };
    }
    return { allowed: true, reason: "PRODUCTION OVERRIDE ACKNOWLEDGED - proceeding against a known production host.", resolvedHost: host };
  }

  if (!looksLocal && env.DEMO_SEED_ALLOW_REMOTE !== "true") {
    return {
      allowed: false,
      reason: `DATABASE_URL host "${host}" doesn't look like local/docker Postgres and isn't a recognized production host either. If this is a genuine separate non-production staging DB, set DEMO_SEED_ALLOW_REMOTE=true to proceed.`,
      resolvedHost: host,
    };
  }

  return { allowed: true, reason: "OK", resolvedHost: host };
}

/** Returns the resolved DB host on success (so callers can include it in a preflight banner) or exits the process on failure. */
export function assertDemoSeedSafe(env: NodeJS.ProcessEnv = process.env): string {
  const result = checkDemoSeedSafety(env);
  if (!result.allowed) {
    console.error("\n[demo-seed] BLOCKED\n");
    console.error(`  Resolved DB host: ${result.resolvedHost}`);
    console.error(`  Reason: ${result.reason}\n`);
    process.exit(1);
  }
  if (result.reason.startsWith("PRODUCTION OVERRIDE")) {
    console.warn("\n[demo-seed] !!! WRITING DEMO DATA TO A PRODUCTION HOST !!!");
    console.warn(`  Resolved DB host: ${result.resolvedHost}`);
    console.warn("  This will be visible in the real property list, dashboard/report numbers, and role notifications.");
    console.warn("  Run `npm run seed:remove` afterward to remove it.\n");
    return result.resolvedHost;
  }
  console.log(`[demo-seed] Safety check passed - target host: ${result.resolvedHost}`);
  return result.resolvedHost;
}

export const REQUIRED_DEMO_REMOVE_CONFIRMATION = "DELETE_KP_DEMO_DATA";

/**
 * A separate, destructive-action-specific confirmation for
 * scripts/remove-demo.ts (the CLI path) - independent of the seed script's
 * production-host gate above, and independent of the ADMIN-only dashboard
 * "Delete Demo Data" button (which is gated by session/role + a browser
 * confirm() dialog instead - an env var makes no sense for an authenticated
 * HTTP request). Deleting is generally the safe direction, but this still
 * runs a batch of unconditional deleteMany calls, so a human running the
 * CLI script must type this exact value on purpose, not just rely on
 * whatever ALLOW_DEMO_SEED-style flag happens to already be exported.
 */
export function assertDemoRemoveConfirmed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.DEMO_REMOVE_CONFIRMATION !== REQUIRED_DEMO_REMOVE_CONFIRMATION) {
    console.error("\n[remove-demo] BLOCKED\n");
    console.error(`  DEMO_REMOVE_CONFIRMATION must be set to exactly "${REQUIRED_DEMO_REMOVE_CONFIRMATION}" to run this script.\n`);
    process.exit(1);
  }
}

/**
 * Prints the DB host, organization id, and intended record counts - called
 * after assertDemoSeedSafe() passes but before the first database write
 * (teardownDemoData()), so an operator watching the console sees exactly
 * what is about to happen before anything is touched.
 */
export function printSeedPlan(host: string, organizationId: string, counts: Record<string, number>): void {
  console.log("\n--- Preflight: about to write to ---");
  console.log(`  Database host:   ${host}`);
  console.log(`  Organization id: ${organizationId}`);
  console.log("  Intended record counts:");
  for (const [label, count] of Object.entries(counts)) {
    console.log(`    ${label}: ${count}`);
  }
  console.log("---\n");
}
