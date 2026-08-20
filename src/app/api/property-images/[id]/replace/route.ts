import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { isStorageConfigured } from "@/lib/storage";
import { replacePropertyImage } from "@/lib/property-images";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getOrganizationId } from "@/lib/organization";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;

    const limitResult = await checkRateLimit("propertyImageUpload", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);
    if (!isStorageConfigured()) {
      throw new ApiError(503, "File storage is not configured on this deployment - see DEPLOYMENT.md 'File Storage'");
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "A file field is required");

    const buffer = Buffer.from(await file.arrayBuffer());

    const image = await replacePropertyImage({
      imageId: id,
      actorId: session.user.id,
      organizationId: getOrganizationId(session.user),
      role: session.user.role,
      fileName: file.name,
      mimeType: file.type,
      buffer,
    });

    return NextResponse.json({ image }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
