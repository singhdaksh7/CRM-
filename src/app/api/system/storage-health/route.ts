import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { isStorageConfigured, activeStorageProviderName, uploadFileBuffer, getObjectMetadata, createDownloadUrl, deleteObject } from "@/lib/storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// A minimal valid 1x1 transparent PNG - just enough to pass the magic-byte
// signature check, never anything derived from real uploaded content.
const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/**
 * Admin-only deep storage test: uploads a tiny synthetic object, reads its
 * metadata, generates (but never returns) a download authorization, then
 * deletes it - cleanup runs even if an earlier step fails. Distinct from
 * GET /api/system/status's cheap config-only storage check, which never
 * touches the bucket. Never exposes credentials, signed URLs, or bucket
 * internals in the response.
 */
export async function POST() {
  const steps: Record<string, "ok" | "failed" | "skipped"> = {
    upload: "skipped",
    readMetadata: "skipped",
    authorizeDownload: "skipped",
    delete: "skipped",
  };
  let objectKey: string | null = null;

  try {
    const session = await requireSession(["ADMIN"]);
    const limitResult = await checkRateLimit("document", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    if (!isStorageConfigured()) {
      return NextResponse.json({ success: false, provider: activeStorageProviderName(), detail: "Storage is not configured", steps }, { status: 503 });
    }

    const organizationId = getOrganizationId(session.user);
    objectKey = `organizations/${organizationId}/_health-checks/${randomUUID()}.png`;
    const buffer = Buffer.from(TEST_PNG_BASE64, "base64");

    try {
      await uploadFileBuffer(objectKey, buffer, "image/png");
      steps.upload = "ok";

      const metadata = await getObjectMetadata(objectKey);
      steps.readMetadata = metadata.sizeBytes === buffer.byteLength ? "ok" : "failed";

      await createDownloadUrl(objectKey, 60);
      steps.authorizeDownload = "ok";
    } finally {
      // Always attempt cleanup, even if an earlier step threw.
      if (objectKey) {
        try {
          await deleteObject(objectKey);
          steps.delete = "ok";
        } catch (err) {
          steps.delete = "failed";
          logger.error("storage_health_cleanup_failed", { message: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    const success = Object.values(steps).every((s) => s === "ok");
    logger.info("storage_health_check", { actorId: session.user.id, provider: activeStorageProviderName(), success, steps });

    return NextResponse.json({ success, provider: activeStorageProviderName(), steps });
  } catch (err) {
    logger.error("storage_health_check_failed", { message: err instanceof Error ? err.message : String(err) });
    return handleApiError(err);
  }
}
