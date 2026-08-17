import { NextRequest, NextResponse } from "next/server";
import { recordPasswordResetRequest } from "@/lib/password-reset";
import { forgotPasswordSchema } from "@/lib/validators";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Public, unauthenticated password-reset request.
 *
 * Returns byte-identical 200s whether or not the email belongs to an
 * account, and whether or not that account is active - no status code, body,
 * or header varies. Nothing about existence, role, status or organization
 * leaks. Malformed input is folded into the same response rather than
 * returning a 400, so probing the endpoint tells an attacker nothing at all.
 */
const GENERIC_RESPONSE = {
  message: "If an account exists for this email, password reset instructions are available.",
};

export async function POST(req: NextRequest) {
  const limit = await checkRateLimit("forgotPassword", clientIp(req));
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const parsed = forgotPasswordSchema.safeParse(await req.json());
    if (parsed.success) await recordPasswordResetRequest(parsed.data.email);
  } catch {
    // Unparseable body - still answer generically.
  }
  return NextResponse.json(GENERIC_RESPONSE);
}
