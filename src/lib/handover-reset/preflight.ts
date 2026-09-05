import { HANDOVER_ADMIN_EMAIL, HANDOVER_ORGANIZATION_ID } from "./constants";
import { extractSafeHost, checkSchemaIdentity, type SchemaSanityClient } from "./db-identity";
import { getAppliedMigrationCount, getExpectedMigrationCountFromDisk, type MigrationCountClient } from "./migrations";
import type { CheckResult, PortalConnectionSummary, PreflightResult } from "./types";

export interface PreflightClient extends MigrationCountClient, SchemaSanityClient {
  organization: { findUnique(args: { where: { id: string } }): Promise<{ id: string } | null> };
  user: {
    findUnique(args: {
      where: { email: string };
    }): Promise<{ id: string; email: string; role: string; status: string; organizationId: string } | null>;
    count(args: unknown): Promise<number>;
  };
  propertyPortalConnection: {
    findMany(args: unknown): Promise<
      {
        id: string;
        provider: string;
        status: string;
        connectionMode: string;
        displayName: string | null;
        credentialReference: string | null;
      }[]
    >;
  };
}

export interface PreflightOptions {
  /** Overridable for tests only - production callers always let this default to reading prisma/migrations/ off disk. */
  migrationsDir?: string;
  databaseUrl?: string;
}

/**
 * Fail-closed preflight for `--execute`. Every check below runs (nothing
 * short-circuits on the first failure) so a single dry-run/preflight report
 * shows every problem at once rather than one-at-a-time across repeated
 * runs. `passed` is true only if every single check passed - executeReset()
 * in reset.ts refuses to write anything unless this is true.
 */
export async function runPreflight(client: PreflightClient, options: PreflightOptions = {}): Promise<PreflightResult> {
  const checks: CheckResult[] = [];
  const resolvedHost = extractSafeHost(options.databaseUrl ?? process.env.DATABASE_URL);

  // --- Database identity sanity check -------------------------------------
  let schemaIdentityPassed = false;
  try {
    const identity = await checkSchemaIdentity(client);
    schemaIdentityPassed = identity.passed;
    checks.push({
      name: "Database identity sanity check",
      passed: identity.passed,
      detail: identity.passed
        ? "Core tables (organizations, users, properties, leads, _prisma_migrations) all present."
        : `Missing expected core table(s): ${identity.missingTables.join(", ")}. This does not look like this project's database.`,
    });
  } catch (error) {
    checks.push({
      name: "Database identity sanity check",
      passed: false,
      detail: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // --- Organization exists --------------------------------------------------
  let organizationExists = false;
  try {
    const org = await client.organization.findUnique({ where: { id: HANDOVER_ORGANIZATION_ID } });
    organizationExists = org !== null;
    checks.push({
      name: "Organization org_default exists",
      passed: organizationExists,
      detail: organizationExists ? `Found organization "${HANDOVER_ORGANIZATION_ID}".` : `Organization "${HANDOVER_ORGANIZATION_ID}" not found.`,
    });
  } catch (error) {
    checks.push({
      name: "Organization org_default exists",
      passed: false,
      detail: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // --- Handover admin: exists, ACTIVE, ADMIN, org_default --------------------
  let handoverAdminId: string | null = null;
  try {
    const admin = await client.user.findUnique({ where: { email: HANDOVER_ADMIN_EMAIL } });
    const valid = !!admin && admin.role === "ADMIN" && admin.status === "ACTIVE" && admin.organizationId === HANDOVER_ORGANIZATION_ID;
    handoverAdminId = valid && admin ? admin.id : null;
    checks.push({
      name: "Handover admin verified",
      passed: valid,
      detail: !admin
        ? `No user found with email ${HANDOVER_ADMIN_EMAIL}.`
        : valid
          ? `Verified ${HANDOVER_ADMIN_EMAIL} - role=ADMIN, status=ACTIVE, organizationId=${HANDOVER_ORGANIZATION_ID}.`
          : `${HANDOVER_ADMIN_EMAIL} exists but failed verification (role=${admin.role}, status=${admin.status}, organizationId=${admin.organizationId}).`,
    });
  } catch (error) {
    checks.push({
      name: "Handover admin verified",
      passed: false,
      detail: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // --- Migration count matches expected -------------------------------------
  let expectedMigrationCount = 0;
  let appliedMigrationCount: number | null = null;
  try {
    expectedMigrationCount = getExpectedMigrationCountFromDisk(options.migrationsDir);
    appliedMigrationCount = await getAppliedMigrationCount(client);
    const matches = expectedMigrationCount === appliedMigrationCount;
    checks.push({
      name: "Migration count matches",
      passed: matches,
      detail: matches
        ? `${appliedMigrationCount} migrations applied, matching ${expectedMigrationCount} found on disk.`
        : `Mismatch: ${appliedMigrationCount} applied vs ${expectedMigrationCount} found on disk (prisma/migrations/). Refusing to proceed - this database's schema may not match this codebase.`,
    });
  } catch (error) {
    checks.push({
      name: "Migration count matches",
      passed: false,
      detail: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // --- PropertyPortalConnection rows enumerated (never silently ignored) ---
  let portalConnections: PortalConnectionSummary[] = [];
  try {
    const rows = await client.propertyPortalConnection.findMany({
      where: { organizationId: HANDOVER_ORGANIZATION_ID },
      select: { id: true, provider: true, status: true, connectionMode: true, displayName: true, credentialReference: true },
    });
    portalConnections = rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      status: r.status,
      connectionMode: r.connectionMode,
      displayName: r.displayName,
      hasCredentialReference: r.credentialReference != null && r.credentialReference !== "",
    }));
    checks.push({
      name: "PropertyPortalConnection rows enumerated",
      passed: true,
      detail: `Found ${portalConnections.length} row(s). These are never deleted by this tool - always preserved and flagged for manual review.`,
    });
  } catch (error) {
    checks.push({
      name: "PropertyPortalConnection rows enumerated",
      passed: false,
      detail: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  const passed = schemaIdentityPassed && checks.every((c) => c.passed);

  return {
    passed,
    checks,
    resolvedHost,
    organizationExists,
    handoverAdminId,
    expectedMigrationCount,
    appliedMigrationCount,
    portalConnections,
  };
}
