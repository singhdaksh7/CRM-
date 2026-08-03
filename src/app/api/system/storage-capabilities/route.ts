import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getStorageCapabilitiesDTO } from "@/lib/storage-capabilities";

/** Any authenticated role may read this - used by the frontend to decide whether to show upload controls or a storage-disabled state. */
export async function GET() {
  try {
    await requireSession();
    return NextResponse.json(getStorageCapabilitiesDTO());
  } catch (err) {
    return handleApiError(err);
  }
}
