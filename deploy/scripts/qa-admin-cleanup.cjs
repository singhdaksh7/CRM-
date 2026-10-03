// Deletes the temporary QA admin user created by qa-admin-login.cjs, and removes the
// session-cookie/userid files. JWT sessions are stateless (no DB session table), so deleting the
// user is sufficient: the jwt() callback's authVersion/status re-check drops any lingering token
// on its next request.
"use strict";
const fs = require("node:fs");
const { PrismaClient } = require("/app/node_modules/@prisma/client");
const prisma = new PrismaClient();
const RUN_ID = process.env.QA_RUN_ID;

async function main() {
  if (!RUN_ID) throw new Error("QA_RUN_ID not set");
  const email = `${RUN_ID.toLowerCase()}@kpproperties.local`;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log("no QA admin user found for", email, "(already removed)");
  } else {
    if (user.role !== "ADMIN" || !email.includes(RUN_ID.toLowerCase())) throw new Error("safety check failed, refusing to delete");
    await prisma.user.delete({ where: { id: user.id } });
    console.log("deleted QA admin user:", email, user.id);
  }
  for (const f of ["/tmp/kp-qa/session.cookie", "/tmp/kp-qa/qa-user-id.txt"]) {
    try { fs.unlinkSync(f); } catch {}
  }
  const remaining = await prisma.user.count({ where: { email: { contains: RUN_ID.toLowerCase() } } });
  console.log("remaining users matching run id:", remaining);
}

main()
  .catch((e) => { console.error("ERROR:", e.message || e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
