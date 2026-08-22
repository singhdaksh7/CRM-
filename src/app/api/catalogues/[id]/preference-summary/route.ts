import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { getCataloguePreferenceSummary } from "@/lib/catalogue-property-preferences";
import { assertLeadAccessible } from "@/lib/lead-access";
import { prisma } from "@/lib/prisma";

/** Internal catalogue preference summary for CRM views (not public). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const { id } = await params;

    const catalogue = await prisma.catalogueShare.findFirst({
      where: { id, organizationId },
      select: { id: true, leadId: true },
    });
    if (!catalogue) return NextResponse.json({ error: "Catalogue not found" }, { status: 404 });
    await assertLeadAccessible({ user: session.user }, catalogue.leadId);

    const summary = await getCataloguePreferenceSummary(id, organizationId);
    return NextResponse.json({ summary });
  } catch (err) {
    return handleApiError(err);
  }
}
