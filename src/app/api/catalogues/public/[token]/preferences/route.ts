import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-auth";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import {
  getCataloguePreferencesByToken,
  upsertCataloguePropertyPreference,
} from "@/lib/catalogue-property-preferences";

const preferenceBodySchema = z.object({
  propertyId: z.string().min(1),
  status: z.enum(["LIKED", "NOT_INTERESTED"]),
  note: z.string().max(1000).optional().nullable(),
  // Explicitly reject client-supplied org / lead ids if present.
}).strict();

/**
 * Public preference endpoint. organizationId is derived from the opaque
 * catalogue token server-side - never accepted from the request body.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limitResult = await checkRateLimit("publicCatalogue", clientIp(req));
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const { token } = await params;
    const result = await getCataloguePreferencesByToken(token);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limitResult = await checkRateLimit("publicCatalogue", clientIp(req));
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const { token } = await params;
    const raw = await req.json();
    if (raw && typeof raw === "object" && ("organizationId" in raw || "leadId" in raw)) {
      return NextResponse.json({ error: "organizationId/leadId are not accepted on public preference requests" }, { status: 400 });
    }
    const data = preferenceBodySchema.parse(raw);
    const preference = await upsertCataloguePropertyPreference({
      token,
      propertyId: data.propertyId,
      status: data.status,
      note: data.note,
    });
    return NextResponse.json({ preference });
  } catch (err) {
    return handleApiError(err);
  }
}
