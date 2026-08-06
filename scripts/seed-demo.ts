/**
 * Phase 2 realistic demo seed for Delhi Broker CRM (KP Properties demo data).
 *
 * `npm run seed:demo` - idempotent: deletes any previous "KP-DEMO-" dataset
 * and recreates it fresh every time. Never touches real production data -
 * every row this creates is prefixed KP-DEMO-/kp-demo- (see
 * src/lib/demo-data/constants.ts) so scripts/remove-demo.ts (and the
 * ADMIN-only dashboard banner's "Delete Demo Data" button) can find and
 * remove exactly what this script created and nothing else.
 *
 * See src/lib/demo-data/safety-guard.ts for the production DB check this
 * performs before writing anything, and scripts/seed-demo-dry-run.ts /
 * scripts/seed-demo-verify.ts for the zero-write preview/status commands.
 */
import { PrismaClient } from "@prisma/client";
process.env.ALLOW_DEMO_SEED = "true";
import { assertDemoSeedSafe, printSeedPlan } from "../src/lib/demo-data/safety-guard";
import { Rng, DEMO_SEED } from "../src/lib/demo-data/rng";
import { DEMO_ORGANIZATION_ID } from "../src/lib/demo-data/constants";
import { DEMO_SEED_PLAN } from "../src/lib/demo-data/plan";
import { getCurrentOrganizationId } from "../src/lib/demo-data/organization";
import { teardownDemoData } from "../src/lib/demo-data/teardown";
import { createDemoEmployees } from "../src/lib/demo-data/employees";
import { createDemoOwners } from "../src/lib/demo-data/owners";
import { createDemoProperties } from "../src/lib/demo-data/properties";
import { createDemoLeads } from "../src/lib/demo-data/leads";
import { createDemoFollowUps } from "../src/lib/demo-data/followups";
import { createDemoVisits } from "../src/lib/demo-data/visits";
import { createDemoCatalogues } from "../src/lib/demo-data/catalogues";
import { createDemoDeals } from "../src/lib/demo-data/deals";
import { createDemoDocuments } from "../src/lib/demo-data/documents";
import { createDemoNotificationHistory } from "../src/lib/demo-data/notifications";
import { runVerification } from "../src/lib/demo-data/verify";
import { recalculateLeadScore } from "../src/lib/scoring";
import { matchPropertiesToLead } from "../src/lib/matching";

const prisma = new PrismaClient();

async function main() {
  const startedAt = Date.now();

  // --- Safety gate + preflight banner - BEFORE any database write ---
  const host = assertDemoSeedSafe();
  printSeedPlan(host, DEMO_ORGANIZATION_ID, {
    employees: DEMO_SEED_PLAN.employees,
    owners: DEMO_SEED_PLAN.owners,
    properties: DEMO_SEED_PLAN.properties,
    leads: DEMO_SEED_PLAN.leads,
    visits: DEMO_SEED_PLAN.visits,
    followUps: DEMO_SEED_PLAN.followUps,
    notifications: DEMO_SEED_PLAN.notifications,
    documents: DEMO_SEED_PLAN.documents,
    catalogues: DEMO_SEED_PLAN.catalogues,
    "deals (supporting data)": DEMO_SEED_PLAN.deals,
  });

  console.log("[seed-demo] Tearing down any previous KP-DEMO- dataset...");
  const { deletedCounts } = await teardownDemoData();
  console.log(`[seed-demo] Deleted: ${JSON.stringify(deletedCounts)}`);

  console.log("[seed-demo] Verifying the current organization exists (never renamed/modified)...");
  await getCurrentOrganizationId();

  const rng = new Rng(DEMO_SEED);

  console.log(`[seed-demo] Creating ${DEMO_SEED_PLAN.employees} employees...`);
  const employees = await createDemoEmployees(rng);

  console.log(`[seed-demo] Creating ${DEMO_SEED_PLAN.owners} owners...`);
  const owners = await createDemoOwners(rng, employees, DEMO_SEED_PLAN.owners);

  console.log(`[seed-demo] Creating ${DEMO_SEED_PLAN.properties} properties...`);
  const properties = await createDemoProperties(rng, owners, employees, DEMO_SEED_PLAN.properties);

  console.log(`[seed-demo] Creating ${DEMO_SEED_PLAN.leads} leads...`);
  const leads = await createDemoLeads(rng, employees, properties.all, DEMO_SEED_PLAN.leads);

  console.log(`[seed-demo] Creating ${DEMO_SEED_PLAN.followUps} follow-ups...`);
  const followUps = await createDemoFollowUps(rng, leads.all, employees, DEMO_SEED_PLAN.followUps);

  console.log(`[seed-demo] Creating ${DEMO_SEED_PLAN.visits} visits...`);
  const visits = await createDemoVisits(rng, leads.all, properties.all, employees.fieldExecutives, DEMO_SEED_PLAN.visits);

  console.log(`[seed-demo] Creating ${DEMO_SEED_PLAN.catalogues} catalogues (already shared with clients)...`);
  const catalogues = await createDemoCatalogues(rng, leads.all, properties.all, employees, DEMO_SEED_PLAN.catalogues);

  console.log(`[seed-demo] Creating ${DEMO_SEED_PLAN.deals} deals (+ brokerage + payments)...`);
  const deals = await createDemoDeals(rng, leads.all, properties.all, owners, employees, DEMO_SEED_PLAN.deals);

  console.log(`[seed-demo] Creating ${DEMO_SEED_PLAN.documents} documents (lease agreements, Aadhaar, PAN, property papers, Owner KYC)...`);
  const documents = await createDemoDocuments(rng, owners, properties.all, deals.all, employees.admin.id, DEMO_SEED_PLAN.documents);

  console.log("[seed-demo] Running the real lead-scoring engine over every demo lead...");
  for (const lead of leads.all) {
    await recalculateLeadScore(lead.id, "LEAD_CREATED");
  }

  console.log(`[seed-demo] Creating ${DEMO_SEED_PLAN.notifications} notifications (Hot Lead, Visit Today, Payment Pending, Catalogue Opened, Property Unavailable, Follow-up Due)...`);
  const notifications = await createDemoNotificationHistory(rng, employees.all, leads.all, properties.all, DEMO_SEED_PLAN.notifications);

  console.log("[seed-demo] Computing lead-property matches with the real matching engine...");
  const availableProperties = properties.all.filter((p) => p.status === "AVAILABLE");
  let totalMatchPairs = 0;
  const perLeadMatchCounts: { leadCode: string; matches: number }[] = [];
  for (const lead of leads.all) {
    const matches = matchPropertiesToLead(availableProperties, lead, 0.2);
    totalMatchPairs += matches.length;
    perLeadMatchCounts.push({ leadCode: lead.leadCode, matches: matches.length });
  }
  const { min: minMatch, max: maxMatch } = DEMO_SEED_PLAN.leadPropertyMatchRange;
  const leadsOutsideTargetRange = perLeadMatchCounts.filter((l) => l.matches < minMatch || l.matches > maxMatch);

  console.log("[seed-demo] Running verification (matching, dashboard, reports, smart actions, search, health, exports)...");
  const verification = await runVerification({
    adminId: employees.admin.id,
    adminRole: "ADMIN",
    leadScenarioIds: leads.scenarioIds,
    propertyScenarioIds: {
      noPhotos: properties.noPhotosScenarioId,
      wellPhotographed: properties.wellPhotographedScenarioId,
      staleInactive: properties.staleInactiveScenarioId,
      noOwner: properties.noOwnerScenarioId,
    },
  });

  const elapsedMs = Date.now() - startedAt;
  const totalRecords =
    employees.all.length + owners.length + properties.all.length + leads.all.length + followUps.length + visits.length +
    catalogues.all.length + deals.all.length + documents.all.length + notifications.length;

  console.log("\n========================================");
  console.log(" KP Properties - Demo Seed Complete");
  console.log("========================================");
  console.log(`Employees:                 ${employees.all.length} (target ${DEMO_SEED_PLAN.employees})`);
  console.log(`Owners:                    ${owners.length} (target ${DEMO_SEED_PLAN.owners})`);
  console.log(`Properties:                ${properties.all.length} (target ${DEMO_SEED_PLAN.properties})`);
  console.log(`Leads:                     ${leads.all.length} (target ${DEMO_SEED_PLAN.leads})`);
  console.log(`Visits:                    ${visits.length} (target ${DEMO_SEED_PLAN.visits})`);
  console.log(`Follow-ups:                ${followUps.length} (target ${DEMO_SEED_PLAN.followUps})`);
  console.log(`Notifications:             ${notifications.length} (target ${DEMO_SEED_PLAN.notifications})`);
  console.log(`Documents:                 ${documents.all.length} (target ${DEMO_SEED_PLAN.documents})`);
  console.log(`Catalogues:                ${catalogues.all.length} (target ${DEMO_SEED_PLAN.catalogues})`);
  console.log(`Deals (supporting data):   ${deals.all.length} (target ${DEMO_SEED_PLAN.deals})`);
  console.log(`Total records inserted:    ${totalRecords}`);
  console.log(`Lead-property match pairs: ${totalMatchPairs} (target >= ${DEMO_SEED_PLAN.minLeadPropertyMatches})`);
  console.log(`Leads outside ${minMatch}-${maxMatch} match range: ${leadsOutsideTargetRange.length === 0 ? "none" : JSON.stringify(leadsOutsideTargetRange)}`);
  console.log(`Execution time: ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log("\n--- Verification summary ---");
  console.log(JSON.stringify(verification, null, 2));

  const problems: string[] = [...verification.errors];
  if (totalMatchPairs < DEMO_SEED_PLAN.minLeadPropertyMatches) {
    problems.push(`Only ${totalMatchPairs} lead-property match pairs (target >= ${DEMO_SEED_PLAN.minLeadPropertyMatches}).`);
  }

  if (problems.length > 0) {
    console.error(`\n[seed-demo] ${problems.length} issue(s) found - see above. Seed data was still created.`);
    process.exitCode = 1;
  } else {
    console.log("\n[seed-demo] All checks passed. Dashboard, Reports, Notifications, Health Scores, and Smart Actions have real demo data to show.");
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
