import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getOrganizationId } from "./organization";
import { recordAudit } from "./audit";
import { documentEntityField } from "./documents-entity";
import { verifyUploadedObject, uploadFileBuffer, buildDocumentObjectKey, activeStorageProviderName, assertFileAllowed, assertMagicBytesMatch, StorageValidationError } from "./storage";
import { canUploadDocumentCategory } from "./document-access";
import { logger } from "./logger";
import type { DocumentEntityType, DocumentCategory, Role } from "@prisma/client";

export { documentEntityField };

/** Confirms the linked entity actually exists (and belongs to this org) before saving document metadata. */
export async function assertDocumentEntityExists(entityType: DocumentEntityType, entityId: string, organizationId: string) {
  const exists = await ({
    PROPERTY: () => prisma.property.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }),
    LEAD: () => prisma.lead.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }),
    OWNER: () => prisma.owner.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }),
    DEAL: () => prisma.deal.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }),
    PAYMENT: () => prisma.payment.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }),
  }[entityType]());
  if (!exists) throw new ApiError(404, `${entityType.toLowerCase()} not found for document link`);
}

function entityIdFields(entityType: DocumentEntityType, entityId: string) {
  const fields: { propertyId: string | null; leadId: string | null; ownerId: string | null; dealId: string | null; paymentId: string | null } = {
    propertyId: null,
    leadId: null,
    ownerId: null,
    dealId: null,
    paymentId: null,
  };
  fields[documentEntityField(entityType)] = entityId;
  return fields;
}

/**
 * Server-mediated upload pipeline (the Firebase MVP path, also usable for
 * S3): server already holds the file bytes (from a multipart request), so
 * every step of the "Secure Upload Flow" in the task spec happens in one
 * call - role/category check, entity check, validation, object-key
 * generation, upload, post-upload verification (size/type + magic bytes),
 * DB record creation, and audit logging. Nothing is marked ACTIVE until
 * every prior step has succeeded.
 */
export async function uploadDocument(params: {
  actorId: string;
  role: Role;
  entityType: DocumentEntityType;
  entityId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  category?: DocumentCategory;
  expiresAt?: string | null;
}) {
  const organizationId = getOrganizationId(params.actorId);
  const category = params.category ?? "GENERAL";

  if (!canUploadDocumentCategory(params.role, category)) {
    throw new ApiError(403, `Role ${params.role} is not permitted to upload documents in category ${category}`);
  }

  await assertDocumentEntityExists(params.entityType, params.entityId, organizationId);

  try {
    assertFileAllowed({ category: "DOCUMENT", fileName: params.fileName, mimeType: params.mimeType, sizeBytes: params.buffer.byteLength });
    assertMagicBytesMatch(params.mimeType, params.buffer);
  } catch (err) {
    if (err instanceof StorageValidationError) {
      await recordAudit({
        userId: params.actorId,
        action: "OTHER",
        entityType: "Document",
        newValues: { event: "upload_verification_failed", entityType_: params.entityType, entityId_: params.entityId, reason: err.message },
        result: "FAILURE",
        errorMessage: err.message,
      });
      throw new ApiError(400, err.message);
    }
    throw err;
  }

  const objectKey = buildDocumentObjectKey({ organizationId, entityType: params.entityType, entityId: params.entityId, fileName: params.fileName });

  await recordAudit({
    userId: params.actorId,
    action: "OTHER",
    entityType: "Document",
    newValues: { event: "upload_requested", entityType_: params.entityType, entityId_: params.entityId, category },
  });

  const stored = await uploadFileBuffer(objectKey, params.buffer, params.mimeType);

  const document = await prisma.document.create({
    data: {
      organizationId,
      entityType: params.entityType,
      ...entityIdFields(params.entityType, params.entityId),
      fileName: params.fileName,
      fileUrl: "",
      storageKey: objectKey,
      storageProvider: activeStorageProviderName(),
      originalFilename: params.fileName,
      category,
      fileType: params.mimeType,
      fileSizeBytes: stored.sizeBytes,
      expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
      uploadedById: params.actorId,
    },
  });

  await recordAudit({
    userId: params.actorId,
    action: "CREATE",
    entityType: "Document",
    entityId: document.id,
    newValues: { event: "upload_completed", entityType_: params.entityType, entityId_: params.entityId, category, storageProvider: document.storageProvider },
  });
  logger.info("document_uploaded", { documentId: document.id, entityType: params.entityType, entityId: params.entityId, category, actorId: params.actorId });

  return document;
}

export async function replaceDocument(params: {
  documentId: string;
  actorId: string;
  fileName: string;
  fileType: string;
  fileUrl?: string;
  storageKey?: string;
  fileSizeBytes?: number | null;
}) {
  const organizationId = getOrganizationId(params.actorId);
  const previous = await prisma.document.findFirst({ where: { id: params.documentId, organizationId } });
  if (!previous) throw new ApiError(404, "Document not found");
  if (previous.status === "DELETED") throw new ApiError(409, "Cannot replace a deleted document");
  if (!params.storageKey && !params.fileUrl) throw new ApiError(400, "Either storageKey or fileUrl is required");

  let fileSizeBytes = params.fileSizeBytes ?? null;
  if (params.storageKey) {
    try {
      const verified = await verifyUploadedObject(params.storageKey);
      fileSizeBytes = verified.sizeBytes;
    } catch {
      throw new ApiError(400, "Upload not found in storage - the presigned upload may not have completed");
    }
  }

  // The new version is created (and only committed to being "current" once
  // this succeeds) before the previous version's status changes - if
  // anything above throws, the previous version is untouched and no
  // physical object is deleted either way, so a failed replacement always
  // preserves the original.
  const next = await prisma.document.create({
    data: {
      organizationId,
      entityType: previous.entityType,
      propertyId: previous.propertyId,
      leadId: previous.leadId,
      ownerId: previous.ownerId,
      dealId: previous.dealId,
      paymentId: previous.paymentId,
      fileName: params.fileName,
      fileUrl: params.fileUrl ?? "",
      storageKey: params.storageKey ?? null,
      storageProvider: params.storageKey ? activeStorageProviderName() : previous.storageProvider,
      originalFilename: params.fileName,
      category: previous.category,
      fileType: params.fileType,
      fileSizeBytes,
      version: previous.version + 1,
      previousDocumentId: previous.id,
      uploadedById: params.actorId,
    },
  });

  await prisma.document.update({ where: { id: previous.id }, data: { status: "EXPIRED" } });

  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "Document",
    entityId: previous.id,
    oldValues: { fileUrl: previous.fileUrl, version: previous.version },
    newValues: { event: "document_replaced", fileUrl: next.fileUrl, version: next.version, replacedBy: next.id },
  });
  logger.info("document_replaced", { documentId: previous.id, newDocumentId: next.id, version: next.version, actorId: params.actorId });

  return next;
}
