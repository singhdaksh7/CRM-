import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { replaceDocument } from "@/lib/documents";
import { canAccessDocument } from "@/lib/document-access";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { objectKeyBelongsToOrg } from "@/lib/storage-providers/object-key";

const replaceSchema = z.object({
  fileName: z.string().min(1).max(255),
  storageKey: z.string().min(1).optional(),
  fileUrl: z.string().min(1).optional(),
  fileType: z.string().min(1).max(100),
  fileSizeBytes: z.number().int().nonnegative().optional().nullable(),
}).refine((data) => !!data.storageKey || !!data.fileUrl, { message: "Either storageKey or fileUrl is required" });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;

    const limitResult = await checkRateLimit("documentReplace", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.document.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Document not found");
    const allowed = await canAccessDocument(session.user.role, session.user.id, existing);
    if (!allowed) throw new ApiError(403, "You do not have permission to replace this document");

    const body = await req.json();
    const data = replaceSchema.parse(body);
    if (data.storageKey && !objectKeyBelongsToOrg(data.storageKey, organizationId)) {
      throw new ApiError(400, "Invalid storage key for this organization");
    }

    const document = await replaceDocument({ documentId: id, actorId: session.user.id, organizationId, ...data });
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
