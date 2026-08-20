import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { updateCatalogueSchema } from "@/lib/validators";
import { getCatalogueById, updateCatalogue, buildCatalogueMessageText } from "@/lib/catalogues";
import { getOrganizationId } from "@/lib/organization";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; catalogueId: string }> }) {
  try {
    const session = await requireSession();
    const { id, catalogueId } = await params;
    await assertLeadAccessible(session, id);

    const catalogue = await getCatalogueById(catalogueId, getOrganizationId(session.user));
    if (catalogue.leadId !== id) throw new ApiError(404, "Catalogue not found for this lead");

    return NextResponse.json({ catalogue, previewMessage: buildCatalogueMessageText(catalogue) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; catalogueId: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id, catalogueId } = await params;
    await assertLeadAccessible(session, id);
    const organizationId = getOrganizationId(session.user);

    const existing = await getCatalogueById(catalogueId, organizationId);
    if (existing.leadId !== id) throw new ApiError(404, "Catalogue not found for this lead");

    const data = updateCatalogueSchema.parse(await req.json());
    const catalogue = await updateCatalogue(catalogueId, organizationId, {
      ...data,
      expiresAt: data.expiresAt === undefined ? undefined : data.expiresAt ? new Date(data.expiresAt) : null,
    });

    return NextResponse.json({ catalogue });
  } catch (err) {
    return handleApiError(err);
  }
}
