import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { executeInventoryImport } from "@/lib/inventory-import-service";

const schema = z.object({
  fileName: z.string().min(1).max(255), sheetName: z.string().max(100).optional(), fileHash: z.string().length(64).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000), mapping: z.record(z.string(), z.string()),
  mode: z.enum(["CREATE_ONLY", "UPSERT_SAFE", "UPDATE_EXISTING_ONLY"]),
  partialPolicy: z.enum(["REQUIRE_ALL_ROWS_VALID", "IMPORT_VALID_ROWS"]), allowBlankClear: z.boolean().default(false),
  resolutions: z.record(z.string(), z.object({ action: z.enum(["CREATE", "UPDATE_EXISTING", "SKIP"]).optional(), partnerId: z.string().optional(), existingPropertyId: z.string().optional() })).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limit = await checkRateLimit("import", session.user.id);
    if (!limit.allowed) return rateLimitResponse(limit);
    const data = schema.parse(await req.json());
    const result = await executeInventoryImport({ ...data, actorId: session.user.id, organizationId: getOrganizationId(session.user.id) });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
