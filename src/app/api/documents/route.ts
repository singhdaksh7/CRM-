import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { documentMetadataSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { assertDocumentEntityExists, documentEntityField } from "@/lib/documents";
import { canUploadDocumentCategory } from "@/lib/document-access";
import { recordAudit } from "@/lib/audit";
import { readTake, readSkip } from "@/lib/pagination";
import { verifyUploadedObject, activeStorageProviderName } from "@/lib/storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user.id);
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = { organizationId, status: { not: "DELETED" } };

    const entityType = sp.get("entityType");
    const entityId = sp.get("entityId");
    if (entityType) {
      where.entityType = entityType;
      if (entityId) where[documentEntityField(entityType as never)] = entityId;
    }

    // Additive filters for the Document Vault UI - all optional, none change
    // the shape of an existing call site that omits them.
    const category = sp.get("category");
    if (category) where.category = category;
    const status = sp.get("status");
    if (status) where.status = status; // overrides the default "not DELETED" scoping above when explicitly requested
    const q = sp.get("q");
    if (q) where.fileName = { contains: q };

    // expiringWithinDays: documents whose expiry falls within N days from now (for the "Expiring Soon" KPI).
    const expiringWithinDays = sp.get("expiringWithinDays");
    if (expiringWithinDays) {
      const days = Number(expiringWithinDays);
      if (Number.isFinite(days) && days > 0) {
        where.expiresAt = { gte: new Date(), lte: new Date(Date.now() + days * 86400000) };
      }
    }
    // createdAfter: ISO date string (for the "Recently Uploaded" KPI).
    const createdAfter = sp.get("createdAfter");
    if (createdAfter) {
      const date = new Date(createdAfter);
      if (!Number.isNaN(date.getTime())) where.createdAt = { gte: date };
    }

    const take = readTake(sp);
    const skip = readSkip(sp);
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.document.count({ where }),
    ]);
    return NextResponse.json({ documents, total, take, skip });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limitResult = await checkRateLimit("document", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const organizationId = getOrganizationId(session.user.id);
    const body = await req.json();
    const data = documentMetadataSchema.parse(body);

    const field = documentEntityField(data.entityType);
    const entityId = data[field];
    if (!entityId) throw new ApiError(400, `${field} is required for entityType ${data.entityType}`);
    if (!canUploadDocumentCategory(session.user.role, data.category)) {
      throw new ApiError(403, `Role ${session.user.role} is not permitted to upload documents in category ${data.category}`);
    }
    await assertDocumentEntityExists(data.entityType, entityId, organizationId);

    // If this document was uploaded through our storage flow (storageKey
    // present), verify the object actually landed in the bucket - and use
    // its real size/type rather than trusting whatever the client claimed.
    let fileSizeBytes = data.fileSizeBytes ?? null;
    if (data.storageKey) {
      try {
        const verified = await verifyUploadedObject(data.storageKey);
        fileSizeBytes = verified.sizeBytes;
      } catch (err) {
        await recordAudit({
          userId: session.user.id,
          action: "OTHER",
          entityType: "Document",
          newValues: { event: "upload_verification_failed", entityType_: data.entityType, entityId_: entityId, storageKey: data.storageKey },
          result: "FAILURE",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        throw new ApiError(400, "Upload not found in storage - the presigned upload may not have completed");
      }
    }

    const document = await prisma.document.create({
      data: {
        organizationId,
        entityType: data.entityType,
        propertyId: data.propertyId,
        leadId: data.leadId,
        ownerId: data.ownerId,
        dealId: data.dealId,
        paymentId: data.paymentId,
        fileName: data.fileName,
        fileUrl: data.fileUrl ?? "",
        storageKey: data.storageKey ?? null,
        storageProvider: data.storageKey ? activeStorageProviderName() : null,
        originalFilename: data.fileName,
        category: data.category,
        fileType: data.fileType,
        fileSizeBytes,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        uploadedById: session.user.id,
      },
    });

    if (data.entityType === "OWNER") {
      await prisma.activity.create({
        data: {
          crmOwnerId: entityId,
          type: "OWNER_DOCUMENT_ADDED",
          description: `Document "${document.fileName}" uploaded`,
          actorId: session.user.id,
        },
      });
    }

    await recordAudit({ userId: session.user.id, action: "CREATE", entityType: "Document", entityId: document.id, newValues: { event: "upload_completed", ...data } });
    logger.info("document_uploaded", { documentId: document.id, entityType: data.entityType, entityId, storageKey: data.storageKey ?? null, actorId: session.user.id });

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
