import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { isDemoDataLoaded } from "@/lib/demo-data/status";
import { teardownDemoData } from "@/lib/demo-data/teardown";

/** ADMIN-only: whether the KP-DEMO- demo dataset is currently present. Backs the dashboard banner. */
export async function GET() {
  try {
    await requireSession(["ADMIN"]);
    const loaded = await isDemoDataLoaded();
    return NextResponse.json({ loaded });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * ADMIN-only: deletes the KP-DEMO- demo dataset (and nothing else - every
 * table is filtered by the "kp-demo-" id prefix, see teardown.ts). This is
 * a removal, not a production-write, so it does not go through the
 * seed-only safety-guard - deleting demo rows out of production is always
 * the safe direction, unlike inserting them.
 */
export async function DELETE() {
  try {
    await requireSession(["ADMIN"]);
    const { deletedCounts } = await teardownDemoData();
    const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);
    return NextResponse.json({ deletedCounts, totalDeleted });
  } catch (err) {
    return handleApiError(err);
  }
}
