import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { softDeletePropertyImage, physicalDeletePropertyImage } from "@/lib/property-images";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;

    const limitResult = await checkRateLimit("documentDelete", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const image = await softDeletePropertyImage({ imageId: id, actorId: session.user.id, role: session.user.role });

    const physical = req.nextUrl.searchParams.get("physical") === "true";
    if (physical) {
      await physicalDeletePropertyImage({ imageId: id, actorId: session.user.id, role: session.user.role });
    }

    return NextResponse.json({ image });
  } catch (err) {
    return handleApiError(err);
  }
}
