import type { InventoryPartner, Prisma, User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { demoId, demoCode, demoPhone, AREAS, DEMO_ORGANIZATION_ID } from "./constants";

/** Sized so ~30% of demo properties (see properties.ts) can plausibly be linked to one without excessive reuse. */
export const INVENTORY_PARTNER_COUNT = 10;

const PARTNER_COMPANY_SUFFIXES = ["Real Estate", "Properties", "Realty", "Estates", "Property Consultants", "Associates"];
const PARTNER_NAME_POOL = ["Sharma", "Verma", "Gupta", "Malhotra", "Chopra", "Khanna", "Bhatia", "Kapoor", "Arora", "Mehta"];

interface DemoEmployeeLike {
  admin: User;
  dataManagers: User[];
}

/**
 * Pure - no I/O. Same split as buildOwnerData/buildPropertyData so
 * scripts/seed-demo-dry-run.ts (via validate.ts) can advance the shared Rng
 * stream identically to a real createDemoInventoryPartners() run.
 */
export function buildInventoryPartnerData(rng: Rng, i: number, employees: DemoEmployeeLike): Prisma.InventoryPartnerUncheckedCreateInput {
  const surname = PARTNER_NAME_POOL[(i - 1) % PARTNER_NAME_POOL.length];
  const company = `${surname} ${rng.pick(PARTNER_COMPANY_SUFFIXES)}`;
  const createdBy = rng.pick(employees.dataManagers.concat(employees.admin));
  const localityCount = rng.int(1, 3);
  const localities = Array.from(new Set(Array.from({ length: localityCount }, () => rng.pick(AREAS))));

  return {
    id: demoId("partner", i),
    organizationId: DEMO_ORGANIZATION_ID,
    partnerCode: demoCode("PTR", i),
    name: `${surname} Kumar`,
    company,
    phone: demoPhone(i, 900),
    alternatePhone: rng.bool(0.3) ? demoPhone(i, 950) : null,
    localities: JSON.stringify(localities),
    notes: rng.bool(0.5) ? `Regular source of ${localities[0]} inventory.` : null,
    commissionSplitPct: rng.pick([40, 50, 50, 60] as const),
    isActive: rng.bool(0.9),
    lastInventoryUpdateAt: rng.pastDate(1, 30),
    createdById: createdBy.id,
    createdAt: rng.pastDate(10, 200),
  };
}

export async function createDemoInventoryPartners(rng: Rng, employees: DemoEmployeeLike, count: number = INVENTORY_PARTNER_COUNT): Promise<InventoryPartner[]> {
  const partners: InventoryPartner[] = [];

  for (let i = 1; i <= count; i++) {
    const data = buildInventoryPartnerData(rng, i, employees);
    partners.push(await prisma.inventoryPartner.create({ data }));
  }

  return partners;
}
