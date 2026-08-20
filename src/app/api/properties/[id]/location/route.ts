import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { setManualPropertyLocation, markPropertyLocationApproximate, setPublicLocationMode, clearPropertyLocation } from "@/lib/property-location";
import { getOrganizationId } from "@/lib/organization";

const patchSchema = z
  .object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    markApproximate: z.literal(true).optional(),
    publicLocationMode: z.enum(["EXACT", "APPROXIMATE", "LOCALITY_ONLY", "HIDDEN"]).optional(),
  })
  .refine((d) => d.latitude !== undefined || d.longitude !== undefined || d.markApproximate || d.publicLocationMode, {
    message: "At least one of latitude/longitude, markApproximate, or publicLocationMode is required",
  });

/** Manual location edits: set/correct coordinates, mark them approximate, and/or change what the public catalogue is allowed to reveal. Each action is independently audited by property-location.ts. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const body = await req.json();
    const data = patchSchema.parse(body);

    let property;
    if (data.latitude !== undefined || data.longitude !== undefined) {
      if (data.latitude === undefined || data.longitude === undefined) {
        throw new ApiError(400, "Both latitude and longitude are required together");
      }
      property = await setManualPropertyLocation({ propertyId: id, actorId: session.user.id, organizationId, role: session.user.role, latitude: data.latitude, longitude: data.longitude });
    }
    if (data.markApproximate) {
      property = await markPropertyLocationApproximate({ propertyId: id, actorId: session.user.id, organizationId, role: session.user.role });
    }
    if (data.publicLocationMode) {
      property = await setPublicLocationMode({ propertyId: id, actorId: session.user.id, organizationId, role: session.user.role, mode: data.publicLocationMode });
    }

    return NextResponse.json({ property });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Clears any stored coordinate/geocode metadata ("Clear location"). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const property = await clearPropertyLocation({ propertyId: id, actorId: session.user.id, organizationId: getOrganizationId(session.user), role: session.user.role });
    return NextResponse.json({ property });
  } catch (err) {
    return handleApiError(err);
  }
}
