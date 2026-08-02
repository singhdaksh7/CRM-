import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { isStorageConfigured } from "@/lib/storage";
import { uploadDocument } from "@/lib/documents";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { DocumentCategory, DocumentEntityType } from "@prisma/client";

const ENTITY_TYPES = new Set<DocumentEntityType>(["PROPERTY", "LEAD", "OWNER", "DEAL", "PAYMENT"]);
const CATEGORIES = new Set<DocumentCategory>([
  "GENERAL", "AADHAAR", "PAN", "REGISTRY", "OWNERSHIP_PROOF",
  "RENT_AGREEMENT", "SALE_AGREEMENT", "BROKERAGE_AGREEMENT", "DEAL_DOCUMENT", "PAYMENT_RECEIPT", "OWNER_IDENTITY",
]);

/**
 * Server-mediated upload route (the Firebase MVP path from the task spec,
 * also usable for S3): the browser POSTs the file directly here as
 * multipart/form-data instead of receiving a presigned PUT URL first. See
 * lib/documents.ts#uploadDocument for the full validate -> upload -> verify
 * -> record -> audit pipeline this delegates to.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limitResult = await checkRateLimit("upload", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);
    if (!isStorageConfigured()) {
      throw new ApiError(503, "File storage is not configured on this deployment - see DEPLOYMENT.md 'File Storage'");
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "A file field is required");

    const entityType = form.get("entityType");
    const entityId = form.get("entityId");
    if (typeof entityType !== "string" || !ENTITY_TYPES.has(entityType as DocumentEntityType)) {
      throw new ApiError(400, "A valid entityType is required");
    }
    if (typeof entityId !== "string" || entityId.length === 0) {
      throw new ApiError(400, "entityId is required");
    }

    const categoryRaw = form.get("category");
    const category = typeof categoryRaw === "string" && CATEGORIES.has(categoryRaw as DocumentCategory) ? (categoryRaw as DocumentCategory) : "GENERAL";

    const expiresAtRaw = form.get("expiresAt");
    const expiresAt = typeof expiresAtRaw === "string" && expiresAtRaw.length > 0 ? expiresAtRaw : null;

    const buffer = Buffer.from(await file.arrayBuffer());

    const document = await uploadDocument({
      actorId: session.user.id,
      role: session.user.role,
      entityType: entityType as DocumentEntityType,
      entityId,
      fileName: file.name,
      mimeType: file.type,
      buffer,
      category,
      expiresAt,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
