import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { getCatalogueById, revokeCatalogue } from "@/lib/catalogues";
import { getOrganizationId } from "@/lib/organization";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; catalogueId: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id, catalogueId } = await params;
    await assertLeadAccessible(session, id);
    const organizationId = getOrganizationId(session.user);

    const existing = await getCatalogueById(catalogueId, organizationId);
    if (existing.leadId !== id) throw new ApiError(404, "Catalogue not found for this lead");

    const catalogue = await revokeCatalogue(catalogueId, organizationId, session.user.id);
    return NextResponse.json({ catalogue });
  } catch (err) {
    return handleApiError(err);
  }
}
