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
import { toPublicCatalogueDTO } from "../src/lib/catalogue-dto";

/**
 * Mirrors catalogues.ts's private CATALOGUE_SENDER_INCLUDE. Deliberately NOT
 * importing getCatalogueById from ../src/lib/catalogues here: that module
 * (via ./api-auth) pulls in next-auth and `server-only`, which throws under
 * this script's plain `tsx` execution (no Next.js runtime present) -
 * confirmed by trying it. toPublicCatalogueDTO has no such dependency.
 */
const DEMO_VERIFY_CATALOGUE_INCLUDE = {
  properties: {
    include: { property: { include: { owner: true, partner: true } }, addedByUser: { select: { id: true, name: true } }, executiveStatusUpdatedBy: { select: { id: true, name: true } } },
    orderBy: { sortOrder: "asc" as const },
  },
  lead: { include: { assignedTo: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true } },
};

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
      ["inventoryPartner", counts.inventoryPartner, DEMO_SEED_PLAN.inventoryPartners],
      ["property", counts.property, DEMO_SEED_PLAN.properties],
      ["lead", counts.lead, DEMO_SEED_PLAN.leads],
      // Randomized bucket visits + the three hand-built workflow visits.
      ["visit", counts.visit, DEMO_SEED_PLAN.visits + DEMO_SEED_PLAN.workflowVisits],
      ["followUp", counts.followUp, DEMO_SEED_PLAN.followUps],
      ["document", counts.document, DEMO_SEED_PLAN.documents],
      ["catalogueShare", counts.catalogueShare, DEMO_SEED_PLAN.catalogues],
      ["deal", counts.deal, DEMO_SEED_PLAN.deals],
      // --- Phase 4 workflow demo scenarios (release-readiness closure pass) ---
      ["visitFeedback", counts.visitFeedback, DEMO_SEED_PLAN.visitFeedback],
      ["propertyAvailabilityReport", counts.propertyAvailabilityReport, DEMO_SEED_PLAN.availabilityReports],
      ["propertyReport", counts.propertyReport, DEMO_SEED_PLAN.propertyReports],
      ["propertyFavorite", counts.propertyFavorite, DEMO_SEED_PLAN.propertyFavorites],
      ["propertyViewLog", counts.propertyViewLog, DEMO_SEED_PLAN.propertyViewLogs],
    ];
    console.log("\n--- Against plan ---");
    for (const [label, actual, target] of expectations) {
      const ok = actual === target;
      console.log(`  ${label}: ${actual} / ${target} ${ok ? "OK" : "MISMATCH"}`);
      if (!ok) issues.push(`${label} count is ${actual}, expected ${target} - dataset may be partially seeded or partially removed.`);
    }
    // catalogueVersionEvent is data-dependent (see plan.ts's minCatalogueVersionEvents comment) - checked with >=, not ===.
    const versionEventsOk = counts.catalogueVersionEvent >= DEMO_SEED_PLAN.minCatalogueVersionEvents;
    console.log(`  catalogueVersionEvent: ${counts.catalogueVersionEvent} / >= ${DEMO_SEED_PLAN.minCatalogueVersionEvents} ${versionEventsOk ? "OK" : "MISMATCH"}`);
    if (!versionEventsOk) issues.push(`catalogueVersionEvent count is ${counts.catalogueVersionEvent}, expected >= ${DEMO_SEED_PLAN.minCatalogueVersionEvents}.`);

    // --- Phase 4 business-relationship checks (read-only counts of rows
    // that reference something outside the demo-prefixed dataset - see
    // src/lib/demo-data/verify.ts's `phase4` section for the same checks
    // run during `npm run seed:demo` itself; duplicated here, not shared,
    // to keep this script's own zero-write, zero-import-surface contract
    // (see file header) fully self-contained). ---
    console.log("\n--- Phase 4 business relationships ---");
    const propPrefix = `${DEMO_ID_PREFIX}prop-`;
    const empPrefix = `${DEMO_ID_PREFIX}emp-`;
    const catPrefix = `${DEMO_ID_PREFIX}cat-`;
    const visitPrefix = `${DEMO_ID_PREFIX}visit-`;

    const relationshipChecks: [string, () => Promise<number>][] = [
      ["INDIRECT properties missing a partnerId", () =>
        prisma.property.count({ where: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: propPrefix }, inventorySource: "INDIRECT", partnerId: null } })],
      ["DIRECT properties with an unexpected partnerId", () =>
        prisma.property.count({ where: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: propPrefix }, inventorySource: "DIRECT", NOT: { partnerId: null } } })],
      ["VisitFeedback referencing a non-demo visit", () =>
        prisma.visitFeedback.count({ where: { organizationId: DEMO_ORGANIZATION_ID, NOT: { visit: { id: { startsWith: visitPrefix } } } } })],
      ["PropertyAvailabilityReport referencing a non-demo property/reporter", () =>
        prisma.propertyAvailabilityReport.count({
          where: { organizationId: DEMO_ORGANIZATION_ID, OR: [{ property: { id: { not: { startsWith: propPrefix } } } }, { reportedBy: { id: { not: { startsWith: empPrefix } } } }] },
        })],
      ["PropertyReport referencing a non-demo property/reporter", () =>
        prisma.propertyReport.count({
          where: { organizationId: DEMO_ORGANIZATION_ID, OR: [{ property: { id: { not: { startsWith: propPrefix } } } }, { reportedBy: { id: { not: { startsWith: empPrefix } } } }] },
        })],
      ["CatalogueVersionEvent referencing a non-demo catalogue", () =>
        prisma.catalogueVersionEvent.count({ where: { organizationId: DEMO_ORGANIZATION_ID, NOT: { catalogueShare: { id: { startsWith: catPrefix } } } } })],
      ["PropertyFavorite referencing a non-demo user/property", () =>
        prisma.propertyFavorite.count({ where: { OR: [{ property: { id: { not: { startsWith: propPrefix } } } }, { user: { id: { not: { startsWith: empPrefix } } } }] } })],
      ["PropertyViewLog referencing a non-demo user/property", () =>
        prisma.propertyViewLog.count({ where: { OR: [{ property: { id: { not: { startsWith: propPrefix } } } }, { user: { id: { not: { startsWith: empPrefix } } } }] } })],
    ];
    for (const [label, check] of relationshipChecks) {
      const bad = await check();
      console.log(`  ${label}: ${bad} ${bad === 0 ? "OK" : "MISMATCH"}`);
      if (bad > 0) issues.push(`${bad} row(s) - ${label}.`);
    }

    const full = await prisma.catalogueShare.findFirst({
      where: { organizationId: DEMO_ORGANIZATION_ID, id: { startsWith: catPrefix } },
      include: DEMO_VERIFY_CATALOGUE_INCLUDE,
    });
    if (full) {
      const serialized = JSON.stringify(toPublicCatalogueDTO(full));
      const internalFieldMarkers = [
        "buildingName", "flatNumber", "gateNumber", "propertySource", "keyAvailability",
        "entryInstructions", "internalNotes", "negotiationNotes", "hiddenRemarks",
      ];
      const leaked = internalFieldMarkers.filter((m) => serialized.includes(m));
      console.log(`  Public catalogue DTO leak-guard: ${leaked.length === 0 ? "OK" : `LEAKED: ${leaked.join(", ")}`}`);
      if (leaked.length > 0) issues.push(`Public catalogue DTO leaked internal field marker(s): ${leaked.join(", ")}.`);
    } else {
      console.log("  Public catalogue DTO leak-guard: skipped (no demo catalogue found)");
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
