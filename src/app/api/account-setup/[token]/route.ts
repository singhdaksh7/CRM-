import { NextRequest, NextResponse } from "next/server";
import { inspectAccountSetupToken, activateAccount } from "@/lib/account-setup";
import { accountSetupPasswordSchema } from "@/lib/validators";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { handleApiError, ApiError } from "@/lib/api-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    // Validation is rate limited too, not just submission - otherwise the GET
    // is a free oracle for brute-forcing the setup token space.
    const limit = await checkRateLimit("accountSetup", clientIp(req));
    if (!limit.allowed) return rateLimitResponse(limit);
    const { token } = await params;
    const details = await inspectAccountSetupToken(token);
    if (!details) throw new ApiError(404, "This setup link is invalid or has expired");
    return NextResponse.json(details);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limit = await checkRateLimit("accountSetup", clientIp(req));
    if (!limit.allowed) return rateLimitResponse(limit);
    const { token } = await params;
    const data = accountSetupPasswordSchema.parse(await req.json());
    await activateAccount(token, data.password);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
