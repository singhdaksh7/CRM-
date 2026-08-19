import { prisma } from "./prisma";
import { deleteObject, objectExists, logger } from "./storage-orphan-deps";
import { expireAbandonedUploadSessions } from "./property-image-upload";

const ORG_PREFIX = /^organizations\/[a-zA-Z0-9_-]{1,64}\//;

/**
 * Bounded orphan cleanup. Never deletes a key solely because a caller
 * supplied it - only keys that appear in known DB/session tables under
 * org prefixes are candidates.
 */
export async function cleanupExpiredUploadSessions(limit = 50): Promise<{ expiredSessions: number; deletedObjects: number }> {
  const expiredSessions = await expireAbandonedUploadSessions(limit);

  const expired = await prisma.storageUploadSession.findMany({
    where: { status: "EXPIRED", propertyImageId: null },
    take: limit,
    orderBy: { expiresAt: "asc" },
  });

  let deletedObjects = 0;
  for (const session of expired) {
    if (!ORG_PREFIX.test(session.objectKey)) continue;
    const linked = await prisma.propertyImage.findFirst({ where: { storageKey: session.objectKey }, select: { id: true } });
    if (linked) continue;
    try {
      if (await objectExists(session.objectKey)) {
        await deleteObject(session.objectKey);
        deletedObjects += 1;
      }
    } catch (err) {
      logger.error("orphan_cleanup_delete_failed", {
        sessionId: session.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { expiredSessions, deletedObjects };
}

/**
 * Soft-deleted PropertyImage rows whose physical objects should be removed
 * (Admin-triggered backlog). Bounded; skips keys outside org prefix.
 */
export async function cleanupSoftDeletedPropertyObjects(params: {
  organizationId: string;
  limit?: number;
}): Promise<{ attempted: number; deleted: number; failed: number }> {
  const limit = params.limit ?? 25;
  const rows = await prisma.propertyImage.findMany({
    where: { organizationId: params.organizationId, status: "DELETED", deletedAt: { not: null } },
    take: limit,
    orderBy: { deletedAt: "asc" },
  });

  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.storageKey.startsWith(`organizations/${params.organizationId}/`)) {
      failed += 1;
      continue;
    }
    try {
      await deleteObject(row.storageKey);
      if (row.thumbnailKey && row.thumbnailKey.startsWith(`organizations/${params.organizationId}/`)) {
        await deleteObject(row.thumbnailKey);
      }
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { attempted: rows.length, deleted, failed };
}
