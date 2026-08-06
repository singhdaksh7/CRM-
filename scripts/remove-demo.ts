/**
 * `npm run seed:remove` (also callable from the ADMIN-only dashboard
 * banner's "Delete Demo Data" button, via DELETE /api/admin/demo-data, which
 * uses a session/role + browser confirm() gate instead of the env-var
 * confirmation below - see safety-guard.ts) - deletes the KP-DEMO- dataset
 * without recreating it and without touching the Organization row or any
 * other existing record.
 *
 * Requires DEMO_REMOVE_CONFIRMATION=DELETE_KP_DEMO_DATA in addition to the
 * standard production-host gate, since this runs a batch of unconditional
 * deleteMany calls.
 */
import { PrismaClient } from "@prisma/client";
process.env.ALLOW_DEMO_SEED = "true";
import { assertDemoSeedSafe, assertDemoRemoveConfirmed } from "../src/lib/demo-data/safety-guard";
import { teardownDemoData } from "../src/lib/demo-data/teardown";
import { DEMO_ORGANIZATION_ID } from "../src/lib/demo-data/constants";

const prisma = new PrismaClient();

async function main() {
  const host = assertDemoSeedSafe();
  assertDemoRemoveConfirmed();

  console.log("\n--- Preflight: about to delete from ---");
  console.log(`  Database host:   ${host}`);
  console.log(`  Organization id: ${DEMO_ORGANIZATION_ID}`);
  console.log("  Scope: only rows whose id (or, for a few relation-linked tables, their");
  console.log('  demo parent\'s id) starts with "kp-demo-", AND organizationId matches above.\n');

  console.log("[remove-demo] Deleting KP-DEMO- dataset...");
  const { deletedCounts } = await teardownDemoData();
  const total = Object.values(deletedCounts).reduce((a, b) => a + b, 0);
  console.log(JSON.stringify(deletedCounts, null, 2));
  console.log(`\n[remove-demo] Done - ${total} rows deleted.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
