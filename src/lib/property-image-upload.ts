import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { getOrganizationId } from "./organization";
import { recordAudit } from "./audit";
import { logger } from "./logger";
import {
  buildPropertyImageObjectKey,
  createPropertyImageUploadUrl,
  verifyUploadedObject,
  activeStorageProviderName,
  assertFileAllowed,
  StorageValidationError,
  isStorageConfigured,
  MAX_PROPERTY_IMAGE_COUNT_DEFAULT,
} from "./storage";
import { sanitizeOriginalFilename } from "./image-optimize";
import { getSystemConfig } from "./system-config";
import type { MediaVisibility, PropertyImagePurpose, Role } from "@prisma/client";

function canUploadPropertyImage(role: Role, purpose: PropertyImagePurpose): boolean {
  if (role === "ADMIN" || role === "DATA_MANAGER") return true;
  if (role === "FIELD_EXECUTIVE") return purpose === "IMAGE" || purpose === "AVAILABILITY_REPORT";
  return false;
}

async function assertPropertyExists(propertyId: string, organizationId: string) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId }, select: { id: true } });
  if (!property) throw new ApiError(404, "Property not found");
}

async function getMaxImagesPerProperty(organizationId: string): Promise<number> {
  const config = await getSystemConfig(organizationId);
  return config.maxImagesPerProperty ?? MAX_PROPERTY_IMAGE_COUNT_DEFAULT;
}

export async function assertPropertyImageQuota(propertyId: string, organizationId: string) {
  const max = await getMaxImagesPerProperty(organizationId);
  const count = await prisma.propertyImage.count({ where: { propertyId, organizationId, status: "ACTIVE", purpose: "IMAGE" } });
  if (count >= max) {
    throw new ApiError(400, `Property already has ${count} images (limit ${max})`);
  }
}

/**
 * Step 1: authorize a short-lived upload. Object key is generated server-side
 * and stored in StorageUploadSession - the client never chooses the path.
 */
export async function createPropertyImageUploadSession(params: {
  actorId: string;
  role: Role;
  propertyId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  purpose?: PropertyImagePurpose;
  caption?: string | null;
  isCover?: boolean;
  visibility?: MediaVisibility;
  width?: number | null;
  height?: number | null;
}) {
  if (!isStorageConfigured()) {
    throw new ApiError(503, "File storage is not configured on this deployment - see DEPLOYMENT.md 'File Storage'");
  }

  const organizationId = getOrganizationId(params.actorId);
  const purpose = params.purpose ?? "IMAGE";
  const visibility: MediaVisibility =
    params.visibility ?? (purpose === "AVAILABILITY_REPORT" ? "PRIVATE" : "PUBLIC");

  if (!canUploadPropertyImage(params.role, purpose)) {
    throw new ApiError(403, `Role ${params.role} is not permitted to upload ${purpose === "FLOOR_PLAN" ? "floor plans" : "property images"}`);
  }
  await assertPropertyExists(params.propertyId, organizationId);
  if (purpose === "IMAGE") await assertPropertyImageQuota(params.propertyId, organizationId);

  const originalFilename = sanitizeOriginalFilename(params.fileName);
  try {
    assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: originalFilename, mimeType: params.mimeType, sizeBytes: params.sizeBytes });
  } catch (err) {
    if (err instanceof StorageValidationError) throw new ApiError(400, err.message);
    throw err;
  }

  const objectKey = buildPropertyImageObjectKey({
    organizationId,
    propertyId: params.propertyId,
    fileName: originalFilename,
    purpose,
  });

  const upload = await createPropertyImageUploadUrl({
    key: objectKey,
    fileName: originalFilename,
    fileType: params.mimeType,
    fileSizeBytes: params.sizeBytes,
  });

  const expiresAt = new Date(Date.now() + Math.max(60, upload.expiresIn || 300) * 1000);
  const session = await prisma.storageUploadSession.create({
    data: {
      organizationId,
      actorId: params.actorId,
      objectKey,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      originalFilename,
      purpose: "PROPERTY_IMAGE",
      entityType: "PROPERTY",
      entityId: params.propertyId,
      imagePurpose: purpose,
      visibility,
      isCover: !!params.isCover,
      caption: params.caption ?? null,
      status: "PENDING",
      expiresAt,
    },
  });

  await recordAudit({
    userId: params.actorId,
    action: "OTHER",
    entityType: "PropertyImage",
    newValues: { event: "upload_session_created", propertyId: params.propertyId, purpose, sessionId: session.id },
  });

  return {
    sessionId: session.id,
    method: upload.method,
    uploadUrl: upload.uploadUrl,
    objectKey,
    expiresIn: upload.expiresIn,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Step 2: confirm upload. Idempotent on sessionId / objectKey - repeated
 * confirms return the same PropertyImage without creating duplicates.
 */
export async function confirmPropertyImageUpload(params: {
  actorId: string;
  role: Role;
  propertyId: string;
  sessionId: string;
  width?: number | null;
  height?: number | null;
}) {
  const organizationId = getOrganizationId(params.actorId);
  const session = await prisma.storageUploadSession.findFirst({
    where: { id: params.sessionId, organizationId, entityId: params.propertyId, purpose: "PROPERTY_IMAGE" },
  });
  if (!session) throw new ApiError(404, "Upload session not found");
  if (session.actorId !== params.actorId && params.role !== "ADMIN") {
    throw new ApiError(403, "Upload session belongs to another user");
  }
  if (session.status === "EXPIRED" || session.expiresAt < new Date()) {
    await prisma.storageUploadSession.update({ where: { id: session.id }, data: { status: "EXPIRED" } });
    throw new ApiError(410, "Upload session expired");
  }

  if (session.status === "CONFIRMED" && session.propertyImageId) {
    const existing = await prisma.propertyImage.findFirst({ where: { id: session.propertyImageId, organizationId } });
    if (existing) return existing;
  }

  let verified;
  try {
    verified = await verifyUploadedObject(session.objectKey);
  } catch {
    await prisma.storageUploadSession.update({ where: { id: session.id }, data: { status: "FAILED" } });
    throw new ApiError(400, "Upload not found in storage - the presigned upload may not have completed");
  }

  if (session.sizeBytes && verified.sizeBytes > session.sizeBytes * 1.05) {
    throw new ApiError(400, "Uploaded object exceeds authorized size");
  }

  const purpose = session.imagePurpose ?? "IMAGE";
  if (!canUploadPropertyImage(params.role, purpose)) {
    throw new ApiError(403, "Not permitted to confirm this upload");
  }

  // Idempotency: unique storageKey - if a row already exists, attach and return.
  const preexisting = await prisma.propertyImage.findFirst({ where: { storageKey: session.objectKey, organizationId } });
  if (preexisting) {
    await prisma.storageUploadSession.update({
      where: { id: session.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), propertyImageId: preexisting.id },
    });
    return preexisting;
  }

  if (session.isCover) {
    await prisma.propertyImage.updateMany({
      where: { propertyId: params.propertyId, status: "ACTIVE", isCover: true },
      data: { isCover: false },
    });
  }

  const activeCount = await prisma.propertyImage.count({
    where: { propertyId: params.propertyId, status: "ACTIVE", purpose: "IMAGE" },
  });
  const makeCover = session.isCover || (purpose === "IMAGE" && activeCount === 0);

  if (purpose === "IMAGE") await assertPropertyImageQuota(params.propertyId, organizationId);

  const maxSortOrder = await prisma.propertyImage.aggregate({
    where: { propertyId: params.propertyId, status: "ACTIVE" },
    _max: { sortOrder: true },
  });

  const image = await prisma.$transaction(async (tx) => {
    const created = await tx.propertyImage.create({
      data: {
        organizationId,
        propertyId: params.propertyId,
        purpose,
        visibility: session.visibility,
        storageProvider: activeStorageProviderName(),
        storageKey: session.objectKey,
        originalFilename: session.originalFilename,
        mimeType: session.mimeType,
        sizeBytes: verified.sizeBytes,
        width: params.width ?? null,
        height: params.height ?? null,
        caption: session.caption,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
        isCover: makeCover,
        uploadedById: params.actorId,
      },
    });
    await tx.storageUploadSession.update({
      where: { id: session.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), propertyImageId: created.id },
    });
    return created;
  });

  await recordAudit({
    userId: params.actorId,
    action: "CREATE",
    entityType: "PropertyImage",
    entityId: image.id,
    newValues: { event: "upload_confirmed", propertyId: params.propertyId, purpose, isCover: image.isCover, sessionId: session.id },
  });
  logger.info("property_image_upload_confirmed", { imageId: image.id, propertyId: params.propertyId, actorId: params.actorId });

  return image;
}

export async function expireAbandonedUploadSessions(limit = 100): Promise<number> {
  const result = await prisma.storageUploadSession.updateMany({
    where: { status: { in: ["PENDING", "UPLOADED"] }, expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  if (result.count > 0) logger.info("storage_upload_sessions_expired", { count: result.count, limit });
  return result.count;
}
