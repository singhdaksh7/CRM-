import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { parseInventoryFile } from "@/lib/inventory-import-parser";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limit = await checkRateLimit("import", session.user.id);
    if (!limit.allowed) return rateLimitResponse(limit);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Choose an inventory spreadsheet");
    const sheetName = String(form.get("sheetName") ?? "") || undefined;
    const parsed = await parseInventoryFile(file, sheetName);
    const hash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
    return NextResponse.json({ ...parsed, fileName: file.name, fileHash: hash });
  } catch (error) { return handleApiError(error); }
}
