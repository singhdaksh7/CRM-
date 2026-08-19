import { NextRequest, NextResponse } from "next/server";
import { propertyPortalRegistry, type PropertyPortalProviderId } from "@/integrations/property-portals/registry";

const MAX_BYTES = 256 * 1024;

/**
 * Deliberately non-operational until a provider's official signature contract
 * and authorized connection have been configured. This protects against an
 * insecure generic webhook while preserving the canonical route shape.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await ctx.params;
  const provider = rawProvider.toUpperCase() as PropertyPortalProviderId;
  if (!(provider in propertyPortalRegistry)) return NextResponse.json({ error: "Unknown portal provider" }, { status: 404 });
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES) return NextResponse.json({ error: "Payload exceeds portal webhook limit" }, { status: 413 });
  return NextResponse.json({ error: "Official provider webhook verification is not configured. No payload was processed." }, { status: 501 });
}
