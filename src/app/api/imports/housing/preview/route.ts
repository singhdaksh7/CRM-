import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getOrganizationId } from "@/lib/organization";
import { previewHousingImport } from "@/lib/housing-import";
import { HOUSING_FILE_IMPORT_COLUMNS } from "@/integrations/housing/file-import-schema";

/**
 * Read-only preview step of the Housing lead file import (step 2/3 of the
 * spec'd flow): maps + validates every row exactly like a real import would,
 * flags duplicates (within this file AND against prior Housing uploads),
 * but never writes to the database. ADMIN/DATA_MANAGER only.
 */
const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.string().max(2000))).min(1).max(5000),
  columnMapping: z.record(z.enum(HOUSING_FILE_IMPORT_COLUMNS), z.string().max(200)),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limit = await checkRateLimit("import", session.user.id);
    if (!limit.allowed) return rateLimitResponse(limit);

    const data = bodySchema.parse(await req.json());
    const organizationId = getOrganizationId(session.user);
    const preview = await previewHousingImport({ rows: data.rows, columnMapping: data.columnMapping, organizationId });
    return NextResponse.json(preview);
  } catch (error) {
    return handleApiError(error);
  }
}
