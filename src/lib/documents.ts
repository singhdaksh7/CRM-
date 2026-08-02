import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getOrganizationId } from "./organization";
import { recordAudit } from "./audit";
import { documentEntityField } from "./documents-entity";
import { verifyUploadedObject } from "./storage";
import { logger } from "./logger";
import type { DocumentEntityType } from "@prisma/client";

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
    newValues: { fileUrl: next.fileUrl, version: next.version, replacedBy: next.id },
  });
  logger.info("document_replaced", { documentId: previous.id, newDocumentId: next.id, version: next.version, actorId: params.actorId });

  return next;
}
