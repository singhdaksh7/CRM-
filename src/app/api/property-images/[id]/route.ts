import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { softDeletePropertyImage, physicalDeletePropertyImage, updatePropertyImage } from "@/lib/property-images";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getOrganizationId } from "@/lib/organization";

/** Edits caption and/or sets this image as the cover - the full delete/replace flows live in sibling routes. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;

    const limitResult = await checkRateLimit("propertyImageUpload", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const body = await req.json();
    const caption = typeof body.caption === "string" ? body.caption : body.caption === null ? null : undefined;
    const isCover = typeof body.isCover === "boolean" ? body.isCover : undefined;

    const image = await updatePropertyImage({ imageId: id, actorId: session.user.id, organizationId: getOrganizationId(session.user), role: session.user.role, caption, isCover });
    return NextResponse.json({ image });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;

    const limitResult = await checkRateLimit("documentDelete", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const organizationId = getOrganizationId(session.user);
    const image = await softDeletePropertyImage({ imageId: id, actorId: session.user.id, organizationId, role: session.user.role });

    const physical = req.nextUrl.searchParams.get("physical") === "true";
    if (physical) {
      await physicalDeletePropertyImage({ imageId: id, actorId: session.user.id, organizationId, role: session.user.role });
    }

    return NextResponse.json({ image });
  } catch (err) {
    return handleApiError(err);
  }
}
