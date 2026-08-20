import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { preferredPropertiesSchema } from "@/lib/validators";
import { setPreferredProperties } from "@/lib/visits";

/**
 * Marks the client's preferred / shortlisted properties after a visit.
 * Mirrors onto the existing CatalogueShareProperty shortlist when the visit
 * came from a catalogue, so there is only ever one shortlist.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { propertyIds } = preferredPropertiesSchema.parse(await req.json());
    const properties = await setPreferredProperties(id, getOrganizationId(session.user), session.user, propertyIds);
    return NextResponse.json({ properties });
  } catch (err) {
    return handleApiError(err);
  }
}
