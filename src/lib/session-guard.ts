import "server-only";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

export interface SessionAuthState {
  authVersion: number;
  status: "PENDING_SETUP" | "ACTIVE" | "INACTIVE";
  role: Role;
  organizationId: string;
}

/**
 * The per-request session revocation check.
 *
 * Auth.js already invokes the `jwt` callback on every authenticated request
 * in this codebase (proxy.ts runs `auth()` on effectively every navigation,
 * and every API route calls `requireSession()`), so this piggybacks on that
 * rather than adding a second middleware pass. It is a single indexed
 * primary-key lookup returning three small scalar columns.
 *
 * Returns null when the user row is gone, which the caller must treat exactly
 * like a version mismatch: session invalid.
 */
export async function getSessionAuthState(userId: string): Promise<SessionAuthState | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { authVersion: true, status: true, role: true, organizationId: true },
  });
  return user ?? null;
}

/**
 * Whether a JWT carrying `tokenAuthVersion` is still acceptable for `state`.
 *
 * A session is only valid if the account is still ACTIVE and the token's
 * version matches the row exactly. Password reset, self-service password
 * change and admin account disabling all increment the row's version, so all
 * three revoke every previously issued token.
 */
export function isSessionStillValid(state: SessionAuthState | null, tokenAuthVersion: unknown): boolean {
  if (!state) return false;
  if (state.status !== "ACTIVE") return false;
  // Fail closed: a user row with no organization association (should never
  // happen given the NOT NULL column, but defends against future schema
  // relaxation) must never carry a usable session - never fall back to a
  // default tenant for an authenticated request.
  if (!state.organizationId) return false;
  return typeof tokenAuthVersion === "number" && tokenAuthVersion === state.authVersion;
}
