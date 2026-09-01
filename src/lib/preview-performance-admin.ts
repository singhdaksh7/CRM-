import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

/** TEMPORARY PERFORMANCE DIAGNOSTIC — remove before a production merge. */
const SYNTHETIC_ADMIN_EMAIL = "perf.admin@staging.invalid";
const BCRYPT_ROUNDS = 10;

export type PreviewAdminSyncResult = "skipped" | "missing" | "already-current" | "synchronized";

/**
 * Deployment-native, Preview-only synchronization. It deliberately performs
 * no work outside Vercel Preview and cannot create users or alter account
 * identity/role/organization/status. A bcrypt comparison makes cold starts
 * idempotent: authVersion changes only when the configured password changed.
 */
export async function synchronizePreviewPerformanceAdmin(): Promise<PreviewAdminSyncResult> {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.PERF_DIAGNOSTICS_ENABLED !== "1" ||
    !process.env.PERF_STAGING_PASSWORD
  ) {
    return "skipped";
  }

  const syntheticAdmin = await prisma.user.findUnique({
    where: { email: SYNTHETIC_ADMIN_EMAIL },
    select: { id: true, passwordHash: true, role: true, status: true },
  });
  if (!syntheticAdmin) return "missing";
  if (syntheticAdmin.role !== "ADMIN" || syntheticAdmin.status !== "ACTIVE") {
    throw new Error("Synthetic Preview admin is not eligible for credential authentication");
  }

  if (await bcrypt.compare(process.env.PERF_STAGING_PASSWORD, syntheticAdmin.passwordHash)) {
    return "already-current";
  }

  const passwordHash = await bcrypt.hash(process.env.PERF_STAGING_PASSWORD, BCRYPT_ROUNDS);
  if (!(await bcrypt.compare(process.env.PERF_STAGING_PASSWORD, passwordHash))) {
    throw new Error("Synthetic Preview admin password validation failed");
  }
  await prisma.user.update({
    where: { id: syntheticAdmin.id },
    data: { passwordHash, authVersion: { increment: 1 } },
  });
  return "synchronized";
}
