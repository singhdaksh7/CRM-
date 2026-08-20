import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { confirmPropertyImageUpload } from "@/lib/property-image-upload";
import { getPropertyImageUrl } from "@/lib/property-images";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getOrganizationId } from "@/lib/organization";
import { z } from "zod";

const schema = z.object({
  sessionId: z.string().min(1),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

/** Step 2: confirm a completed upload. Idempotent on sessionId. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"]);
    const { id } = await params;
    const limitResult = await checkRateLimit("propertyImageUpload", session.user.id);
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const body = schema.parse(await req.json());
    const image = await confirmPropertyImageUpload({
      actorId: session.user.id,
      organizationId: getOrganizationId(session.user),
      role: session.user.role,
      propertyId: id,
      sessionId: body.sessionId,
      width: body.width,
      height: body.height,
    });

    let url: string | null = null;
    try {
      url = await getPropertyImageUrl(image.storageKey);
    } catch {
      url = null;
    }

    return NextResponse.json({ image: { ...image, url } });
  } catch (err) {
    return handleApiError(err);
  }
}
