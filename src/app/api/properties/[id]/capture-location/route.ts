import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { captureFieldLocation } from "@/lib/property-location";
import { getOrganizationId } from "@/lib/organization";

const captureSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nonnegative().optional(),
});

/**
 * A7 - Field GPS capture. One explicit action: the browser's
 * navigator.geolocation.getCurrentPosition() result, submitted only when
 * the field executive taps "Capture Location". No polling, no background
 * tracking, no capture on page load - see capture-location-button.tsx.
 *
 * FIELD_EXECUTIVE requires a legitimate assigned reason (checked inside
 * captureFieldLocation via fieldExecutiveHasPropertyAccess, the same
 * visit/catalogue-lead check A1 uses); ADMIN/DATA_MANAGER retain the same
 * management access they have on every other property-location endpoint.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const body = await req.json();
    const data = captureSchema.parse(body);

    const property = await captureFieldLocation({
      propertyId: id,
      actorId: session.user.id,
      organizationId,
      role: session.user.role,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy ?? null,
    });

    return NextResponse.json({ property });
  } catch (err) {
    return handleApiError(err);
  }
}
