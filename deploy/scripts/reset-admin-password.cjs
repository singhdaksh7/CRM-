// Operator-run password reset for ONE named ADMIN account. Runs inside kp-crm via
// reset-admin-password.sh (needs a TTY). Mirrors completePasswordReset() in
// src/lib/password-reset.ts: bcryptjs cost 10, new users.passwordHash, authVersion + 1
// (revokes every existing JWT for this account), outstanding reset tokens consumed, audit row.
// The password is read with echo off, never printed, never logged, never put in argv/env.
"use strict";
const crypto = require("node:crypto");
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const bcrypt = require("/tmp/kp-reset/node_modules/bcryptjs");

const TARGET_EMAIL = process.env.RESET_TARGET_EMAIL;
const BCRYPT_COST = 10; // keep in sync with src/lib/auth-events.ts
const prisma = new PrismaClient();

function die(msg) {
  console.error("ABORT: " + msg);
  process.exit(1);
}

// Same rule as passwordPolicy in src/lib/validators.ts: 8..128 chars, not blank.
function policyProblem(p) {
  if (p.length < 8) return "Password must be at least 8 characters";
  if (p.length > 128) return "Password must be at most 128 characters";
  if (p.trim().length === 0) return "Password cannot be blank";
  return null;
}

function promptHidden(label) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let buf = "";
    process.stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          return resolve(buf);
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          return reject(new Error("cancelled"));
        }
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
        else buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const fingerprint = (u) =>
  crypto.createHash("sha256").update(`${u.passwordHash}|${u.authVersion}|${u.updatedAt.toISOString()}|${u.status}|${u.role}`).digest("hex");

async function main() {
  if (!TARGET_EMAIL) die("RESET_TARGET_EMAIL not set");
  if (!process.stdin.isTTY) die("needs an interactive terminal (ssh -t / docker exec -it)");

  const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!user) die("account not found");
  if (user.email !== TARGET_EMAIL) die("email does not match exactly");
  if (user.role !== "ADMIN") die("account is not ADMIN");
  if (user.status !== "ACTIVE") die("account is not ACTIVE");
  console.log(`Target verified: ${user.email} (${user.name}) role=${user.role} status=${user.status}`);

  const others = await prisma.user.findMany({ where: { id: { not: user.id } } });
  const othersBefore = new Map(others.map((o) => [o.id, fingerprint(o)]));

  const pw = await promptHidden("New password (hidden): ");
  const problem = policyProblem(pw);
  if (problem) die(problem);
  const pw2 = await promptHidden("Confirm new password (hidden): ");
  if (pw !== pw2) die("passwords do not match");

  const passwordHash = await bcrypt.hash(pw, BCRYPT_COST);
  const now = new Date();
  const affected = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: user.id, email: TARGET_EMAIL, role: "ADMIN", status: "ACTIVE", organizationId: user.organizationId },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error(`expected exactly 1 row updated, got ${updated.count}`);
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "UPDATE",
        entityType: "User",
        entityId: user.id,
        newValues: JSON.stringify({ event: "password_reset_completed", via: "operator_script" }),
      },
    });
    return updated.count;
  });

  // Verification (no password / hash output)
  const after = await prisma.user.findUnique({ where: { id: user.id } });
  const verifies = await bcrypt.compare(pw, after.passwordHash);
  const othersAfter = await prisma.user.findMany({ where: { id: { not: user.id } } });
  const othersUntouched =
    othersAfter.length === othersBefore.size && othersAfter.every((o) => othersBefore.get(o.id) === fingerprint(o));
  console.log("rows affected:            ", affected);
  console.log("role still ADMIN:         ", after.role === "ADMIN");
  console.log("status still ACTIVE:      ", after.status === "ACTIVE");
  console.log("authVersion bumped:       ", after.authVersion === user.authVersion + 1, "(existing sessions revoked)");
  console.log("new password verifies (bcryptjs compare vs stored hash):", verifies);
  console.log("all other accounts untouched (incl. founder):            ", othersUntouched);
  if (!(affected === 1 && verifies && othersUntouched && after.role === "ADMIN" && after.status === "ACTIVE")) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("ERROR:", e && e.message ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
