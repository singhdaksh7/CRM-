/**
 * `npm run seed:demo:dry-run` - projects what `npm run seed:demo` would do
 * WITHOUT writing anything. Performs zero database writes: only
 * findUnique/count/findMany calls, plus in-memory construction of the
 * property/lead records that would be created (via the same pure
 * buildPropertyData/buildLeadData functions scripts/seed-demo.ts uses) so
 * the real matching engine can run a genuine projection against them.
 *
 * Does not require ALLOW_DEMO_SEED or the production-override flags - a
 * read-only script can never accidentally write demo data anywhere, so
 * those gates (which exist specifically to gate writes) don't apply here.
 * It still resolves and prints the target DB host so the operator can see
 * where seed:demo *would* write before ever running it.
 */
import { PrismaClient, PropertyType, LeadSource, DocumentCategory, NotificationType, VisitStatus } from "@prisma/client";
import { Rng, DEMO_SEED } from "../src/lib/demo-data/rng";
import { DEMO_ORGANIZATION_ID } from "../src/lib/demo-data/constants";
import { DEMO_SEED_PLAN } from "../src/lib/demo-data/plan";
import { previewTeardownCounts } from "../src/lib/demo-data/teardown";
import { buildEmployeeStubs } from "../src/lib/demo-data/employees";
import { buildOwnerData } from "../src/lib/demo-data/owners";
import { buildPropertyData } from "../src/lib/demo-data/properties";
import { buildLeadData } from "../src/lib/demo-data/leads";
import { matchPropertiesToLead } from "../src/lib/matching";
import { ensureDemoPropertyAssets } from "../src/lib/demo-data/assets";
import type { Property, Lead, Owner } from "@prisma/client";

const prisma = new PrismaClient();

function resolveHost(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "none (DATABASE_URL not set)";
  try {
    return new URL(url).hostname;
  } catch {
    return "unparseable";
  }
}

/** Every enum literal this framework's generators hardcode, checked against the live @prisma/client enums so schema drift is caught explicitly, not just trusted to tsc. */
function checkEnumCompatibility(): { ok: boolean; issues: string[] } {
  const issues: string[] = [];

  function check(label: string, used: readonly string[], valid: Record<string, string>) {
    const validSet = new Set(Object.values(valid));
    for (const v of used) {
      if (!validSet.has(v)) issues.push(`${label}: "${v}" is not a valid enum value (valid: ${[...validSet].join(", ")})`);
    }
  }

  check("PropertyType (properties.ts TYPE_WEIGHTS)", ["APARTMENT", "BUILDER_FLOOR", "INDEPENDENT_HOUSE", "VILLA", "COMMERCIAL_OFFICE", "COMMERCIAL_SHOP"], PropertyType);
  check("LeadSource (leads.ts SOURCE_MAP)", ["WEBSITE", "WALK_IN", "WHATSAPP", "MANUAL", "MAGICBRICKS", "ACRES_99", "REFERRAL", "HOUSING_COM"], LeadSource);
  check("DocumentCategory (documents.ts PLAN)", ["RENT_AGREEMENT", "AADHAAR", "PAN", "REGISTRY", "OWNER_IDENTITY"], DocumentCategory);
  check(
    "NotificationType (notifications.ts CATEGORIES)",
    ["HOT_LEAD_NO_FOLLOWUP", "VISIT_SCHEDULED", "PAYMENT_PENDING", "CATALOGUE_VIEWED", "PROPERTY_UNAVAILABLE_AFTER_SHARE", "FOLLOW_UP_DUE"],
    NotificationType
  );
  check("VisitStatus (visits.ts buckets)", ["SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED"], VisitStatus);

  return { ok: issues.length === 0, issues };
}

async function main() {
  console.log("========================================");
  console.log(" KP Properties Demo Seed - DRY RUN");
  console.log(" (zero database writes)");
  console.log("========================================\n");

  const host = resolveHost();
  console.log(`Target DB host:   ${host}`);
  console.log(`Organization id:  ${DEMO_ORGANIZATION_ID}`);

  // --- Validate organization + schema (read-only) ---
  let orgExists = false;
  try {
    const org = await prisma.organization.findUnique({ where: { id: DEMO_ORGANIZATION_ID } });
    orgExists = Boolean(org);
    console.log(`Organization exists: ${orgExists ? `yes ("${org!.name}")` : "NO - seed:demo would fail"}`);
  } catch (e) {
    console.error(`Could not query organization (connection issue?): ${(e as Error).message}`);
  }

  const enumCheck = checkEnumCompatibility();
  console.log(`Enum compatibility: ${enumCheck.ok ? "OK - all hardcoded enum literals are valid" : "ISSUES FOUND"}`);
  for (const issue of enumCheck.issues) console.log(`  - ${issue}`);

  // --- What currently exists / would be removed by teardown ---
  console.log("\n--- Current KP-DEMO- rows (what `npm run seed:demo` or `seed:remove` would delete first) ---");
  let removalPreview: Record<string, number> = {};
  try {
    removalPreview = await previewTeardownCounts();
    const totalExisting = Object.values(removalPreview).reduce((a, b) => a + b, 0);
    console.log(JSON.stringify(removalPreview, null, 2));
    console.log(`Total existing demo rows: ${totalExisting}`);
  } catch (e) {
    console.error(`Could not count existing demo rows: ${(e as Error).message}`);
  }

  // --- Intended counts (from the shared plan) ---
  console.log("\n--- Intended counts (what `npm run seed:demo` would insert) ---");
  console.log(JSON.stringify(DEMO_SEED_PLAN, null, 2));

  // --- Matching projection, fully in-memory, zero writes ---
  // Draws from the Rng stream in the exact same order createDemoEmployees ->
  // createDemoOwners -> createDemoProperties -> createDemoLeads would (via
  // buildEmployeeStubs/buildOwnerData/buildPropertyData/buildLeadData - the
  // same pure builders those functions call internally), so this projection
  // is representative of the actual seed run's random draws, not just the
  // same counts with different random values.
  console.log("\n--- Lead-property matching projection (real matching engine, in-memory records) ---");
  const rng = new Rng(DEMO_SEED);
  const stubStaff = buildEmployeeStubs(rng);

  const projectedOwners: Owner[] = [];
  for (let i = 1; i <= DEMO_SEED_PLAN.owners; i++) {
    projectedOwners.push(buildOwnerData(rng, i, stubStaff) as unknown as Owner);
  }

  const assetsByType = ensureDemoPropertyAssets(); // idempotent, filesystem-only (not a DB write) - see assets.ts

  const projectedProperties: Property[] = [];
  for (let i = 1; i <= DEMO_SEED_PLAN.properties; i++) {
    projectedProperties.push(buildPropertyData(rng, i, projectedOwners, stubStaff, assetsByType) as unknown as Property);
  }
  const availableProjected = projectedProperties.filter((p) => p.status === "AVAILABLE");

  const projectedLeads: Lead[] = [];
  for (let i = 1; i <= DEMO_SEED_PLAN.leads; i++) {
    projectedLeads.push(buildLeadData(rng, i, stubStaff, DEMO_SEED_PLAN.leads, availableProjected) as unknown as Lead);
  }

  let totalMatchPairs = 0;
  const outsideRange: { leadCode: string; matches: number }[] = [];
  for (const lead of projectedLeads) {
    const matches = matchPropertiesToLead(availableProjected, lead, 0.2);
    totalMatchPairs += matches.length;
    if (matches.length < DEMO_SEED_PLAN.leadPropertyMatchRange.min || matches.length > DEMO_SEED_PLAN.leadPropertyMatchRange.max) {
      outsideRange.push({ leadCode: lead.leadCode, matches: matches.length });
    }
  }
  console.log(`Projected available properties: ${availableProjected.length} / ${projectedProperties.length}`);
  console.log(`Projected total lead-property match pairs: ${totalMatchPairs} (target >= ${DEMO_SEED_PLAN.minLeadPropertyMatches})`);
  console.log(`Projected leads outside ${DEMO_SEED_PLAN.leadPropertyMatchRange.min}-${DEMO_SEED_PLAN.leadPropertyMatchRange.max} match range: ${outsideRange.length === 0 ? "none" : JSON.stringify(outsideRange)}`);

  console.log("\n--- Summary ---");
  console.log(`Would insert (approx): ${Object.values(DEMO_SEED_PLAN).filter((v) => typeof v === "number").reduce((a, b) => a + (typeof b === "number" ? b : 0), 0)} top-level records across ${Object.keys(DEMO_SEED_PLAN).length - 2} tables`);
  console.log(`Would remove first: ${Object.values(removalPreview).reduce((a, b) => a + b, 0)} existing demo rows`);
  console.log("No database writes were performed by this run.\n");

  if (!orgExists || !enumCheck.ok || totalMatchPairs < DEMO_SEED_PLAN.minLeadPropertyMatches) {
    console.error("[dry-run] One or more checks failed - see above. seed:demo would likely also fail or under-deliver.");
    process.exitCode = 1;
  } else {
    console.log("[dry-run] All checks passed. Safe to run `npm run seed:demo` against this database.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
