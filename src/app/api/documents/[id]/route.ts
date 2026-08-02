import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument } from "@/lib/document-access";
import { createDownloadUrl, deleteObject } from "@/lib/storage";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * GET returns a short-lived signed download authorization, never a
 * permanent public URL. Access is gated on organization match (existing)
 * plus category + entity-relationship permission (Phase 1 addition) - see
 * lib/document-access.ts. Every request/allow/deny is audited.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Any authenticated role may reach this point - the fine-grained check
    // is per-document via canAccessDocument below, not a role gate here.
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);

    const limitResult = await checkRateLimit("documentDownload", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const document = await prisma.document.findFirst({ where: { id, organizationId, status: { not: "DELETED" } } });
    if (!document) throw new ApiError(404, "Document not found");

    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "Document",
      entityId: document.id,
      newValues: { event: "download_requested" },
    });

    const allowed = await canAccessDocument(session.user.role, session.user.id, document);
    if (!allowed) {
      await recordAudit({
        userId: session.user.id,
        action: "OTHER",
        entityType: "Document",
        entityId: document.id,
        newValues: { event: "download_denied", role: session.user.role, category: document.category },
        result: "FAILURE",
      });
      logger.warn("document_download_denied", { documentId: document.id, actorId: session.user.id, role: session.user.role });
      throw new ApiError(403, "You do not have permission to download this document");
    }

    // storageKey -> short-TTL signed GET URL, generated fresh on every
    // request, never persisted or cached. Legacy fileUrl documents pass
    // through as-is (they're already whatever the caller hosted).
    const downloadUrl = document.storageKey ? await createDownloadUrl(document.storageKey) : document.fileUrl;

    await recordAudit({
      userId: session.user.id,
      action: "OTHER",
      entityType: "Document",
      entityId: document.id,
      newValues: { event: "download_authorized" },
    });

    return NextResponse.json({ document, downloadUrl });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);

    const limitResult = await checkRateLimit("documentDelete", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const existing = await prisma.document.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Document not found");

    const allowed = await canAccessDocument(session.user.role, session.user.id, existing);
    if (!allowed) throw new ApiError(403, "You do not have permission to delete this document");

    // Physical deletion (actually removing the object from the bucket) is
    // Admin-only and opt-in via ?physical=true - the default is soft
    // delete, which is reversible and keeps the object in place.
    const physical = req.nextUrl.searchParams.get("physical") === "true";
    if (physical && session.user.role !== "ADMIN") {
      throw new ApiError(403, "Only Admins may permanently delete a stored object");
    }

    const document = await prisma.document.update({ where: { id }, data: { status: "DELETED", deletedAt: new Date() } });

    if (existing.ownerId) {
      await prisma.activity.create({
        data: {
          crmOwnerId: existing.ownerId,
          type: "DOCUMENT_DELETED",
          description: `Document "${existing.fileName}" deleted`,
          actorId: session.user.id,
        },
      });
    }

    await recordAudit({ userId: session.user.id, action: "DELETE", entityType: "Document", entityId: id, oldValues: { event: "document_soft_deleted", ...existing } });
    logger.info("document_deleted", { documentId: id, actorId: session.user.id, physical });

    if (physical && existing.storageKey) {
      try {
        await deleteObject(existing.storageKey);
        await recordAudit({ userId: session.user.id, action: "DELETE", entityType: "Document", entityId: id, oldValues: { event: "physical_object_deleted", storageKey: existing.storageKey } });
        logger.info("document_physical_delete", { documentId: id, actorId: session.user.id });
      } catch (err) {
        // The DB record is already soft-deleted regardless - a failed
        // physical delete just leaves an orphaned object in the bucket,
        // which is safe (not accessible through the app) rather than
        // leaving the app in an inconsistent state.
        logger.error("document_physical_delete_failed", { documentId: id, message: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({ document });
  } catch (err) {
    return handleApiError(err);
  }
}
