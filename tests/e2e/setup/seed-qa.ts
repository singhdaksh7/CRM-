/**
 * QA-only seed script for Playwright browser validation.
 *
 * Creates deterministic, clearly-synthetic identities used by the E2E auth
 * fixtures. Idempotent (upsert by email) and local-only: refuses to run
 * unless DATABASE_URL points at 127.0.0.1/localhost, so it can never touch a
 * shared or production database.
 */
import { PrismaClient, Role, EmployeeSpeciality } from "@prisma/client";
import bcrypt from "bcryptjs";

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /^(postgresql|postgres):\/\/[^/]*@?(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);
  if (!isLocal) {
    throw new Error(
      `Refusing to run QA seed: DATABASE_URL does not target 127.0.0.1/localhost.\n` +
        `Got: ${url.replace(/:[^:@]*@/, ":***@")}`
    );
  }
}

assertLocalDatabase();

const prisma = new PrismaClient();

export const QA_PASSWORD = "QaTest@12345";

export const QA_USERS = {
  admin: { name: "QA Admin", email: "qa.admin@example.test", phone: "+911000000001", role: Role.ADMIN },
  dataManager: { name: "QA Data Manager", email: "qa.datamanager@example.test", phone: "+911000000002", role: Role.DATA_MANAGER },
  fieldExecutive: {
    name: "QA Field Executive",
    email: "qa.fe@example.test",
    phone: "+911000000003",
    role: Role.FIELD_EXECUTIVE,
    speciality: EmployeeSpeciality.ALL,
  },
  unassignedFieldExecutive: {
    name: "QA Unassigned FE",
    email: "qa.fe.unassigned@example.test",
    phone: "+911000000004",
    role: Role.FIELD_EXECUTIVE,
    speciality: EmployeeSpeciality.ALL,
  },
} as const;

async function main() {
  const passwordHash = await bcrypt.hash(QA_PASSWORD, 10);

  for (const [key, u] of Object.entries(QA_USERS)) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        passwordHash,
        ...("speciality" in u ? { speciality: u.speciality } : {}),
      },
    });
    console.log(`QA user ready: ${key} <${u.email}>`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
