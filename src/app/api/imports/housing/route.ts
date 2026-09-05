import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, requireSession, handleApiError } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getOrganizationId } from "@/lib/organization";
import { runHousingImport } from "@/lib/housing-import";
import { HOUSING_FILE_IMPORT_COLUMNS } from "@/integrations/housing/file-import-schema";

/**
 * Executes the Housing lead file import (step 4/5 of the spec'd flow -
 * "Import", requires the client to have already shown the user the preview
 * and gotten an explicit confirm click; `confirm: true` is required in the
 * body as a second, server-side guard against a bare/replayed POST doing a
 * write with no confirmation ever having been shown).
 *
 * ADMIN/DATA_MANAGER only. Never triggers WhatsApp/SMS/email - see
 * src/lib/housing-import.ts's module doc for why that's guaranteed by
 * construction (only ingestPortalLead's existing, non-customer-facing side
 * effects run here).
 */
const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.string().max(2000))).min(1).max(5000),
  columnMapping: z.record(z.enum(HOUSING_FILE_IMPORT_COLUMNS), z.string().max(200)),
  fileName: z.string().min(1).max(300),
  confirm: z.literal(true),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limit = await checkRateLimit("import", session.user.id);
    if (!limit.allowed) return rateLimitResponse(limit);

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      if (parsed.error.issues.some((issue) => issue.path.join(".") === "confirm")) {
        throw new ApiError(400, "Import requires explicit confirmation");
      }
      throw parsed.error;
    }

    const organizationId = getOrganizationId(session.user);
    const result = await runHousingImport({
      rows: parsed.data.rows,
      columnMapping: parsed.data.columnMapping,
      fileName: parsed.data.fileName,
      actorId: session.user.id,
      organizationId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
