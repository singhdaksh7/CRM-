// Production Admin bootstrap - safe to run repeatedly, unlike prisma/seed.ts
// (which creates demo data and hardcoded passwords like "Admin@123" and must
// never be run against production). This script only ever creates the
// default organization if missing and exactly one Admin account if none
// exists yet; it never overwrites an existing Admin and never touches demo
// data. Run via `npm run bootstrap:production`.
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ORGANIZATION_ID } from "../src/lib/organization";
import { recordAudit } from "../src/lib/audit";

const prisma = new PrismaClient();

// Passwords that ship as literal values in prisma/seed.ts or common docs -
// blocking these specifically stops a copy-pasted dev password from ever
// becoming the real production Admin credential.
const KNOWN_WEAK_PASSWORDS = new Set([
  "admin@123", "kanchan@123", "sagar@123", "employee@123",
  "password", "password123", "changeme", "admin123", "letmein",
]);

function assertStrongPassword(password: string): void {
  const problems: string[] = [];
  if (password.length < 12) problems.push("at least 12 characters");
  if (!/[a-z]/.test(password)) problems.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) problems.push("an uppercase letter");
  if (!/[0-9]/.test(password)) problems.push("a digit");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("a special character");
  if (KNOWN_WEAK_PASSWORDS.has(password.toLowerCase())) {
    problems.push("not a well-known default/dev password");
  }
  if (problems.length > 0) {
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD is too weak - it must contain: ${problems.join(", ")}.`);
  }
}

function slugify(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "organization";
}

async function main() {
  const name = process.env.BOOTSTRAP_ADMIN_NAME;
  const emailRaw = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const organizationName = process.env.BOOTSTRAP_ORGANIZATION_NAME || "Delhi Broker CRM";

  if (!name || !emailRaw || !password) {
    throw new Error(
      "Missing required environment variables. Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and " +
      "BOOTSTRAP_ADMIN_PASSWORD (BOOTSTRAP_ORGANIZATION_NAME is optional, defaults to \"Delhi Broker CRM\")."
    );
  }
  const email = emailRaw.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL is not a valid email address.");
  }
  assertStrongPassword(password);

  // --- Organization: create only if missing, never modify an existing one ---
  const existingOrg = await prisma.organization.findUnique({ where: { id: DEFAULT_ORGANIZATION_ID } });
  if (!existingOrg) {
    const org = await prisma.organization.create({
      data: { id: DEFAULT_ORGANIZATION_ID, name: organizationName, slug: slugify(organizationName) },
    });
    await recordAudit({ action: "CREATE", entityType: "Organization", entityId: org.id, newValues: { name: org.name, slug: org.slug } });
    console.log(`Created organization "${org.name}" (${org.id}).`);
  } else {
    console.log(`Organization ${DEFAULT_ORGANIZATION_ID} already exists - leaving it untouched.`);
  }

  // --- Admin: create only if no Admin exists anywhere, never overwrite ---
  const existingAdmin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  if (existingAdmin) {
    console.log(`An Admin account already exists (${existingAdmin.email}) - skipping. No changes made.`);
    return;
  }

  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    throw new Error(`A user with email "${email}" already exists but is not an Admin - refusing to modify it. Choose a different BOOTSTRAP_ADMIN_EMAIL.`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: { organizationId: DEFAULT_ORGANIZATION_ID, name, email, passwordHash, role: Role.ADMIN },
  });
  await recordAudit({ userId: admin.id, action: "CREATE", entityType: "User", entityId: admin.id, newValues: { name: admin.name, email: admin.email, role: admin.role } });
  console.log(`Created Admin account "${admin.name}" <${admin.email}>. Password was not logged.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
