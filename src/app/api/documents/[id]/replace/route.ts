import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { z } from "zod";
import { replaceDocument } from "@/lib/documents";

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
    const body = await req.json();
    const data = replaceSchema.parse(body);

    const document = await replaceDocument({ documentId: id, actorId: session.user.id, ...data });
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
