import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { previewContactImport } from "@/lib/imports";

const schema = z.object({
  rows: z.array(z.record(z.string(), z.string())).min(1).max(5000),
  mapping: z.record(z.string(), z.string()),
  mode: z.string().optional(),
});

// POST /api/customers/import/preview - read-only preview for a CONTACTS
// import: real duplicate detection against the org's contacts, zero writes.
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { rows, mapping } = schema.parse(await req.json());
    const organizationId = getOrganizationId(session.user.id);
    const preview = await previewContactImport({ rows, columnMapping: mapping, organizationId });
    return NextResponse.json({ rows: preview });
  } catch (error) {
    return handleApiError(error);
  }
}
