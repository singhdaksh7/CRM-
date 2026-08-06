import type { Owner, Prisma, User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { demoId, demoCode, demoPhone, fullName, AREAS, OWNER_NOTE_TEMPLATES, DEMO_ORGANIZATION_ID } from "./constants";

/** Not one of the task's explicit counts - sized so every property (50 by default) can plausibly have its own owner without excessive reuse. */
export const OWNER_COUNT = 30;

interface DemoEmployeeLike {
  admin: User;
  dataManagers: User[];
}

/**
 * Pure - no I/O. Split out (same pattern as properties.ts/leads.ts) so
 * scripts/seed-demo-dry-run.ts can advance the shared Rng stream exactly
 * the way createDemoOwners() would, keeping its downstream property/lead
 * projection representative of the real run's random draws, without an
 * actual prisma.owner.create call.
 */
export function buildOwnerData(rng: Rng, i: number, employees: DemoEmployeeLike): Prisma.OwnerUncheckedCreateInput {
  const name = fullName(rng);
  const verificationStatus = rng.weightedPick<Owner["verificationStatus"]>([
    ["VERIFIED", 4],
    ["PENDING", 2],
    ["UNVERIFIED", 3],
    ["REJECTED", 1],
  ]);
  const createdBy = rng.pick(employees.dataManagers.concat(employees.admin));
  const verifiedBy = verificationStatus === "VERIFIED" ? rng.pick(employees.dataManagers) : null;

  return {
    id: demoId("owner", i),
    organizationId: DEMO_ORGANIZATION_ID,
    ownerCode: demoCode("OWN", i),
    name,
    phone: demoPhone(i, 100),
    alternatePhone: rng.bool(0.4) ? demoPhone(i, 500) : null,
    email: rng.bool(0.7) ? `${name.toLowerCase().replace(/\s+/g, ".")}.${i}@example.com` : null,
    address: `${100 + i} ${rng.pick(AREAS)} Extension, New Delhi`,
    city: "Delhi",
    verificationStatus,
    verifiedAt: verificationStatus === "VERIFIED" ? rng.pastDate(1, 60) : null,
    verifiedById: verifiedBy?.id ?? null,
    notes: rng.pick(OWNER_NOTE_TEMPLATES),
    createdById: createdBy.id,
    createdAt: rng.pastDate(5, 200),
  };
}

export async function createDemoOwners(rng: Rng, employees: DemoEmployeeLike, count: number = OWNER_COUNT): Promise<Owner[]> {
  const owners: Owner[] = [];

  for (let i = 1; i <= count; i++) {
    const data = buildOwnerData(rng, i, employees);
    owners.push(await prisma.owner.create({ data }));
  }

  return owners;
}
