import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { parseInventoryFile } from "@/lib/inventory-import-parser";
import { suggestHousingFileMapping } from "@/integrations/housing/file-import-schema";

/**
 * Parses an uploaded Housing lead-export file (.csv / .xlsx) into
 * headers + rows for the "Import Housing Leads" wizard. Reuses the same
 * safe, size/MIME/extension-checked parser already used for property
 * inventory imports (parseInventoryFile - see src/lib/inventory-import-parser.ts)
 * rather than adding a new spreadsheet-parsing dependency; only the
 * column-mapping SUGGESTION is Housing-specific (suggestHousingFileMapping),
 * since Housing's documented columns don't overlap with property fields.
 * ADMIN/DATA_MANAGER only - never accessible to FIELD_EXECUTIVE.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const limit = await checkRateLimit("import", session.user.id);
    if (!limit.allowed) return rateLimitResponse(limit);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Choose a Housing lead export file");

    const parsed = await parseInventoryFile(file);
    return NextResponse.json({
      fileName: file.name,
      headers: parsed.headers,
      rows: parsed.rows,
      suggestedMapping: suggestHousingFileMapping(parsed.headers),
      truncated: parsed.truncated,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
