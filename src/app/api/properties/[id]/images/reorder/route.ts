import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { reorderPropertyImages } from "@/lib/property-images";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getPropertyImageUrl } from "@/lib/property-images";

/** Bulk-saves a new display order (drag-and-drop or up/down controls) as a single transaction. Body: { order: string[] } - the full set of active image ids for this property, in the desired order. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;

    const limitResult = await checkRateLimit("propertyImageUpload", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const body = await req.json();
    if (!Array.isArray(body.order) || !body.order.every((x: unknown) => typeof x === "string")) {
      throw new ApiError(400, "order must be an array of image ids");
    }

    const images = await reorderPropertyImages({ propertyId: id, actorId: session.user.id, role: session.user.role, order: body.order });
    const withUrls = await Promise.all(images.map(async (img) => ({ ...img, url: await getPropertyImageUrl(img.storageKey) })));
    return NextResponse.json({ images: withUrls });
  } catch (err) {
    return handleApiError(err);
  }
}
