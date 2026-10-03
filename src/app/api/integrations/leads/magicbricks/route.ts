import { NextRequest, NextResponse } from "next/server";
import { mockWebhookLeadSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-auth";
import { ingestWebhookLead } from "@/lib/lead-ingestion";
import { requireWebhookApiKey } from "@/lib/webhook-auth";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Mock ingestion endpoint simulating the Magicbricks lead-notification webhook.
 * Requires MAGICBRICKS_API_KEY (see webhook-auth.ts); refuses all requests when it
 * is unset (fails closed). Payload shape: mockWebhookLeadSchema in validators.ts.
 */
export async function POST(req: NextRequest) {
  try {
    const limitResult = await checkRateLimit("webhook", clientIp(req));
    if (!limitResult.allowed) return rateLimitResponse(limitResult);
    requireWebhookApiKey(req, "MAGICBRICKS_API_KEY");
    const body = await req.json();
    const data = mockWebhookLeadSchema.parse({ ...body, source: "MAGICBRICKS" });
    const result = await ingestWebhookLead(data, "MAGICBRICKS");
    return NextResponse.json({ ...result, message: "Lead ingested, auto-assigned, and scored" }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
