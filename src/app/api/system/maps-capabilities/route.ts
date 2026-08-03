import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getMapsCapabilitiesDTO } from "@/lib/maps-capabilities";

/** Any authenticated role may read this - used by the frontend to decide whether to show address search/map controls or a "maps not configured" state. */
export async function GET() {
  try {
    await requireSession();
    return NextResponse.json(getMapsCapabilitiesDTO());
  } catch (err) {
    return handleApiError(err);
  }
}
