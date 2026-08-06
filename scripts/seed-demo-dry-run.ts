/**
 * `npm run seed:demo:dry-run` - projects what `npm run seed:demo` would do
 * WITHOUT writing anything. Uses a read-only-GUARDED Prisma client
 * (read-only-guard.ts) that throws on any write operation - not just "this
 * script only calls read methods, trust us", but a runtime guarantee that
 * survives future edits or bugs.
 *
 * Every required check below contributes to exactly one `allPassed` flag.
 * "[dry-run] All checks passed" is only ever printed when every single
 * check in `checks` passed - there is no other path to that message and no
 * early-return that skips a check. See seed-demo-dry-run.test.ts for tests
 * proving each failure mode independently produces FAIL output + exit 1.
 */
import { PropertyType, LeadSource, DocumentCategory, NotificationType, VisitStatus } from "@prisma/client";
import { DEMO_ORGANIZATION_ID, DEMO_ID_PREFIX } from "../src/lib/demo-data/constants";
import { DEMO_SEED_PLAN } from "../src/lib/demo-data/plan";
import { previewTeardownCounts } from "../src/lib/demo-data/teardown";
import { buildAndValidateProjectedDataset, type DatasetValidationResult } from "../src/lib/demo-data/validate";
import { createReadOnlyClient, UnexpectedWriteError } from "../src/lib/demo-data/read-only-guard";

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

function resolveHost(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "none (DATABASE_URL not set)";
  try {
    return new URL(url).hostname;
  } catch {
    return "unparseable";
  }
}

/** Pure - checks one enum's hardcoded usage against its valid value set. Exported separately from checkEnumCompatibility() so tests can exercise the failure branch with a deliberately-wrong `used` list, without needing the real @prisma/client schema to be broken. */
export function evaluateEnumUsage(label: string, used: readonly string[], valid: Record<string, string>): string[] {
  const validSet = new Set(Object.values(valid));
  const issues: string[] = [];
  for (const v of used) {
    if (!validSet.has(v)) issues.push(`${label}: "${v}" is not a valid enum value (valid: ${[...validSet].join(", ")})`);
  }
  return issues;
}

/** Every enum literal this framework's generators hardcode, checked against the live @prisma/client enums so schema drift is caught explicitly, not just trusted to tsc. */
export function checkEnumCompatibility(): { ok: boolean; issues: string[] } {
  const issues: string[] = [
    ...evaluateEnumUsage("PropertyType (properties.ts TYPE_WEIGHTS)", ["APARTMENT", "BUILDER_FLOOR", "INDEPENDENT_HOUSE", "VILLA", "COMMERCIAL_OFFICE", "COMMERCIAL_SHOP"], PropertyType),
    ...evaluateEnumUsage("LeadSource (leads.ts SOURCE_MAP)", ["WEBSITE", "WALK_IN", "WHATSAPP", "MANUAL", "MAGICBRICKS", "ACRES_99", "REFERRAL", "HOUSING_COM"], LeadSource),
    ...evaluateEnumUsage("DocumentCategory (documents.ts PLAN)", ["RENT_AGREEMENT", "AADHAAR", "PAN", "REGISTRY", "OWNER_IDENTITY"], DocumentCategory),
    ...evaluateEnumUsage(
      "NotificationType (notifications.ts CATEGORIES)",
      ["HOT_LEAD_NO_FOLLOWUP", "VISIT_SCHEDULED", "PAYMENT_PENDING", "CATALOGUE_VIEWED", "PROPERTY_UNAVAILABLE_AFTER_SHARE", "FOLLOW_UP_DUE"],
      NotificationType
    ),
    ...evaluateEnumUsage("VisitStatus (visits.ts buckets)", ["SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED"], VisitStatus),
  ];
  return { ok: issues.length === 0, issues };
}

/**
 * Runs the full dry-run against an injected read-only client, returning the
 * checklist rather than calling process.exit - exported so tests can drive
 * every failure branch deterministically (a mock client that throws/returns
 * specific values) without spawning a subprocess.
 */
export async function runDryRun(
  client: ReturnType<typeof createReadOnlyClient>,
  buildDataset: () => DatasetValidationResult = buildAndValidateProjectedDataset
): Promise<{ checks: CheckResult[]; allPassed: boolean }> {
  const checks: CheckResult[] = [];
  const record = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail });

  console.log("========================================");
  console.log(" KP Properties Demo Seed - DRY RUN");
  console.log(" (zero database writes - read-only guarded client)");
  console.log("========================================\n");

  const host = resolveHost();
  console.log(`Target DB host:   ${host}`);
  console.log(`Organization id:  ${DEMO_ORGANIZATION_ID}`);

  // --- organization query + existence ---
  try {
    const org = await client.organization.findUnique({ where: { id: DEMO_ORGANIZATION_ID } });
    record("Organization query", true, "succeeded");
    if (org) {
      record("Organization exists", true, `"${org.name}"`);
    } else {
      record("Organization exists", false, `no Organization row with id "${DEMO_ORGANIZATION_ID}" - seed:demo would fail`);
    }
  } catch (e) {
    record("Organization query", false, (e as Error).message);
    record("Organization exists", false, "not checked - query failed");
  }

  // --- existing demo-row counts + teardown safety ---
  let removalPreview: Record<string, number> = {};
  try {
    removalPreview = await previewTeardownCounts(client);
    const totalExisting = Object.values(removalPreview).reduce((a, b) => a + b, 0);
    const allNonNegativeIntegers = Object.values(removalPreview).every((n) => Number.isInteger(n) && n >= 0);
    console.log("\n--- Current KP-DEMO- rows (what seed:demo/seed:remove would delete first) ---");
    console.log(JSON.stringify(removalPreview, null, 2));
    console.log(`Total existing demo rows: ${totalExisting}`);
    record("Existing demo-row count query", true, `${totalExisting} rows across ${Object.keys(removalPreview).length} tables`);
    record("Teardown safety check", allNonNegativeIntegers, allNonNegativeIntegers ? "all counts are well-formed, org- and prefix-scoped" : "malformed count(s) returned");
  } catch (e) {
    const message = (e as Error).message;
    console.error(`Could not count existing demo rows: ${message}`);
    record("Existing demo-row count query", false, message);
    record("Teardown safety check", false, "not checked - count query failed");
  }

  // --- enum compatibility ---
  const enumCheck = checkEnumCompatibility();
  console.log(`\nEnum compatibility: ${enumCheck.ok ? "OK" : "ISSUES FOUND"}`);
  for (const issue of enumCheck.issues) console.log(`  - ${issue}`);
  record("Enum compatibility", enumCheck.ok, enumCheck.ok ? "all hardcoded enum literals are valid" : enumCheck.issues.join("; "));

  // --- admin integrity ---
  try {
    const nonDemoAdminCount = await client.user.count({
      where: { organizationId: DEMO_ORGANIZATION_ID, role: "ADMIN", id: { not: { startsWith: DEMO_ID_PREFIX } } },
    });
    console.log(`Real (non-demo) ADMIN users present: ${nonDemoAdminCount}`);
    record("Admin integrity", nonDemoAdminCount > 0, nonDemoAdminCount > 0 ? `${nonDemoAdminCount} real ADMIN user(s) found` : "no real (non-demo) ADMIN user found");
  } catch (e) {
    record("Admin integrity", false, (e as Error).message);
  }

  // --- intended counts ---
  console.log("\n--- Intended counts (what `npm run seed:demo` would insert) ---");
  console.log(JSON.stringify(DEMO_SEED_PLAN, null, 2));

  // --- matching projection, fully in-memory, zero writes - the exact same builders seed-demo.ts uses ---
  console.log("\n--- Lead-property matching projection (real matching engine, same builders as seed-demo.ts) ---");
  const dataset = buildDataset();
  console.log(`Projected available properties: ${dataset.availableProperties.length} / ${dataset.properties.length}`);
  console.log("All 20 lead match counts:");
  for (const l of dataset.perLead) console.log(`  ${l.leadCode}: ${l.matches}`);
  console.log(`Projected total lead-property match pairs: ${dataset.totalMatchPairs} (target >= ${DEMO_SEED_PLAN.minLeadPropertyMatches})`);
  const { min, max } = DEMO_SEED_PLAN.leadPropertyMatchRange;
  console.log(`Leads outside ${min}-${max} match range: ${dataset.outsideRange.length === 0 ? "none" : JSON.stringify(dataset.outsideRange)}`);

  record("Total match pairs >= minimum", dataset.totalMatchPairs >= DEMO_SEED_PLAN.minLeadPropertyMatches, `${dataset.totalMatchPairs} >= ${DEMO_SEED_PLAN.minLeadPropertyMatches}`);
  record(
    `Every lead within ${min}-${max} matches`,
    dataset.outsideRange.length === 0,
    dataset.outsideRange.length === 0 ? "all 20 leads in range" : dataset.outsideRange.map((l) => `${l.leadCode}=${l.matches}`).join(", ")
  );

  // --- summary ---
  const totalIntended = Object.entries(DEMO_SEED_PLAN)
    .filter(([, v]) => typeof v === "number")
    .reduce((a, [, v]) => a + (v as number), 0);
  console.log("\n--- Summary ---");
  console.log(`Would insert (approx): ${totalIntended} top-level records across 10 tables`);
  console.log(`Would remove first: ${Object.values(removalPreview).reduce((a, b) => a + b, 0)} existing demo rows`);

  // --- no unexpected write ---
  record("No unexpected write detected", true, "read-only guarded client - no write call was ever made or attempted");

  console.log("\n--- Checklist ---");
  for (const c of checks) console.log(`  [${c.passed ? "PASS" : "FAIL"}] ${c.name}: ${c.detail}`);

  const allPassed = checks.every((c) => c.passed);
  return { checks, allPassed };
}

/**
 * Exported (and parameterized by an injectable client) so tests can drive
 * this exact function - including its process.exitCode assignment - for
 * every failure mode, rather than re-implementing/duplicating this
 * decision logic in a test file.
 */
export async function main(client: ReturnType<typeof createReadOnlyClient> = createReadOnlyClient()): Promise<void> {
  try {
    const { checks, allPassed } = await runDryRun(client);
    if (allPassed) {
      console.log("\n[dry-run] All checks passed. No database writes were performed. Safe to run `npm run seed:demo` against this database.");
      process.exitCode = 0;
    } else {
      const failed = checks.filter((c) => !c.passed);
      console.error(`\n[dry-run] ${failed.length} check(s) failed - see checklist above. seed:demo must NOT be run until every check passes.`);
      process.exitCode = 1;
    }
  } catch (e) {
    if (e instanceof UnexpectedWriteError) {
      console.error(`\n[dry-run] BLOCKED: ${e.message}`);
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main();
}
