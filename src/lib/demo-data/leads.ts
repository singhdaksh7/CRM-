import type { Lead, LeadSource, Prisma, Property, User } from "@prisma/client";
import { prisma } from "../prisma";
import { Rng } from "./rng";
import { matchPropertiesToLead } from "../matching";
import { demoId, demoCode, demoPhone, fullName, AREAS, LEAD_ADDITIONAL_REQUIREMENTS, DEMO_ORGANIZATION_ID } from "./constants";

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

const TARGET_MIN_MATCHES = 3;
const TARGET_MAX_MATCHES = 8;

/**
 * matchPropertyToLead's only HARD filters are requirementType/listingType,
 * property.status === "AVAILABLE", and price <= maxBudget * (1 +
 * tolerance) - there is no lower-price cutoff, and location/BHK/furnishing
 * only affect score, never inclusion (see src/lib/matching.ts). So match
 * COUNT for a lead is driven almost entirely by maxBudget against the
 * available-property price distribution, not by locality or BHK - a wide
 * "generous" budget band (an earlier version of this file) silently
 * matched most or all of the inventory (10-18 matches, seen in
 * seed:demo:dry-run), not 3-8. This searches candidate maxBudget values
 * against the REAL matching engine (the actual oracle for what counts as a
 * match) rather than guessing a band width analytically.
 */
function pickBudgetForMatchRange(rng: Rng, isRent: boolean, availableProperties: Property[]): { minBudget: number; maxBudget: number } {
  const sameType = availableProperties.filter((p) => p.listingType === (isRent ? "RENT" : "SALE"));
  const prices = [...new Set(sameType.map((p) => (isRent ? p.monthlyRent : p.salePrice)).filter((p): p is number => typeof p === "number"))].sort(
    (a, b) => a - b
  );

  const fallback = isRent ? { minBudget: 9000, maxBudget: 120000 } : { minBudget: 3000000, maxBudget: 15000000 };
  if (prices.length === 0) return fallback;

  const targetCount = rng.int(TARGET_MIN_MATCHES, TARGET_MAX_MATCHES);
  const stubLead = {
    requirementType: isRent ? "RENT" : "BUY",
    preferredLocation: "",
    preferredBhk: null,
    furnishingPref: null,
    moveInDate: null,
  } as unknown as Lead;

  let best: { minBudget: number; maxBudget: number; diff: number } | null = null;
  for (const candidateMax of prices) {
    const candidateMin = Math.max(1000, Math.round(candidateMax * 0.5));
    const testLead = { ...stubLead, minBudget: candidateMin, maxBudget: candidateMax } as Lead;
    const matchCount = matchPropertiesToLead(availableProperties, testLead, 0.2).length;
    if (matchCount >= TARGET_MIN_MATCHES && matchCount <= TARGET_MAX_MATCHES) {
      return { minBudget: candidateMin, maxBudget: candidateMax };
    }
    const diff = Math.abs(matchCount - targetCount);
    if (!best || diff < best.diff) best = { minBudget: candidateMin, maxBudget: candidateMax, diff };
  }
  return best ?? fallback;
}

/**
 * Pure - no I/O. Builds the exact create-input for lead #i, given the
 * ALREADY-CREATED (or projected) properties, so its budget can be chosen
 * against real available inventory. Split out from createDemoLeads() so
 * scripts/seed-demo-dry-run.ts can project the lead-property matching
 * outcome without calling prisma.lead.create.
 */
export function buildLeadData(
  rng: Rng,
  i: number,
  employees: { admin: User; dataManagers: User[]; fieldExecutives: User[] },
  count: number,
  availableProperties: Property[]
): Prisma.LeadUncheckedCreateInput {
  const hot = hotCount(count);
  const warm = warmCount(count);

  const priority: Lead["priority"] = i <= hot ? "HOT" : i <= hot + warm ? "WARM" : "COLD";
  const source = SOURCE_MAP[(i - 1) % SOURCE_MAP.length];
  // Scenario leads force requirementType to match the SCALE of budget
  // they're about to be given below (rent tiers are ~9k-120k, sale prices
  // are ~millions) - previously this was left to the random draw, so e.g.
  // budgetMismatch could randomly land as RENT and its "500000-600000"
  // budget would match *every* rent listing instead of demonstrating a
  // mismatch (found via seed:demo:dry-run's matching projection).
  let isRent = rng.bool(0.65);
  if (i === SCENARIO_LEAD_INDEX.budgetMismatch) isRent = false;
  else if (
    i === SCENARIO_LEAD_INDEX.perfectMatch ||
    i === SCENARIO_LEAD_INDEX.nearbyMatch ||
    i === SCENARIO_LEAD_INDEX.noMatch ||
    i === SCENARIO_LEAD_INDEX.localityMismatch
  ) {
    isRent = true;
  }
  const clientName = fullName(rng);
  const assignUnassigned = rng.bool(0.12);
  const assignedTo = assignUnassigned ? null : rng.pick(employees.fieldExecutives);
  const complete = rng.bool(0.7); // "mix complete and incomplete requirements"

  // preferredLocation/BHK/furnishing are for realism/display only - the
  // matching engine's hard filters don't gate on them (see doc comment on
  // pickBudgetForMatchRange above), so they're free to vary without
  // affecting whether "every lead matches 3-8 properties" holds.
  let preferredLocation: string = AREAS[(i * 7) % AREAS.length];
  let preferredBhk: number | null = complete ? rng.weightedPick<number>([[1, 3], [2, 4], [3, 2], [4, 1]]) : rng.bool(0.5) ? rng.weightedPick<number>([[1, 3], [2, 4], [3, 2], [4, 1]]) : null;
  let furnishingPref = complete ? rng.pick(FURNISHING_PREFS) : null;
  let { minBudget, maxBudget } = pickBudgetForMatchRange(rng, isRent, availableProperties);

  // --- Scenario overrides for property-matching verification (see matching.ts) - deliberately OUTSIDE the 3-8 range, that's the point of each one. ---
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
      // isRent forced false above - real sale prices are ~millions, so this
      // budget is genuinely, deterministically far below every sale listing.
      minBudget = 500000;
      maxBudget = 600000;
      break;
    case SCENARIO_LEAD_INDEX.localityMismatch:
      preferredLocation = "Vasant Kunj"; // not in the 15 demo AREAS - guarantees zero exact-locality matches
      preferredBhk = 2;
      minBudget = 15000;
      maxBudget = 30000;
      break;
    case SCENARIO_LEAD_INDEX.hotNoFollowUp:
      // Left as a normal generously-matched HOT lead; followups.ts skips this id deliberately so
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
  properties: Property[],
  count: number = LEAD_COUNT
): Promise<DemoLeadSet> {
  const leads: Lead[] = [];
  const availableProperties = properties.filter((p) => p.status === "AVAILABLE");

  for (let i = 1; i <= count; i++) {
    const data = buildLeadData(rng, i, employees, count, availableProperties);
    leads.push(await prisma.lead.create({ data }));
  }

  const scenarioIds = Object.fromEntries(
    Object.entries(SCENARIO_LEAD_INDEX).map(([key, idx]) => [key, demoId("lead", idx)])
  ) as Record<keyof typeof SCENARIO_LEAD_INDEX, string>;

  return { all: leads, scenarioIds };
}
