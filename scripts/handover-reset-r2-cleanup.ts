/**
 * Handover reset - R2 object cleanup stage.
 *
 * Deliberately a SEPARATE script from scripts/handover-reset.ts and never
 * runs inside its DB transaction - see src/lib/handover-reset/r2-cleanup.ts
 * for the full reasoning and the structural (type-level) guarantees against
 * ever expressing a wildcard/prefix/bucket-level deletion.
 *
 * Input: a JSON file of candidate object keys - normally the
 * `objectKeysDiscovered` array from a `handover-reset.ts --dry-run` report,
 * saved to a file first (this script never talks to Postgres itself, so it
 * can never rediscover keys on its own from a live database - only the keys
 * the caller explicitly hands it are ever considered).
 *
 * `npm run handover:r2-cleanup:dry-run -- --keys-file=keys.json`
 * `npm run handover:r2-cleanup:execute -- --keys-file=keys.json --confirm=RESET_KP_DEMO_R2_OBJECTS`
 *
 * SAFETY NOTE: like handover-reset.ts, this script is built and unit-tested
 * but never executed here against real Cloudflare R2 - see the task's hard
 * constraints (no R2 modification of any kind in this task).
 */
import fs from "node:fs";
import { buildExactObjectKeyAllowlist, dryRunR2Cleanup, executeR2Cleanup, type R2LikeClient } from "../src/lib/handover-reset/r2-cleanup";
import { REQUIRED_R2_EXECUTE_CONFIRMATION } from "../src/lib/handover-reset/constants";

interface ParsedArgs {
  mode: "dry-run" | "execute";
  keysFile?: string;
  confirm?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const hasExecute = argv.includes("--execute");
  const hasDryRun = argv.includes("--dry-run");
  const keysFileArg = argv.find((a) => a.startsWith("--keys-file="));
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const keysFile = keysFileArg ? keysFileArg.slice("--keys-file=".length) : undefined;
  const confirm = confirmArg ? confirmArg.slice("--confirm=".length) : undefined;
  const recognized = new Set(["--execute", "--dry-run"]);
  const unrecognized = argv.filter((a) => !recognized.has(a) && !a.startsWith("--confirm=") && !a.startsWith("--keys-file="));

  if (hasExecute && !hasDryRun && confirmArg !== undefined && unrecognized.length === 0) {
    return { mode: "execute", keysFile, confirm };
  }
  return { mode: "dry-run", keysFile };
}

function readCandidateKeys(keysFile: string | undefined): string[] {
  if (!keysFile) return [];
  const raw = fs.readFileSync(keysFile, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${keysFile} must contain a JSON array of strings.`);
  return parsed;
}

/**
 * The real production implementation - reuses this app's own storage layer
 * (src/lib/storage.ts, which dispatches to whichever STORAGE_PROVIDER is
 * configured). Never invoked by this task; only buildExactObjectKeyAllowlist/
 * dryRunR2Cleanup are exercised in tests, always against a fake client.
 */
async function buildLiveR2Client(): Promise<R2LikeClient> {
  const { deleteObject } = await import("../src/lib/storage");
  return {
    async deleteObject(key) {
      await deleteObject(key);
    },
  };
}

async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const candidateKeys = readCandidateKeys(args.keysFile);

  if (args.mode === "dry-run") {
    const report = dryRunR2Cleanup(candidateKeys);
    console.log("\n=== Handover Reset R2 Cleanup - DRY RUN (no objects deleted) ===\n");
    console.log(`Candidate keys supplied: ${candidateKeys.length}`);
    console.log(`Would delete (${report.wouldDelete.length}):`);
    for (const k of report.wouldDelete) console.log(`  DELETE ${k}`);
    console.log(`\nRejected / preserved (${report.rejected.length}):`);
    for (const r of report.rejected) console.log(`  KEEP   ${r.key} - ${r.reason}`);
    console.log(
      `\n[r2-cleanup] Re-run with --execute --confirm=${REQUIRED_R2_EXECUTE_CONFIRMATION} to actually delete the ${report.wouldDelete.length} object(s) above.`
    );
    return;
  }

  console.log("\n=== Handover Reset R2 Cleanup - EXECUTE ===\n");
  const { allowlist, rejected } = buildExactObjectKeyAllowlist(candidateKeys);
  if (rejected.length > 0) {
    console.log(`Preserving ${rejected.length} key(s) that failed the allow-list check:`);
    for (const r of rejected) console.log(`  KEEP ${r.key} - ${r.reason}`);
  }
  const client = await buildLiveR2Client();
  const result = await executeR2Cleanup(client, allowlist, { confirm: args.confirm });
  console.log(`Deleted: ${result.deleted.length}`);
  console.log(`Failed:  ${result.failed.length}`);
  for (const f of result.failed) console.log(`  FAILED ${f.key} - ${f.error}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}

export { main, parseArgs };
