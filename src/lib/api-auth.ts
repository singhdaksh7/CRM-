import { NextResponse } from "next/server";
import { auth } from "./auth";
import { logger, newRequestId } from "./logger";
import { captureException } from "./monitoring";
import type { Role } from "@prisma/client";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireSession(allowedRoles?: Role[]) {
  const session = await auth();
  if (!session) throw new ApiError(401, "Unauthorized");
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    throw new ApiError(403, "Forbidden");
  }
  return session;
}

/**
 * Client-facing errors (ApiError, Zod validation) return their message as-is
 * - they're already written to be safe to show a user. Anything else is an
 * unexpected server error: log it with a requestId server-side, but only
 * ever send the client that opaque ID, never the raw error/stack.
 */
export function handleApiError(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err && typeof err === "object" && "issues" in err) {
    return NextResponse.json({ error: "Validation failed", issues: (err as { issues: unknown }).issues }, { status: 400 });
  }
  const requestId = newRequestId();
  logger.error("unhandled_api_error", {
    requestId,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  captureException(err, { requestId });
  return NextResponse.json({ error: "Internal server error", requestId }, { status: 500 });
}
