import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { assertDocumentEntityExists } from "@/lib/documents";
import { isStorageConfigured, buildObjectKey, createUploadUrl, StorageValidationError } from "@/lib/storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { z } from "zod";

const requestSchema = z.object({
  entityType: z.enum(["PROPERTY", "LEAD", "OWNER", "DEAL", "PAYMENT"]),
  entityId: z.string(),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSizeBytes: z.number().int().positive().optional(),
});

/**
 * Step 1 of the upload flow: returns a short-lived presigned PUT URL the
 * browser uploads directly to (file bytes never pass through this server).
 * Step 2 is POST /api/documents with the returned `key` as `storageKey`.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limitResult = await checkRateLimit("upload", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);
    if (!isStorageConfigured()) {
      throw new ApiError(503, "File storage is not configured on this deployment - see DEPLOYMENT.md 'File Storage'");
    }

    const organizationId = getOrganizationId(session.user.id);
    const data = requestSchema.parse(await req.json());
    await assertDocumentEntityExists(data.entityType, data.entityId, organizationId);

    const key = buildObjectKey({ organizationId, entityType: data.entityType, entityId: data.entityId, fileName: data.fileName });

    try {
      const result = await createUploadUrl({ key, fileType: data.fileType, fileSizeBytes: data.fileSizeBytes });
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof StorageValidationError) throw new ApiError(400, err.message);
      throw err;
    }
  } catch (err) {
    return handleApiError(err);
  }
}
