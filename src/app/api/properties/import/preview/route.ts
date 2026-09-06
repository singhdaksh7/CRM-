import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { previewInventoryImport } from "@/lib/inventory-import-service";

const schema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000), mapping: z.record(z.string(), z.string()),
  mode: z.enum(["CREATE_ONLY", "UPSERT_SAFE", "UPDATE_EXISTING_ONLY"]), allowBlankClear: z.boolean().default(false),
  resolutions: z.record(z.string(), z.object({ action: z.enum(["CREATE", "UPDATE_EXISTING", "SKIP"]).optional(), partnerId: z.string().optional(), existingPropertyId: z.string().optional(), inventorySource: z.enum(["DIRECT", "INDIRECT"]).optional() })).optional(),
  // Property Inventory V2 - staff-chosen mappings from an unresolved raw
  // locality token (e.g. "RN") to an existing PropertyLocality, so the
  // preview re-run reflects them live before anything is saved.
  localityAliasResolutions: z.array(z.object({ alias: z.string().min(1), localityId: z.string().min(1) })).max(200).optional(),
  // Property Inventory V2 - sheet-derived defaults (deriveSheetContext) must
  // be applied identically in preview and execute. executeInventoryImport
  // already passes these through to its own previewInventoryImport call -
  // without them here too, staff would review a preview computed WITHOUT
  // sheet context and then have execute silently apply different values.
  sheetName: z.string().optional(),
  sheetTitle: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const data = schema.parse(await req.json());
    return NextResponse.json({ rows: await previewInventoryImport({ ...data, organizationId: getOrganizationId(session.user) }) });
  } catch (error) { return handleApiError(error); }
}
