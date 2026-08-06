/**
 * `npm run seed:demo:verify` - checks the CURRENTLY LOADED KP-DEMO- dataset
 * without modifying anything. Read-only: only findUnique/count/findMany
 * calls. Deliberately does NOT call generateSmartNotifications() or
 * recalculateLeadScore() (both write) the way the full verification inside
 * seed-demo.ts does - this command's whole point is "confirm the current
 * state is sane" without side effects, so it can be run anytime, including
 * against production, with zero risk.
 */
import { PrismaClient } from "@prisma/client";
import { DEMO_ORGANIZATION_ID, DEMO_ID_PREFIX } from "../src/lib/demo-data/constants";
import { DEMO_SEED_PLAN } from "../src/lib/demo-data/plan";
import { previewTeardownCounts } from "../src/lib/demo-data/teardown";
import { matchPropertiesToLead } from "../src/lib/matching";

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

async function main() {
  console.log("========================================");
  console.log(" KP Properties Demo Seed - VERIFY");
  console.log(" (read-only, zero database writes)");
  console.log("========================================\n");

  const issues: string[] = [];
  const host = resolveHost();
  console.log(`Target DB host:   ${host}`);
  console.log(`Organization id:  ${DEMO_ORGANIZATION_ID}`);

  // --- Organization + real admin untouched ---
  const org = await prisma.organization.findUnique({ where: { id: DEMO_ORGANIZATION_ID } });
  if (!org) {
    issues.push(`Organization "${DEMO_ORGANIZATION_ID}" does not exist.`);
  } else {
    console.log(`Organization: "${org.name}" (unchanged - this script never writes to it)`);
  }

  const nonDemoAdminCount = await prisma.user.count({
    where: { organizationId: DEMO_ORGANIZATION_ID, role: "ADMIN", id: { not: { startsWith: DEMO_ID_PREFIX } } },
  });
  console.log(`Real (non-demo) ADMIN users present: ${nonDemoAdminCount}`);
  if (nonDemoAdminCount === 0) {
    issues.push("No real (non-demo) ADMIN user found - if one existed before seeding, something is wrong (this script did not delete it - verify separately).");
  }

  // --- Current demo row counts vs plan ---
  console.log("\n--- Current KP-DEMO- row counts ---");
  const counts = await previewTeardownCounts();
  console.log(JSON.stringify(counts, null, 2));

  const totalDemoRows = Object.values(counts).reduce((a, b) => a + b, 0);
  if (totalDemoRows === 0) {
    console.log("\nNo demo data currently loaded (all counts are zero). Run `npm run seed:demo` to load it.");
  } else {
    console.log(`\nTotal demo rows present: ${totalDemoRows}`);

    const expectations: [string, number, number][] = [
      ["user", counts.user, DEMO_SEED_PLAN.employees],
      ["owner", counts.owner, DEMO_SEED_PLAN.owners],
      ["property", counts.property, DEMO_SEED_PLAN.properties],
      ["lead", counts.lead, DEMO_SEED_PLAN.leads],
      ["visit", counts.visit, DEMO_SEED_PLAN.visits],
      ["followUp", counts.followUp, DEMO_SEED_PLAN.followUps],
      ["document", counts.document, DEMO_SEED_PLAN.documents],
      ["catalogueShare", counts.catalogueShare, DEMO_SEED_PLAN.catalogues],
      ["deal", counts.deal, DEMO_SEED_PLAN.deals],
    ];
    console.log("\n--- Against plan ---");
    for (const [label, actual, target] of expectations) {
      const ok = actual === target;
      console.log(`  ${label}: ${actual} / ${target} ${ok ? "OK" : "MISMATCH"}`);
      if (!ok) issues.push(`${label} count is ${actual}, expected ${target} - dataset may be partially seeded or partially removed.`);
    }

    // --- Lead-property matching, against the REAL current data (read-only query + pure function, no writes) ---
    console.log("\n--- Lead-property matching (current data) ---");
    const [demoLeads, availableDemoProperties] = await Promise.all([
      prisma.lead.findMany({ where: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}lead-` } } }),
      prisma.property.findMany({
        where: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: `${DEMO_ID_PREFIX}prop-` }, status: "AVAILABLE" },
        include: { owner: true },
      }),
    ]);
    let totalMatchPairs = 0;
    for (const lead of demoLeads) {
      totalMatchPairs += matchPropertiesToLead(availableDemoProperties, lead, 0.2).length;
    }
    console.log(`Total lead-property match pairs: ${totalMatchPairs} (target >= ${DEMO_SEED_PLAN.minLeadPropertyMatches})`);
    if (totalMatchPairs < DEMO_SEED_PLAN.minLeadPropertyMatches) {
      issues.push(`Only ${totalMatchPairs} lead-property match pairs (target >= ${DEMO_SEED_PLAN.minLeadPropertyMatches}).`);
    }
  }

  console.log("\n--- Result ---");
  if (issues.length === 0) {
    console.log("[verify] OK - no issues found.");
  } else {
    console.error(`[verify] ${issues.length} issue(s):`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
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
