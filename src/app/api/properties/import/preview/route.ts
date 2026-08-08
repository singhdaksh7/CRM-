import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { previewInventoryImport } from "@/lib/inventory-import-service";

const schema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000), mapping: z.record(z.string(), z.string()),
  mode: z.enum(["CREATE_ONLY", "UPSERT_SAFE", "UPDATE_EXISTING_ONLY"]), allowBlankClear: z.boolean().default(false),
  resolutions: z.record(z.string(), z.object({ action: z.enum(["CREATE", "UPDATE_EXISTING", "SKIP"]).optional(), partnerId: z.string().optional(), existingPropertyId: z.string().optional() })).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const data = schema.parse(await req.json());
    return NextResponse.json({ rows: await previewInventoryImport({ ...data, organizationId: getOrganizationId(session.user.id) }) });
  } catch (error) { return handleApiError(error); }
}
