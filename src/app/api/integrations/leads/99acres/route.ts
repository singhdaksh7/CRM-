import { NextRequest, NextResponse } from "next/server";
import { mockWebhookLeadSchema } from "@/lib/validators";
import { handleApiError } from "@/lib/api-auth";
import { ingestWebhookLead } from "@/lib/lead-ingestion";
import { requireWebhookApiKey } from "@/lib/webhook-auth";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Mock ingestion endpoint simulating the 99acres lead-notification webhook.
 * No real 99acres credentials are required for the MVP - this demonstrates
 * the exact payload shape and processing pipeline (validate -> dedupe ->
 * create -> auto-assign -> score -> notify) that the official 99acres Lead
 * API would feed into once contracted.
 *
 * Example: POST /api/integrations/leads/99acres
 * { "externalLeadId": "99A-10054", "clientName": "Rahul Sharma", "phone": "+919876543210",
 *   "email": "rahul@example.com", "requirementType": "RENT", "location": "Janakpuri",
 *   "minimumBudget": 18000, "maximumBudget": 22000, "bhk": 2, "furnishing": "SEMI_FURNISHED",
 *   "source": "99ACRES", "notes": "Needs property near metro station" }
 */
export async function POST(req: NextRequest) {
  try {
    const limitResult = await checkRateLimit("webhook", clientIp(req));
    if (!limitResult.allowed) return rateLimitResponse(limitResult);
    requireWebhookApiKey(req, "ACRES_99_API_KEY");
    const body = await req.json();
    const data = mockWebhookLeadSchema.parse({ ...body, source: "99ACRES" });
    const result = await ingestWebhookLead(data, "ACRES_99");
    return NextResponse.json({ ...result, message: "Lead ingested, auto-assigned, and scored" }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
