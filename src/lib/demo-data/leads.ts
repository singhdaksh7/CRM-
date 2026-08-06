import type { Lead, LeadSource, Prisma, User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { demoId, demoCode, demoPhone, fullName, AREAS, RENT_BUDGET_TIERS, LEAD_ADDITIONAL_REQUIREMENTS, DEMO_ORGANIZATION_ID } from "./constants";

export const LEAD_COUNT = 20;
// Roughly the same 30/40/30 HOT/WARM/COLD split regardless of total count.
const hotCount = (count: number) => Math.round(count * 0.3);
const warmCount = (count: number) => Math.round(count * 0.4);
// remaining ~30% are COLD

/** Task's requested source labels mapped onto the real LeadSource enum (no 1:1 "Facebook" value exists - see Known Limitations). */
const SOURCE_MAP: { label: string; value: LeadSource }[] = [
  { label: "Website", value: "WEBSITE" },
  { label: "Walk-in", value: "WALK_IN" },
  { label: "WhatsApp", value: "WHATSAPP" },
  { label: "Facebook", value: "MANUAL" },
  { label: "MagicBricks", value: "MAGICBRICKS" },
  { label: "99acres", value: "ACRES_99" },
  { label: "Reference", value: "REFERRAL" },
  { label: "Housing", value: "HOUSING_COM" },
];

const FURNISHING_PREFS: NonNullable<Lead["furnishingPref"]>[] = ["FURNISHED", "SEMI_FURNISHED", "UNFURNISHED"];

/** Fixed scenario lead indices, reserved up front so property-matching / smart-action verification has known, deterministic subjects. */
export const SCENARIO_LEAD_INDEX = {
  perfectMatch: 1,
  nearbyMatch: 2,
  noMatch: 3,
  budgetMismatch: 4,
  localityMismatch: 5,
  hotNoFollowUp: 6,
} as const;

export interface DemoLeadSet {
  all: Lead[];
  scenarioIds: Record<keyof typeof SCENARIO_LEAD_INDEX, string>;
}

/**
 * Pure - no I/O. Builds the exact create-input for lead #i. Split out from
 * createDemoLeads() so scripts/seed-demo-dry-run.ts can project the
 * lead-property matching outcome (via the real matching engine) without
 * calling prisma.lead.create.
 */
export function buildLeadData(rng: Rng, i: number, employees: { admin: User; dataManagers: User[]; fieldExecutives: User[] }, count: number): Prisma.LeadUncheckedCreateInput {
  const hot = hotCount(count);
  const warm = warmCount(count);

  const priority: Lead["priority"] = i <= hot ? "HOT" : i <= hot + warm ? "WARM" : "COLD";
  const source = SOURCE_MAP[(i - 1) % SOURCE_MAP.length];
  const isRent = rng.bool(0.65);
  const clientName = fullName(rng);
  const assignUnassigned = rng.bool(0.12);
  const assignedTo = assignUnassigned ? null : rng.pick(employees.fieldExecutives);
  const complete = rng.bool(0.7); // "mix complete and incomplete requirements"

  // BHK weighted toward 1-3 (matches the property mix's own skew) and a
  // wide-ish budget band, both deliberately generous so most leads
  // genuinely match several properties via the real matching engine
  // rather than needing a hand-picked scenario for every one - see
  // "every lead should naturally match 3-8 properties" in the task spec.
  let preferredLocation: string = AREAS[(i * 7) % AREAS.length];
  let preferredBhk: number | null = complete ? rng.weightedPick<number>([[1, 3], [2, 4], [3, 2], [4, 1]]) : rng.bool(0.5) ? rng.weightedPick<number>([[1, 3], [2, 4], [3, 2], [4, 1]]) : null;
  let furnishingPref = complete ? rng.pick(FURNISHING_PREFS) : null;
  let minBudget = isRent ? rng.pick(RENT_BUDGET_TIERS) : rng.int(30, 120) * 100000;
  let maxBudget = isRent ? minBudget + rng.int(10000, 30000) : minBudget + rng.int(1000000, 4000000);

  // --- Scenario overrides for property-matching verification (see matching.ts) ---
  switch (i) {
    case SCENARIO_LEAD_INDEX.perfectMatch:
      preferredLocation = AREAS[0]; // Karol Bagh - properties #1, #9, #17... land here (AREAS cycle of 15 against 100 properties)
      preferredBhk = 2;
      furnishingPref = "SEMI_FURNISHED";
      minBudget = 8000;
      maxBudget = 40000;
      break;
    case SCENARIO_LEAD_INDEX.nearbyMatch:
      preferredLocation = AREAS[1]; // Patel Nagar
      preferredBhk = 3;
      minBudget = 12000;
      maxBudget = 50000;
      break;
    case SCENARIO_LEAD_INDEX.noMatch:
      preferredLocation = AREAS[2];
      preferredBhk = 4;
      minBudget = 1000;
      maxBudget = 1500; // below every rent tier and every sale price - guaranteed no budget-fit
      break;
    case SCENARIO_LEAD_INDEX.budgetMismatch:
      preferredLocation = AREAS[0];
      preferredBhk = 2;
      minBudget = 500000; // sale-scale budget against what is likely a rent-scale locality mix - deliberate mismatch
      maxBudget = 600000;
      break;
    case SCENARIO_LEAD_INDEX.localityMismatch:
      preferredLocation = "Vasant Kunj"; // not in the 15 demo AREAS - guarantees zero exact-locality matches
      preferredBhk = 2;
      minBudget = 15000;
      maxBudget = 30000;
      break;
    case SCENARIO_LEAD_INDEX.hotNoFollowUp:
      // Left as randomly generated HOT lead; followups.ts skips this id deliberately so
      // notifyHotLeadsNoFollowUp() has a guaranteed subject.
      break;
  }

  // notifyHotLeadsNoFollowUp requires a non-terminal status and a null
  // nextFollowUpAt - force both for that scenario rather than leaving them
  // to the random pick below.
  const status: Lead["status"] =
    i === SCENARIO_LEAD_INDEX.hotNoFollowUp
      ? "CONTACTED"
      : i <= 3
      ? "NEW"
      : rng.pick<Lead["status"]>([
          "NEW", "CONTACTED", "QUALIFIED", "PROPERTIES_SHARED", "VISIT_SCHEDULED",
          "VISIT_COMPLETED", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED",
        ]);
  const createdAt = rng.pastDate(1, 45);
  const nextFollowUpAt =
    i === SCENARIO_LEAD_INDEX.hotNoFollowUp || (["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"] as Lead["status"][]).includes(status)
      ? null
      : rng.daysFromNow(rng.int(-3, 7));

  return {
    id: demoId("lead", i),
    organizationId: DEMO_ORGANIZATION_ID,
    leadCode: demoCode("LEAD", i),
    clientName,
    phone: demoPhone(i, 200),
    email: rng.bool(0.8) ? `${clientName.toLowerCase().replace(/\s+/g, ".")}.${i}@example.com` : null,
    source: source.value,
    requirementType: isRent ? "RENT" : "BUY",
    preferredLocation,
    minBudget,
    maxBudget,
    preferredBhk,
    furnishingPref,
    moveInDate: isRent ? rng.daysFromNow(rng.int(0, 45)) : null,
    additionalRequirements: rng.pick(LEAD_ADDITIONAL_REQUIREMENTS),
    assignedToId: assignedTo?.id ?? null,
    assignmentReason: assignedTo ? `Manually assigned to ${assignedTo.name} during demo data setup.` : null,
    status,
    priority,
    lastContactedAt: status === "NEW" ? null : rng.pastDate(0, 10),
    nextFollowUpAt,
    notes: rng.bool(0.3) ? "Client is flexible on move-in date." : null,
    createdAt,
    updatedAt: createdAt,
  };
}

export async function createDemoLeads(
  rng: Rng,
  employees: { admin: User; dataManagers: User[]; fieldExecutives: User[] },
  count: number = LEAD_COUNT
): Promise<DemoLeadSet> {
  const leads: Lead[] = [];

  for (let i = 1; i <= count; i++) {
    const data = buildLeadData(rng, i, employees, count);
    leads.push(await prisma.lead.create({ data }));
  }

  const scenarioIds = Object.fromEntries(
    Object.entries(SCENARIO_LEAD_INDEX).map(([key, idx]) => [key, demoId("lead", idx)])
  ) as Record<keyof typeof SCENARIO_LEAD_INDEX, string>;

  return { all: leads, scenarioIds };
}
