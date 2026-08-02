import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { getCatalogueById, sendCatalogue } from "@/lib/catalogues";

/** Field Executives may send/share an already-created catalogue, but (per Phase 2B.11) may not create or revoke one. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; catalogueId: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id, catalogueId } = await params;
    await assertLeadAccessible(session, id);

    const existing = await getCatalogueById(catalogueId);
    if (existing.leadId !== id) throw new ApiError(404, "Catalogue not found for this lead");

    const result = await sendCatalogue(catalogueId, session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
