import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";

/** Objective 2 - Dashboard analytics must separate Direct vs Indirect inventory. One bounded groupBy, never a per-property loop. */
export async function GET() {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);

    const groups = await prisma.property.groupBy({
      by: ["inventorySource", "status"],
      where: { organizationId },
      _count: true,
    });

    const summary = { DIRECT: { total: 0, available: 0 }, INDIRECT: { total: 0, available: 0 } };
    for (const g of groups) {
      const bucket = summary[g.inventorySource];
      bucket.total += g._count;
      if (g.status === "AVAILABLE") bucket.available += g._count;
    }

    return NextResponse.json({ inventorySplit: summary });
  } catch (err) {
    return handleApiError(err);
  }
}
