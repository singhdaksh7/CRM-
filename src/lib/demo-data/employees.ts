import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { demoId, demoPhone, AREAS, DEMO_ORGANIZATION_ID } from "./constants";

/**
 * The Role enum only has ADMIN / DATA_MANAGER / FIELD_EXECUTIVE - there is
 * no first-class "Telecaller" or "Sales Executive" role, and adding one
 * would be a schema change (out of scope: "Do NOT modify existing business
 * logic"). Those two job titles are represented as a FIELD_EXECUTIVE/
 * DATA_MANAGER with a distinguishing `notes` label instead, so the
 * requested 5-title spread is honest about what the data model actually
 * supports. See Known Limitations in the seed summary output.
 */
interface EmployeePlan {
  title: "Admin" | "Data Manager" | "Telecaller" | "Sales Executive" | "Field Executive";
  role: "ADMIN" | "DATA_MANAGER" | "FIELD_EXECUTIVE";
  speciality: "RENT" | "SALE" | "COMMERCIAL" | "RESIDENTIAL" | "ALL";
  serviceAreaCount: number;
}

const PLAN: EmployeePlan[] = [
  { title: "Admin", role: "ADMIN", speciality: "ALL", serviceAreaCount: 0 },
  { title: "Data Manager", role: "DATA_MANAGER", speciality: "ALL", serviceAreaCount: 0 },
  { title: "Telecaller", role: "DATA_MANAGER", speciality: "ALL", serviceAreaCount: 0 },
  { title: "Sales Executive", role: "FIELD_EXECUTIVE", speciality: "SALE", serviceAreaCount: 3 },
  { title: "Sales Executive", role: "FIELD_EXECUTIVE", speciality: "SALE", serviceAreaCount: 3 },
  { title: "Field Executive", role: "FIELD_EXECUTIVE", speciality: "RENT", serviceAreaCount: 4 },
  { title: "Field Executive", role: "FIELD_EXECUTIVE", speciality: "ALL", serviceAreaCount: 4 },
  { title: "Field Executive", role: "FIELD_EXECUTIVE", speciality: "ALL", serviceAreaCount: 3 },
];

const EMPLOYEE_NAMES = [
  "Abhishek Sharma", "Kanchan Verma", "Priya Malhotra", "Rohit Kapoor", "Anjali Nair",
  "Sagar Gupta", "Mohit Chawla", "Nonu Bhalla",
];

export interface DemoEmployeeSet {
  admin: User;
  dataManagers: User[];
  fieldExecutives: User[];
  all: User[];
}

/**
 * Consumes the exact same Rng draws createDemoEmployees() would (the
 * per-employee rng.pickMany service-area calls), without any I/O, and
 * returns lightweight stub users carrying only id/name - enough for
 * buildOwnerData/buildPropertyData/buildLeadData's needs. Used by
 * scripts/seed-demo-dry-run.ts so the Rng stream position feeding the
 * projected owners/properties/leads matches the real seed run's.
 */
export function buildEmployeeStubs(rng: Rng): DemoEmployeeSet {
  const all: User[] = [];
  for (let i = 0; i < PLAN.length; i++) {
    const plan = PLAN[i];
    if (plan.serviceAreaCount > 0) rng.pickMany(AREAS, plan.serviceAreaCount);
    all.push({ id: demoId("emp", i + 1), name: `${EMPLOYEE_NAMES[i]} (${plan.title})` } as unknown as User);
  }
  return { admin: all[0], dataManagers: [all[1], all[2]], fieldExecutives: all.slice(3), all };
}

export async function createDemoEmployees(rng: Rng): Promise<DemoEmployeeSet> {
  const passwordHash = await bcrypt.hash("DemoPass@123", 10);
  const all: User[] = [];

  for (let i = 0; i < PLAN.length; i++) {
    const plan = PLAN[i];
    const name = `${EMPLOYEE_NAMES[i]} (${plan.title})`;
    const areas = plan.serviceAreaCount > 0 ? rng.pickMany(AREAS, plan.serviceAreaCount) : [];

    const user = await prisma.user.create({
      data: {
        id: demoId("emp", i + 1),
        organizationId: DEMO_ORGANIZATION_ID,
        name,
        email: `demo.${plan.title.toLowerCase().replace(/\s+/g, ".")}.${i + 1}@kpproperties.demo`,
        passwordHash,
        phone: demoPhone(i, 900),
        role: plan.role,
        status: "ACTIVE",
        notes: `Title: ${plan.title}. Demo employee - seeded by prisma/demo-seed.ts.`,
        maxActiveLeads: plan.role === "FIELD_EXECUTIVE" ? 15 : 25,
        isAvailable: true,
        speciality: plan.speciality,
        autoAssignEnabled: plan.role === "FIELD_EXECUTIVE",
        serviceAreas: areas.length > 0 ? { create: areas.map((a, idx) => ({ locality: a, city: "Delhi", priority: areas.length - idx })) } : undefined,
      },
    });
    all.push(user);
  }

  return {
    admin: all[0],
    dataManagers: [all[1], all[2]],
    fieldExecutives: all.slice(3),
    all,
  };
}
