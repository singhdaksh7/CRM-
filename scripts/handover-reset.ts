/**
 * One-time handover reset - wipes org_default's demo/test OPERATIONAL data
 * (leads, properties, visits, catalogues, imports, etc.) while preserving
 * schema/migration history, the Organization row itself (branding/config
 * included), SystemConfig, PropertyPortalConnection rows, and exactly one
 * designated admin account.
 *
 * `npm run handover:reset:dry-run`  (default; also runs with no flags at all)
 * `npm run handover:reset:execute -- --confirm=RESET_KP_DEMO_DATA`
 *
 * --dry-run is the default AND the only mode reachable without a fully-
 * correct --execute + --confirm combination - see the flag parsing below.
 * This script never touches R2/Cloudflare - that is a fully separate stage,
 * see scripts/handover-reset-r2-cleanup.ts.
 *
 * SAFETY NOTE: this script is intentionally NOT run as part of this task.
 * It is built and unit-tested (see src/lib/handover-reset/*.test.ts) but
 * never executed here against any real database - see the task's hard
 * constraints. A future, separately-authorized session decides if/when to
 * actually run `--execute` against the real production database.
 */
import { PrismaClient } from "@prisma/client";
import { computeDryRunReport, executeReset, HandoverResetAbortedError, type ResetClient } from "../src/lib/handover-reset/reset";
import { REQUIRED_EXECUTE_CONFIRMATION } from "../src/lib/handover-reset/constants";
import { createHandoverResetExecuteClient } from "../src/lib/handover-reset/direct-client";

interface ParsedArgs {
  mode: "dry-run" | "execute";
  confirm?: string;
}

/**
 * Deliberately fails closed: ANY argv shape other than a clean `--execute
 * --confirm=<exact>` combination (including `--execute` alone, an unknown
 * flag alongside it, or no flags at all) resolves to "dry-run". There is no
 * flag combination that reaches "execute" mode other than exactly these two
 * flags together.
 */
function parseArgs(argv: string[]): ParsedArgs {
  const hasExecute = argv.includes("--execute");
  const hasDryRun = argv.includes("--dry-run");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg ? confirmArg.slice("--confirm=".length) : undefined;
  const recognized = new Set(["--execute", "--dry-run"]);
  const unrecognized = argv.filter((a) => !recognized.has(a) && !a.startsWith("--confirm="));

  // --confirm must be PRESENT (any value) to even attempt execute mode -
  // `--execute` alone always falls back to dry-run. A present-but-wrong
  // value still reaches executeReset() so it can report the exact mismatch
  // (see reset.ts) rather than silently downgrading to dry-run.
  if (hasExecute && !hasDryRun && confirmArg !== undefined && unrecognized.length === 0) {
    return { mode: "execute", confirm };
  }
  return { mode: "dry-run" };
}

function printDryRunReport(report: Awaited<ReturnType<typeof computeDryRunReport>>): void {
  console.log("\n=== Handover Reset - DRY RUN (no writes made) ===\n");
  console.log(`Database host: ${report.preflight.resolvedHost}`);
  console.log(`Organization:  ${report.organizationId} (${report.preflight.organizationExists ? "found" : "NOT FOUND"})`);
  console.log(`Migrations:    ${report.preflight.appliedMigrationCount ?? "?"} applied vs ${report.preflight.expectedMigrationCount} on disk`);
  console.log("\n--- Preflight checks ---");
  for (const check of report.preflight.checks) {
    console.log(`  [${check.passed ? "PASS" : "FAIL"}] ${check.name} - ${check.detail}`);
  }

  console.log(`\n--- Users (${report.totalUserCount} total) ---`);
  console.log(`  Preserved (${report.usersToPreserve.length}):`);
  for (const u of report.usersToPreserve) console.log(`    KEEP   ${u.email} (${u.role}, ${u.status})`);
  console.log(`  Would be deleted (${report.usersToDelete.length}):`);
  for (const u of report.usersToDelete) console.log(`    DELETE ${u.email} (${u.role}, ${u.status})`);

  console.log("\n--- PropertyPortalConnection (never deleted) ---");
  if (report.preflight.portalConnections.length === 0) {
    console.log("  None found.");
  } else {
    for (const c of report.preflight.portalConnections) {
      console.log(`  ${c.provider} [${c.status}/${c.connectionMode}] "${c.displayName ?? ""}" credential-on-file=${c.hasCredentialReference}`);
    }
  }

  console.log("\n--- Deletion counts (in deletion order) ---");
  for (const model of report.deletionOrder) {
    console.log(`  ${model}: ${report.deletionCounts[model] ?? 0}`);
  }
  const totalDeleteRows = Object.values(report.deletionCounts).reduce((a, b) => a + b, 0);
  console.log(`  TOTAL rows across all tables: ${totalDeleteRows}`);

  console.log(`\n--- R2 object keys discovered (owned by rows above; not deleted by this script) ---`);
  console.log(`  ${report.objectKeysDiscovered.length} key(s) found. Run scripts/handover-reset-r2-cleanup.ts separately once the DB reset is verified.`);

  console.log("\n--- Preserved (never touched) ---");
  for (const t of report.preservedTables) console.log(`  ${t}`);

  if (report.warnings.length > 0) {
    console.log("\n--- Warnings ---");
    for (const w of report.warnings) console.log(`  ! ${w}`);
  }

  console.log(
    report.preflight.passed
      ? "\n[handover-reset] Preflight PASSED. Re-run with --execute --confirm=" + REQUIRED_EXECUTE_CONFIRMATION + " to actually delete the rows above."
      : "\n[handover-reset] Preflight FAILED - --execute would abort with zero writes until every check above passes."
  );
}

async function main(prisma: ResetClient, argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  if (args.mode === "dry-run") {
    const report = await computeDryRunReport(prisma);
    printDryRunReport(report);
    return;
  }

  console.log("\n=== Handover Reset - EXECUTE ===\n");
  try {
    const result = await executeReset(prisma, { confirm: args.confirm });
    console.log(`Preserved admin id: ${result.preservedAdminId}`);
    console.log(`Deleted users:      ${result.deletedUserCount}`);
    console.log("Deletion counts:");
    for (const [model, count] of Object.entries(result.deletionCounts)) console.log(`  ${model}: ${count}`);
    console.log(`\n[handover-reset] Done in ${result.durationMs}ms. Transaction committed.`);
  } catch (error) {
    if (error instanceof HandoverResetAbortedError) {
      console.error(`\n[handover-reset] ABORTED - ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  // A dry-run remains read-only on the normal application datasource. The
  // only write-capable path gets a dedicated direct/session connection so its
  // interactive transaction cannot be invalidated by the transaction pooler.
  const prisma = args.mode === "execute" ? createHandoverResetExecuteClient() : new PrismaClient();
  main(prisma as unknown as ResetClient, argv)
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { main, parseArgs };
