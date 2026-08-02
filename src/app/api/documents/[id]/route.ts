import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { createDownloadUrl } from "@/lib/storage";
import { logger } from "@/lib/logger";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);
    const document = await prisma.document.findFirst({ where: { id, organizationId } });
    if (!document) throw new ApiError(404, "Document not found");

    // storageKey (Phase 3B) -> short-TTL signed GET URL, generated fresh on
    // every request, never persisted or cached. Legacy fileUrl documents
    // pass through as-is (they're already whatever the caller hosted).
    const downloadUrl = document.storageKey ? await createDownloadUrl(document.storageKey) : document.fileUrl;

    return NextResponse.json({ document, downloadUrl });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);
    const existing = await prisma.document.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Document not found");

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

    await recordAudit({ userId: session.user.id, action: "DELETE", entityType: "Document", entityId: id, oldValues: existing });
    logger.info("document_deleted", { documentId: id, actorId: session.user.id });

    return NextResponse.json({ document });
  } catch (err) {
    return handleApiError(err);
  }
}
