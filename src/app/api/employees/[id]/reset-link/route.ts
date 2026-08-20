import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { issuePasswordResetToken } from "@/lib/password-reset";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * ADMIN-only. Issues a password reset link for an ACTIVE employee and returns
 * the plaintext URL in this response and nowhere else - it is not stored and
 * cannot be fetched again. An admin who loses it generates a new one, which
 * invalidates this one.
 *
 * Organization scoping is enforced inside `issuePasswordResetToken`, which
 * looks the employee up by `{ id, organizationId }` - an id from another
 * organization is a 404, not a leak.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const limit = await checkRateLimit("accountAdminAction", session.user.id);
    if (!limit.allowed) return rateLimitResponse(limit);

    const { id } = await params;
    const result = await issuePasswordResetToken({
      userId: id,
      organizationId: getOrganizationId(session.user),
      actorId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
