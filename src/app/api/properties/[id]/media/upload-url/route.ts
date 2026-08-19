import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { isStorageConfigured } from "@/lib/storage";
import { createPropertyImageUploadSession } from "@/lib/property-image-upload";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { z } from "zod";
import type { PropertyImagePurpose } from "@prisma/client";

const schema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive(),
  purpose: z.enum(["IMAGE", "FLOOR_PLAN", "AVAILABILITY_REPORT"]).default("IMAGE"),
  caption: z.string().max(500).nullable().optional(),
  isCover: z.boolean().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

/**
 * Step 1 of direct/presigned property media upload. Returns a short-lived
 * PUT URL (R2/S3/Mock) or method SERVER_MEDIATED (Firebase) - never secrets.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id } = await params;
    const limitResult = await checkRateLimit("propertyImageUpload", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);
    if (!isStorageConfigured()) throw new ApiError(503, "File storage is not configured on this deployment");

    const body = schema.parse(await req.json());
    const result = await createPropertyImageUploadSession({
      actorId: session.user.id,
      role: session.user.role,
      propertyId: id,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      purpose: body.purpose as PropertyImagePurpose,
      caption: body.caption,
      isCover: body.isCover,
      width: body.width,
      height: body.height,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
