import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assertLeadAccessible } from "@/lib/lead-access";
import { getCatalogueById } from "@/lib/catalogues";
import { toExecutiveCatalogueDTO } from "@/lib/catalogue-dto";

/**
 * Objective 9 - the executive's internal view of a catalogue, keyed by
 * CatalogueShare.id (never the public token). Reads the SAME record the
 * client sees via the public link - no second share created. A field
 * executive is restricted to catalogues for their own assigned leads via
 * assertLeadAccessible, same guard used by the manager-facing catalogue
 * routes under /api/leads/[id]/catalogues.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id } = await params;
    const catalogue = await getCatalogueById(id);
    await assertLeadAccessible(session, catalogue.leadId);

    return NextResponse.json({ catalogue: toExecutiveCatalogueDTO(catalogue) });
  } catch (err) {
    return handleApiError(err);
  }
}
