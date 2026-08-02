import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-auth";
import { getCatalogueByToken } from "@/lib/catalogues";
import { recordCatalogueView } from "@/lib/catalogue-interactions";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

const VIEWER_COOKIE = "catalogue_viewer";

/**
 * Public, unauthenticated. Deduped per viewer within a time window - see
 * catalogue-interactions.ts. The viewer identity is an httpOnly cookie set
 * here: Route Handlers can set cookies, Server Components cannot (the page
 * itself just renders the DTO; this endpoint - called client-side on mount -
 * owns the cookie).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limitResult = await checkRateLimit("publicCatalogue", clientIp(req));
    if (!limitResult.allowed) return rateLimitResponse(limitResult);

    const { token } = await params;
    const catalogue = await getCatalogueByToken(token);

    let viewerToken = req.cookies.get(VIEWER_COOKIE)?.value;
    const isNewViewer = !viewerToken;
    if (!viewerToken) viewerToken = randomUUID();

    const result = await recordCatalogueView(catalogue.id, viewerToken);

    const res = NextResponse.json(result);
    if (isNewViewer) {
      res.cookies.set(VIEWER_COOKIE, viewerToken, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: "lax", path: "/" });
    }
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
