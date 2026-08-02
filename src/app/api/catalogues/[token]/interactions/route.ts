import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-auth";
import { catalogueInteractionSchema } from "@/lib/validators";
import { getCatalogueByToken } from "@/lib/catalogues";
import { recordCatalogueInteraction } from "@/lib/catalogue-interactions";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

/** Public, unauthenticated. Backs the Interested / Not Interested / Request Visit / Ask a Question buttons on the public catalogue page. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limitResult = await checkRateLimit("publicCatalogue", clientIp(req));
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const { token } = await params;
    const data = catalogueInteractionSchema.parse(await req.json());

    const catalogue = await getCatalogueByToken(token);
    const interaction = await recordCatalogueInteraction(catalogue.id, data);
    return NextResponse.json({ interaction }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
