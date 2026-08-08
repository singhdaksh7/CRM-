import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { ApiError } from "./api-auth";

export const ACCOUNT_SETUP_EXPIRY_HOURS = 48;

export function hashAccountSetupToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildAccountSetupUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/setup-account/${encodeURIComponent(token)}`;
}

export function createAccountSetupSecret(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashAccountSetupToken(token),
    expiresAt: new Date(now.getTime() + ACCOUNT_SETUP_EXPIRY_HOURS * 60 * 60 * 1000),
  };
}

export async function issueAccountSetupToken(params: {
  userId: string;
  organizationId: string;
  actorId: string;
}) {
  const secret = createAccountSetupSecret();
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: params.userId, organizationId: params.organizationId },
      select: { id: true, status: true },
    });
    if (!user) throw new ApiError(404, "Employee not found");
    if (user.status !== "PENDING_SETUP") throw new ApiError(409, "Only pending employees can receive an account setup link");

    await tx.accountSetupToken.deleteMany({ where: { userId: user.id } });
    await tx.accountSetupToken.create({ data: {
      organizationId: params.organizationId,
      userId: user.id,
      tokenHash: secret.tokenHash,
      expiresAt: secret.expiresAt,
    } });
    await tx.auditLog.create({ data: {
      organizationId: params.organizationId,
      userId: params.actorId,
      action: "OTHER",
      entityType: "AccountSetupToken",
      entityId: user.id,
      newValues: JSON.stringify({ event: "account_setup_link_regenerated", expiresAt: secret.expiresAt.toISOString() }),
    } });
  });
  return { setupUrl: buildAccountSetupUrl(secret.token), expiresAt: secret.expiresAt };
}

export async function inspectAccountSetupToken(token: string, now = new Date()) {
  if (!token || token.length > 256) return null;
  const row = await prisma.accountSetupToken.findUnique({
    where: { tokenHash: hashAccountSetupToken(token) },
    select: { expiresAt: true, usedAt: true, user: { select: { name: true, status: true } } },
  });
  if (!row || row.usedAt || row.expiresAt <= now || row.user.status !== "PENDING_SETUP") return null;
  return { firstName: row.user.name.trim().split(/\s+/)[0], expiresAt: row.expiresAt };
}

export async function activateAccount(token: string, password: string, now = new Date()) {
  const tokenHash = hashAccountSetupToken(token);
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.$transaction(async (tx) => {
    const setupToken = await tx.accountSetupToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, organizationId: true, expiresAt: true, usedAt: true, user: { select: { status: true } } },
    });
    if (!setupToken || setupToken.usedAt || setupToken.expiresAt <= now || setupToken.user.status !== "PENDING_SETUP") {
      throw new ApiError(400, "This setup link is invalid or has expired");
    }

    const consumed = await tx.accountSetupToken.updateMany({
      where: { id: setupToken.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) throw new ApiError(400, "This setup link is invalid or has expired");

    const activated = await tx.user.updateMany({
      where: { id: setupToken.userId, organizationId: setupToken.organizationId, status: "PENDING_SETUP" },
      data: { passwordHash, status: "ACTIVE" },
    });
    if (activated.count !== 1) throw new ApiError(400, "This setup link is invalid or has expired");

    await tx.accountSetupToken.updateMany({
      where: { userId: setupToken.userId, id: { not: setupToken.id }, usedAt: null },
      data: { usedAt: now },
    });
    await tx.auditLog.create({ data: {
      organizationId: setupToken.organizationId,
      userId: setupToken.userId,
      action: "OTHER",
      entityType: "User",
      entityId: setupToken.userId,
      newValues: JSON.stringify({ event: "account_setup_completed" }),
    } });
    return { userId: setupToken.userId };
  });
}
