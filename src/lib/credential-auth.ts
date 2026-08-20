import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { AUTH_AUDIT_EVENTS } from "./auth-events";

/**
 * Verifies an email/password pair for the Auth.js Credentials provider.
 *
 * Returns null for every failure - unknown email, wrong password,
 * PENDING_SETUP, INACTIVE - so the caller cannot tell them apart and the
 * login page can only ever show one generic message. Status is checked before
 * bcrypt so a disabled account isn't distinguishable by response timing.
 *
 * On success it stamps `lastLoginAt` and records a LOGIN audit entry. Failed
 * attempts are deliberately not audited one-by-one: login is already rate
 * limited per IP+email in src/lib/auth.ts, and a per-attempt failure row
 * would let an unauthenticated attacker inflate the audit table at will.
 */
export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      organizationId: true,
      name: true,
      email: true,
      role: true,
      status: true,
      passwordHash: true,
      authVersion: true,
    },
  });
  if (!user || user.status !== "ACTIVE") return null;
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } }),
    prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "LOGIN",
        entityType: "User",
        entityId: user.id,
        newValues: JSON.stringify({ event: AUTH_AUDIT_EVENTS.LOGIN_SUCCESS }),
      },
    }),
  ]);

  // Only non-secret identity fields cross into the JWT. `authVersion` is the
  // session-revocation counter re-checked on every subsequent request.
  // organizationId is the server-resolved tenant identity (never client
  // input) - re-verified on every subsequent request too, see auth.ts.
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    authVersion: user.authVersion,
    organizationId: user.organizationId,
  };
}
