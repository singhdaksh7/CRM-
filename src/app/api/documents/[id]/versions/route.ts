import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { canAccessDocument } from "@/lib/document-access";

/**
 * Walks the self-referential version chain (previousDocumentId / nextDocument)
 * in both directions from the requested document and returns every version,
 * newest first. Same per-document access check as the download route - a
 * user who cannot see the current version cannot see its history either.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);

    const anchor = await prisma.document.findFirst({ where: { id, organizationId } });
    if (!anchor) throw new ApiError(404, "Document not found");

    const allowed = await canAccessDocument(session.user.role, session.user.id, anchor);
    if (!allowed) throw new ApiError(403, "You do not have permission to view this document's history");

    const chain = [anchor];

    let cursor = anchor;
    while (cursor.previousDocumentId) {
      const prev = await prisma.document.findFirst({ where: { id: cursor.previousDocumentId, organizationId } });
      if (!prev) break;
      chain.push(prev);
      cursor = prev;
    }

    cursor = anchor;
    while (true) {
      const next = await prisma.document.findFirst({ where: { previousDocumentId: cursor.id, organizationId } });
      if (!next) break;
      chain.unshift(next);
      cursor = next;
    }

    chain.sort((a, b) => b.version - a.version);

    return NextResponse.json({ versions: chain, currentVersionId: chain.find((d) => d.status !== "DELETED" && d.status !== "EXPIRED")?.id ?? chain[0]?.id });
  } catch (err) {
    return handleApiError(err);
  }
}
