import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { changeOwnPassword } from "@/lib/password-reset";
import { changePasswordSchema } from "@/lib/validators";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Self-service password change. Any signed-in employee may change their own
 * password and only their own - the user id comes from the session, never
 * from the request body, so there is no id to tamper with and no role check
 * to get wrong.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const limit = await checkRateLimit("passwordChange", session.user.id);
    if (!limit.allowed) return rateLimitResponse(limit);

    const data = changePasswordSchema.parse(await req.json());
    await changeOwnPassword({
      userId: session.user.id,
      currentPassword: data.currentPassword,
      newPassword: data.password,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
