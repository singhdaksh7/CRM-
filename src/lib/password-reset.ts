import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { AUTH_AUDIT_EVENTS, BCRYPT_COST } from "./auth-events";

/**
 * Password reset tokens.
 *
 * Mirrors the account-setup token design (src/lib/account-setup.ts) rather
 * than reinventing it: 256 bits of CSPRNG entropy, base64url encoded,
 * SHA-256 hashed before it touches the database, single-use, and consumed
 * with an atomic `updateMany ... WHERE usedAt IS NULL` so two concurrent
 * submissions of the same link can never both succeed.
 *
 * The plaintext token exists only in the HTTP response that issues it. It is
 * never persisted, never logged, and never re-derivable from the stored hash
 * - an admin who loses the link must generate a new one.
 */

/** 45 minutes - inside the 30-60 minute window the product asked for. */
export const PASSWORD_RESET_EXPIRY_MINUTES = 45;

/** Generic, non-enumerating rejection used for every bad reset token. */
export const INVALID_RESET_TOKEN_MESSAGE = "This password reset link is invalid or has expired";

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildPasswordResetUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/reset-password/${encodeURIComponent(token)}`;
}

export function createPasswordResetSecret(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000),
  };
}

/**
 * Issues a reset link for an ACTIVE employee and returns the plaintext URL
 * exactly once. Generating a new token deletes every outstanding unused one
 * for that user, so an older link handed out earlier stops working
 * immediately.
 *
 * Throws (404/409) for a missing, cross-organization, PENDING_SETUP or
 * INACTIVE employee - this is the admin-facing path, where a precise error is
 * appropriate. The public forgot-password path never calls this in a way that
 * would surface those errors; see `recordPasswordResetRequest`.
 */
export async function issuePasswordResetToken(params: {
  userId: string;
  organizationId: string;
  actorId: string;
}) {
  const secret = createPasswordResetSecret();
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: params.userId, organizationId: params.organizationId },
      select: { id: true, status: true },
    });
    if (!user) throw new ApiError(404, "Employee not found");
    if (user.status !== "ACTIVE") {
      throw new ApiError(409, "Only active employees can receive a password reset link");
    }

    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.create({
      data: {
        organizationId: params.organizationId,
        userId: user.id,
        tokenHash: secret.tokenHash,
        expiresAt: secret.expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.actorId,
        action: "OTHER",
        entityType: "User",
        entityId: user.id,
        newValues: JSON.stringify({
          event: AUTH_AUDIT_EVENTS.PASSWORD_RESET_LINK_GENERATED,
          expiresAt: secret.expiresAt.toISOString(),
        }),
      },
    });
  });
  return { resetUrl: buildPasswordResetUrl(secret.token), expiresAt: secret.expiresAt };
}

/**
 * The public /forgot-password endpoint.
 *
 * This deployment has no email/SMS sending system, and the product decision
 * was explicitly not to fake one. So a self-service request cannot deliver a
 * link to anybody - it records an audit event an admin can act on, and the
 * admin issues the real link from the employee's detail page.
 *
 * Deliberately no token is minted here: an undeliverable token would sit in
 * the database as pure attack surface (one more live hash to brute-force)
 * while helping nobody.
 *
 * Returns `void` in every case - success, unknown email, disabled account,
 * pending account. The caller must respond identically regardless, so this
 * function must never signal which branch it took, including by throwing.
 */
export async function recordPasswordResetRequest(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 320) return;

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, organizationId: true, status: true },
    });
    // Only ACTIVE accounts are worth surfacing to an admin. Everything else
    // exits silently and indistinguishably.
    if (!user || user.status !== "ACTIVE") return;

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "OTHER",
        entityType: "User",
        entityId: user.id,
        newValues: JSON.stringify({ event: AUTH_AUDIT_EVENTS.PASSWORD_RESET_REQUESTED }),
      },
    });
  } catch {
    // Swallowed on purpose: a database hiccup must not turn into a different
    // status code or response time signature for a known vs unknown email.
  }
}

/**
 * Validates a reset token for the reset page, without consuming it. Returns
 * null for every failure mode (unknown, expired, already used, user deleted,
 * user not ACTIVE) so the page can only ever render one generic error.
 */
export async function inspectPasswordResetToken(token: string, now = new Date()) {
  if (!token || token.length > 256) return null;
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(token) },
    select: { expiresAt: true, usedAt: true, user: { select: { name: true, status: true } } },
  });
  if (!row || row.usedAt || row.expiresAt <= now || row.user.status !== "ACTIVE") return null;
  return { firstName: row.user.name.trim().split(/\s+/)[0], expiresAt: row.expiresAt };
}

/**
 * Consumes a reset token and replaces the password, in a single transaction:
 * re-validate unused + unexpired, hash the new password, write it, mark the
 * token used, invalidate the user's other unused reset tokens, and bump
 * `authVersion` so every JWT issued before this moment stops being accepted.
 *
 * Replay- and race-safety comes from the two guarded `updateMany` calls: the
 * token is only consumed if it is still unused, and the user is only updated
 * if they are still ACTIVE. A second concurrent submission of the same link
 * finds `count === 0` and is rejected with the same generic message.
 */
export async function completePasswordReset(token: string, password: string, now = new Date()) {
  const tokenHash = hashPasswordResetToken(token);
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  return prisma.$transaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { status: true } },
      },
    });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now || resetToken.user.status !== "ACTIVE") {
      throw new ApiError(400, INVALID_RESET_TOKEN_MESSAGE);
    }

    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) throw new ApiError(400, INVALID_RESET_TOKEN_MESSAGE);

    const updated = await tx.user.updateMany({
      where: { id: resetToken.userId, organizationId: resetToken.organizationId, status: "ACTIVE" },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ApiError(400, INVALID_RESET_TOKEN_MESSAGE);

    await tx.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, id: { not: resetToken.id }, usedAt: null },
      data: { usedAt: now },
    });
    await tx.auditLog.create({
      data: {
        organizationId: resetToken.organizationId,
        userId: resetToken.userId,
        action: "UPDATE",
        entityType: "User",
        entityId: resetToken.userId,
        newValues: JSON.stringify({ event: AUTH_AUDIT_EVENTS.PASSWORD_RESET_COMPLETED }),
      },
    });
    return { userId: resetToken.userId };
  });
}

/**
 * Self-service password change for a signed-in employee.
 *
 * Bumps `authVersion` like a reset does, which revokes every other session.
 * The caller's own session survives because the client re-authenticates with
 * the password it just set (see components/settings/change-password-form.tsx)
 * - the alternative, letting a stale token heal itself, would defeat the
 * revocation guarantee it is trying to preserve.
 */
export async function changeOwnPassword(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, organizationId: true, status: true, passwordHash: true },
  });
  if (!user || user.status !== "ACTIVE") throw new ApiError(403, "This account cannot change its password");
  if (!(await bcrypt.compare(params.currentPassword, user.passwordHash))) {
    throw new ApiError(400, "Your current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(params.newPassword, BCRYPT_COST);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: user.id, status: "ACTIVE" },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ApiError(403, "This account cannot change its password");

    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "UPDATE",
        entityType: "User",
        entityId: user.id,
        newValues: JSON.stringify({ event: AUTH_AUDIT_EVENTS.PASSWORD_CHANGED }),
      },
    });
    return { userId: user.id };
  });
}
