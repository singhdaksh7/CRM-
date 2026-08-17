import "server-only";
import { prisma } from "./prisma";
import { ApiError } from "./api-auth";
import { AUTH_AUDIT_EVENTS } from "./auth-events";
import type { Prisma } from "@prisma/client";

/**
 * Admin enable/disable of an employee account.
 *
 * Disabling is a security action, not just a status flip: it revokes live
 * sessions (via authVersion) and destroys any outstanding credential-bearing
 * link, so a disabled employee cannot get back in with a reset link they were
 * sent five minutes earlier.
 */

type Tx = Prisma.TransactionClient;

/**
 * Decides which status an INACTIVE employee should be re-enabled into.
 *
 * The dangerous mistake is flipping an employee who never chose a password
 * straight to ACTIVE - their `passwordHash` is the random placeholder written
 * at creation (see POST /api/employees), which nobody knows, so the account
 * would be permanently unusable *and* would look fine in the UI.
 *
 * Signal used: an employee who never completed setup still has account setup
 * token rows, none of which was ever consumed. An employee who did complete
 * setup has a consumed one. Employees seeded before the activation feature
 * existed have no token rows at all and real passwords - they correctly fall
 * through to ACTIVE.
 */
export async function hasCompletedAccountSetup(tx: Tx, userId: string): Promise<boolean> {
  const [usedCount, unusedCount] = await Promise.all([
    tx.accountSetupToken.count({ where: { userId, usedAt: { not: null } } }),
    tx.accountSetupToken.count({ where: { userId, usedAt: null } }),
  ]);
  if (usedCount > 0) return true;
  return unusedCount === 0;
}

/**
 * Sets an employee INACTIVE, revokes their sessions, and invalidates every
 * outstanding setup/reset link they hold. Only an ACTIVE employee can be
 * disabled - a PENDING_SETUP employee has no access to revoke and its own
 * controls are the setup-link ones.
 */
export async function disableEmployeeAccount(params: {
  employeeId: string;
  organizationId: string;
  actorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.user.findFirst({
      where: { id: params.employeeId, organizationId: params.organizationId },
      select: { id: true, status: true },
    });
    if (!employee) throw new ApiError(404, "Employee not found");
    if (employee.status !== "ACTIVE") throw new ApiError(409, "Only an active employee can be disabled");

    const disabled = await tx.user.updateMany({
      where: { id: employee.id, organizationId: params.organizationId, status: "ACTIVE" },
      data: { status: "INACTIVE", authVersion: { increment: 1 } },
    });
    if (disabled.count !== 1) throw new ApiError(409, "Only an active employee can be disabled");

    // Outstanding credential-bearing links die with the account. Setup tokens
    // are marked used rather than deleted so `hasCompletedAccountSetup` keeps
    // its history; reset tokens carry no such meaning and are deleted.
    await tx.passwordResetToken.deleteMany({ where: { userId: employee.id } });
    await tx.accountSetupToken.updateMany({
      where: { userId: employee.id, usedAt: null },
      data: { expiresAt: new Date(0) },
    });

    await tx.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.actorId,
        action: "UPDATE",
        entityType: "User",
        entityId: employee.id,
        oldValues: JSON.stringify({ status: "ACTIVE" }),
        newValues: JSON.stringify({ event: AUTH_AUDIT_EVENTS.ACCOUNT_DISABLED, status: "INACTIVE" }),
      },
    });
    return { id: employee.id, status: "INACTIVE" as const };
  });
}

/**
 * Re-enables an INACTIVE employee into ACTIVE if they have a password they
 * chose themselves, or back into PENDING_SETUP if they never completed setup
 * (the admin then generates a fresh setup link).
 */
export async function enableEmployeeAccount(params: {
  employeeId: string;
  organizationId: string;
  actorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.user.findFirst({
      where: { id: params.employeeId, organizationId: params.organizationId },
      select: { id: true, status: true },
    });
    if (!employee) throw new ApiError(404, "Employee not found");
    if (employee.status !== "INACTIVE") throw new ApiError(409, "Only a disabled employee can be enabled");

    const status = (await hasCompletedAccountSetup(tx, employee.id)) ? "ACTIVE" : "PENDING_SETUP";
    const enabled = await tx.user.updateMany({
      where: { id: employee.id, organizationId: params.organizationId, status: "INACTIVE" },
      data: { status },
    });
    if (enabled.count !== 1) throw new ApiError(409, "Only a disabled employee can be enabled");

    await tx.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.actorId,
        action: "UPDATE",
        entityType: "User",
        entityId: employee.id,
        oldValues: JSON.stringify({ status: "INACTIVE" }),
        newValues: JSON.stringify({ event: AUTH_AUDIT_EVENTS.ACCOUNT_ENABLED, status }),
      },
    });
    return { id: employee.id, status };
  });
}
