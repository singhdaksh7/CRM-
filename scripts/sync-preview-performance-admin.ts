/**
 * TEMPORARY PERFORMANCE DIAGNOSTIC
 *
 * Synchronizes only the known synthetic Preview ADMIN account with the
 * Preview-only PERF_STAGING_PASSWORD. This script is deliberately invoked
 * through `vercel env run --environment preview`; it never accepts a
 * password argument and never prints credential material.
 *
 * Remove this script together with the performance diagnostics before a
 * production merge.
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const SYNTHETIC_ADMIN_EMAIL = "perf.admin@staging.invalid";
const BCRYPT_ROUNDS = 10;

function assertPreviewOnlyEnvironment() {
  if (process.env.VERCEL_ENV !== "preview") {
    throw new Error("Refusing synthetic password synchronization outside Vercel Preview.");
  }
  if (process.env.PERF_DIAGNOSTICS_ENABLED !== "1") {
    throw new Error("Refusing synthetic password synchronization without the Preview diagnostic gate.");
  }
  if (!process.env.PERF_STAGING_PASSWORD) {
    throw new Error("PERF_STAGING_PASSWORD is not available in the Preview environment.");
  }
}

async function main() {
  assertPreviewOnlyEnvironment();
  const passwordHash = await bcrypt.hash(process.env.PERF_STAGING_PASSWORD!, BCRYPT_ROUNDS);

  // `email` is globally unique. This single-row update deliberately does not
  // create an account, change its role/organization/status, or touch real
  // users. Bumping authVersion invalidates an old synthetic session only.
  await prisma.user.update({
    where: { email: SYNTHETIC_ADMIN_EMAIL },
    data: { passwordHash, authVersion: { increment: 1 } },
  });

  console.log("Synthetic Preview ADMIN password synchronized.");
}

main()
  .catch(() => {
    // Do not serialize runtime/Prisma errors: connection strings and other
    // deployment details must never be emitted by this temporary utility.
    console.error("Synthetic Preview ADMIN synchronization failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
