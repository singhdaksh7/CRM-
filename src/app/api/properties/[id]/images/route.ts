import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { isStorageConfigured } from "@/lib/storage";
import { uploadPropertyImage, listPropertyImages, getPropertyImageUrl } from "@/lib/property-images";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { PropertyImagePurpose } from "@prisma/client";

const PURPOSES = new Set<PropertyImagePurpose>(["IMAGE", "FLOOR_PLAN", "AVAILABILITY_REPORT"]);

/** Lists active images for a property with fresh, short-lived delivery URLs - every authenticated role may view listing images. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const limitResult = await checkRateLimit("propertyImageAccess", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const organizationId = getOrganizationId(session.user.id);
    const images = await listPropertyImages(id, organizationId);
    const withUrls = await Promise.all(
      images.map(async (img) => ({ ...img, url: await getPropertyImageUrl(img.storageKey) }))
    );
    return NextResponse.json({ images: withUrls });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id } = await params;

    const limitResult = await checkRateLimit("propertyImageUpload", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);
    if (!isStorageConfigured()) {
      throw new ApiError(503, "File storage is not configured on this deployment - see DEPLOYMENT.md 'File Storage'");
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "A file field is required");

    const purposeRaw = form.get("purpose");
    const purpose = typeof purposeRaw === "string" && PURPOSES.has(purposeRaw as PropertyImagePurpose) ? (purposeRaw as PropertyImagePurpose) : "IMAGE";
    const caption = form.get("caption");
    const isCover = form.get("isCover") === "true";

    const buffer = Buffer.from(await file.arrayBuffer());

    const image = await uploadPropertyImage({
      actorId: session.user.id,
      role: session.user.role,
      propertyId: id,
      fileName: file.name,
      mimeType: file.type,
      buffer,
      purpose,
      caption: typeof caption === "string" ? caption : null,
      isCover,
    });

    return NextResponse.json({ image }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
