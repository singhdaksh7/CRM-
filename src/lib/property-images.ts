import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { recordAudit } from "./audit";
import { logger } from "./logger";
import {
  buildPropertyImageObjectKey,
  uploadFileBuffer,
  activeStorageProviderName,
  assertFileAllowed,
  assertMagicBytesMatch,
  createDownloadUrl,
  deleteObject,
  StorageValidationError,
} from "./storage";
import type { PropertyImagePurpose, Role } from "@prisma/client";

/** Field Executives may upload IMAGE (property visit photos) and AVAILABILITY_REPORT (Phase 4 evidence photos), never floor plans - see role matrix in the task spec. */
function canUploadPropertyImage(role: Role, purpose: PropertyImagePurpose): boolean {
  if (role === "ADMIN" || role === "DATA_MANAGER") return true;
  if (role === "FIELD_EXECUTIVE") return purpose === "IMAGE" || purpose === "AVAILABILITY_REPORT";
  return false;
}

async function assertPropertyExists(propertyId: string, organizationId: string) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId }, select: { id: true } });
  if (!property) throw new ApiError(404, "Property not found");
}

export async function uploadPropertyImage(params: {
  actorId: string;
  organizationId: string;
  role: Role;
  propertyId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  purpose?: PropertyImagePurpose;
  caption?: string | null;
  isCover?: boolean;
}) {
  const organizationId = params.organizationId;
  const purpose = params.purpose ?? "IMAGE";

  if (!canUploadPropertyImage(params.role, purpose)) {
    throw new ApiError(403, `Role ${params.role} is not permitted to upload ${purpose === "FLOOR_PLAN" ? "floor plans" : "property images"}`);
  }
  await assertPropertyExists(params.propertyId, organizationId);

  try {
    assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: params.fileName, mimeType: params.mimeType, sizeBytes: params.buffer.byteLength });
    assertMagicBytesMatch(params.mimeType, params.buffer);
  } catch (err) {
    if (err instanceof StorageValidationError) {
      await recordAudit({
        userId: params.actorId,
        action: "OTHER",
        entityType: "PropertyImage",
        newValues: { event: "upload_verification_failed", propertyId: params.propertyId, reason: err.message },
        result: "FAILURE",
        errorMessage: err.message,
      });
      throw new ApiError(400, err.message);
    }
    throw err;
  }

  const objectKey = buildPropertyImageObjectKey({ organizationId, propertyId: params.propertyId, fileName: params.fileName, purpose });

  await recordAudit({
    userId: params.actorId,
    action: "OTHER",
    entityType: "PropertyImage",
    newValues: { event: "upload_requested", propertyId: params.propertyId, purpose },
  });

  const stored = await uploadFileBuffer(objectKey, params.buffer, params.mimeType);

  const maxSortOrder = await prisma.propertyImage.aggregate({
    where: { propertyId: params.propertyId, status: "ACTIVE" },
    _max: { sortOrder: true },
  });
  const activeImageCount = await prisma.propertyImage.count({
    where: { propertyId: params.propertyId, status: "ACTIVE", purpose: "IMAGE" },
  });
  // First IMAGE becomes cover automatically; explicit isCover also wins. Floor plans never auto-cover.
  const shouldBeCover = purpose === "IMAGE" && (!!params.isCover || activeImageCount === 0);

  if (shouldBeCover) {
    await prisma.propertyImage.updateMany({ where: { propertyId: params.propertyId, status: "ACTIVE", isCover: true }, data: { isCover: false } });
  }

  const image = await prisma.propertyImage.create({
    data: {
      organizationId,
      propertyId: params.propertyId,
      purpose,
      visibility: purpose === "AVAILABILITY_REPORT" ? "PRIVATE" : "PUBLIC",
      storageProvider: activeStorageProviderName(),
      storageKey: objectKey,
      originalFilename: params.fileName,
      mimeType: params.mimeType,
      sizeBytes: stored.sizeBytes,
      caption: params.caption ?? null,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
      isCover: shouldBeCover,
      uploadedById: params.actorId,
    },
  });

  await recordAudit({
    userId: params.actorId,
    action: "CREATE",
    entityType: "PropertyImage",
    entityId: image.id,
    newValues: { event: "upload_completed", propertyId: params.propertyId, purpose, isCover: image.isCover },
  });
  if (image.isCover) {
    await recordAudit({ userId: params.actorId, action: "UPDATE", entityType: "PropertyImage", entityId: image.id, newValues: { event: "property_image_made_public", propertyId: params.propertyId } });
  }
  logger.info("property_image_uploaded", { imageId: image.id, propertyId: params.propertyId, purpose, actorId: params.actorId });

  return image;
}

/** Active (non-deleted) images for a property, in display order. Every role that can see the property may see its listing images - no category restriction the way private documents have one. */
export async function listPropertyImages(propertyId: string, organizationId: string) {
  return prisma.propertyImage.findMany({
    where: { propertyId, organizationId, status: "ACTIVE" },
    orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
  });
}

/** Short-lived, controlled-delivery URL - never a permanent public link, even for catalogue-safe images. */
export async function getPropertyImageUrl(storageKey: string, expiresInSeconds?: number): Promise<string> {
  return createDownloadUrl(storageKey, expiresInSeconds);
}

/**
 * Batch cover-image lookup for list/grid views (property cards, public
 * catalogue) - one query for every property id instead of N, returning a
 * signed URL only for properties that actually have an ACTIVE cover
 * PropertyImage. Callers fall back to the legacy Property.coverImage scalar
 * when a given id is absent from the returned map.
 */
export async function getCoverImageUrls(propertyIds: string[], organizationId: string): Promise<Record<string, string>> {
  if (propertyIds.length === 0) return {};
  const covers = await prisma.propertyImage.findMany({
    where: { propertyId: { in: propertyIds }, organizationId, status: "ACTIVE", purpose: "IMAGE", isCover: true, visibility: "PUBLIC" },
  });
  const entries = await Promise.all(
    covers.map(async (c) => {
      try {
        return [c.propertyId, await getPropertyImageUrl(c.thumbnailKey ?? c.storageKey)] as const;
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, string] => e !== null));
}

/**
 * Ordered public IMAGE urls for a single property (catalogue detail / public page).
 * Never includes PRIVATE visibility or AVAILABILITY_REPORT evidence.
 */
export async function getPublicOrderedImageUrls(propertyId: string, organizationId: string): Promise<string[]> {
  const images = await prisma.propertyImage.findMany({
    where: { propertyId, organizationId, status: "ACTIVE", purpose: "IMAGE", visibility: "PUBLIC" },
    orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
    take: 50,
  });
  const urls: string[] = [];
  for (const img of images) {
    try {
      urls.push(await getPropertyImageUrl(img.storageKey));
    } catch {
      // Provider misconfigured - skip rather than crash public pages.
    }
  }
  return urls;
}

/** Soft-delete then promote next IMAGE as cover when the deleted row was the cover. */
export async function softDeletePropertyImage(params: { imageId: string; actorId: string; organizationId: string; role: Role }) {
  const organizationId = params.organizationId;
  const existing = await prisma.propertyImage.findFirst({ where: { id: params.imageId, organizationId } });
  if (!existing) throw new ApiError(404, "Property image not found");
  if (params.role !== "ADMIN" && params.role !== "DATA_MANAGER") throw new ApiError(403, "You do not have permission to delete property images");

  const image = await prisma.$transaction(async (tx) => {
    const deleted = await tx.propertyImage.update({
      where: { id: params.imageId },
      data: { status: "DELETED", deletedAt: new Date(), isCover: false },
    });

    if (existing.isCover) {
      const next = await tx.propertyImage.findFirst({
        where: { propertyId: existing.propertyId, organizationId, status: "ACTIVE", purpose: "IMAGE" },
        orderBy: { sortOrder: "asc" },
      });
      if (next) {
        await tx.propertyImage.update({ where: { id: next.id }, data: { isCover: true } });
      }
    }
    return deleted;
  });

  await recordAudit({
    userId: params.actorId,
    action: "DELETE",
    entityType: "PropertyImage",
    entityId: image.id,
    oldValues: { event: existing.isCover ? "public_image_removed" : "document_soft_deleted", propertyId: existing.propertyId },
  });
  logger.info("property_image_deleted", { imageId: image.id, propertyId: existing.propertyId, actorId: params.actorId });

  return image;
}

/** Admin-only permanent deletion of the physical object - the DB row stays soft-deleted regardless of whether this succeeds. */
export async function physicalDeletePropertyImage(params: { imageId: string; actorId: string; organizationId: string; role: Role }) {
  if (params.role !== "ADMIN") throw new ApiError(403, "Only Admins may permanently delete a stored object");
  const organizationId = params.organizationId;
  const existing = await prisma.propertyImage.findFirst({ where: { id: params.imageId, organizationId } });
  if (!existing) throw new ApiError(404, "Property image not found");

  await deleteObject(existing.storageKey);

  await recordAudit({
    userId: params.actorId,
    action: "DELETE",
    entityType: "PropertyImage",
    entityId: existing.id,
    oldValues: { event: "physical_object_deleted", storageKey: existing.storageKey },
  });
  logger.info("property_image_physical_delete", { imageId: existing.id, actorId: params.actorId });
}

/** Updates caption and/or cover flag on an existing image. Reordering (sortOrder) is bulk via reorderPropertyImages below. */
export async function updatePropertyImage(params: {
  imageId: string;
  actorId: string;
  organizationId: string;
  role: Role;
  caption?: string | null;
  isCover?: boolean;
}) {
  if (params.role !== "ADMIN" && params.role !== "DATA_MANAGER") throw new ApiError(403, "You do not have permission to edit property images");
  const organizationId = params.organizationId;
  const existing = await prisma.propertyImage.findFirst({ where: { id: params.imageId, organizationId } });
  if (!existing) throw new ApiError(404, "Property image not found");
  if (existing.status === "DELETED") throw new ApiError(409, "Cannot edit a deleted image");
  // Floor plans / availability evidence can never become the catalogue thumbnail.
  if (params.isCover && existing.purpose !== "IMAGE") {
    throw new ApiError(400, "Only listing images can be set as the property thumbnail");
  }

  // Clearing+setting cover must be atomic so two concurrent "set cover"
  // requests cannot leave a property with zero or two ACTIVE covers.
  const image = await prisma.$transaction(async (tx) => {
    if (params.isCover) {
      await tx.propertyImage.updateMany({
        where: { propertyId: existing.propertyId, status: "ACTIVE", isCover: true },
        data: { isCover: false },
      });
    }

    return tx.propertyImage.update({
      where: { id: params.imageId },
      data: {
        ...(params.caption !== undefined ? { caption: params.caption } : {}),
        ...(params.isCover !== undefined ? { isCover: params.isCover } : {}),
      },
    });
  });

  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "PropertyImage",
    entityId: image.id,
    oldValues: { caption: existing.caption, isCover: existing.isCover },
    newValues: { event: "property_image_updated", caption: image.caption, isCover: image.isCover },
  });

  return image;
}

/** Bulk sortOrder update for drag/keyboard reordering - applied as a single transaction so a partial failure never leaves the gallery in a half-reordered state. */
export async function reorderPropertyImages(params: { propertyId: string; actorId: string; organizationId: string; role: Role; order: string[] }) {
  if (params.role !== "ADMIN" && params.role !== "DATA_MANAGER") throw new ApiError(403, "You do not have permission to reorder property images");
  const organizationId = params.organizationId;

  const existing = await prisma.propertyImage.findMany({ where: { propertyId: params.propertyId, organizationId, status: "ACTIVE" }, select: { id: true } });
  const existingIds = new Set(existing.map((e) => e.id));
  if (params.order.length !== existing.length || !params.order.every((id) => existingIds.has(id))) {
    throw new ApiError(400, "Order must include exactly the current set of active image ids");
  }

  await prisma.$transaction(params.order.map((id, index) => prisma.propertyImage.update({ where: { id }, data: { sortOrder: index } })));

  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "PropertyImage",
    newValues: { event: "property_images_reordered", propertyId: params.propertyId, order: params.order },
  });

  return listPropertyImages(params.propertyId, organizationId);
}

/**
 * Replace: uploads and verifies the new image first, only then soft-deletes
 * the old row - a failed replacement never touches the original, and the
 * old physical object is left in place (not actively deleted) until the
 * new version is confirmed live.
 */
export async function replacePropertyImage(params: {
  imageId: string;
  actorId: string;
  organizationId: string;
  role: Role;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const organizationId = params.organizationId;
  const existing = await prisma.propertyImage.findFirst({ where: { id: params.imageId, organizationId } });
  if (!existing) throw new ApiError(404, "Property image not found");
  if (existing.status === "DELETED") throw new ApiError(409, "Cannot replace a deleted image");

  const next = await uploadPropertyImage({
    actorId: params.actorId,
    organizationId,
    role: params.role,
    propertyId: existing.propertyId,
    fileName: params.fileName,
    mimeType: params.mimeType,
    buffer: params.buffer,
    purpose: existing.purpose,
    caption: existing.caption,
    isCover: existing.isCover,
  });

  await prisma.propertyImage.update({ where: { id: existing.id }, data: { status: "DELETED", deletedAt: new Date(), isCover: false } });
  await recordAudit({
    userId: params.actorId,
    action: "UPDATE",
    entityType: "PropertyImage",
    entityId: existing.id,
    newValues: { event: "document_replaced", replacedBy: next.id },
  });

  return next;
}
