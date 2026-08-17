import { NextRequest, NextResponse } from "next/server";
import { completePasswordReset, inspectPasswordResetToken, INVALID_RESET_TOKEN_MESSAGE } from "@/lib/password-reset";
import { passwordResetSchema } from "@/lib/validators";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { handleApiError, ApiError } from "@/lib/api-auth";

/**
 * Public token validation + reset submission, mirroring
 * /api/account-setup/[token]. Both verbs are rate limited per IP so the
 * token space cannot be searched, and every rejection - unknown, expired,
 * already used, deleted user, PENDING_SETUP user, INACTIVE user - returns
 * the same message.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limit = await checkRateLimit("passwordReset", clientIp(req));
    if (!limit.allowed) return rateLimitResponse(limit);
    const { token } = await params;
    const details = await inspectPasswordResetToken(token);
    if (!details) throw new ApiError(404, INVALID_RESET_TOKEN_MESSAGE);
    return NextResponse.json(details);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limit = await checkRateLimit("passwordReset", clientIp(req));
    if (!limit.allowed) return rateLimitResponse(limit);
    const { token } = await params;
    const data = passwordResetSchema.parse(await req.json());
    await completePasswordReset(token, data.password);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
