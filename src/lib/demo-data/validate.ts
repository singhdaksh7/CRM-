import type { Lead, Owner, InventoryPartner, Property } from "@prisma/client";
import { Rng, DEMO_SEED } from "./rng";
import { DEMO_SEED_PLAN } from "./plan";
import { buildEmployeeStubs, type DemoEmployeeSet } from "./employees";
import { buildOwnerData } from "./owners";
import { buildInventoryPartnerData } from "./inventory-partners";
import { buildPropertyData } from "./properties";
import { buildLeadData } from "./leads";
import { matchPropertiesToLead } from "../matching";
import { ensureDemoPropertyAssets } from "./assets";
import { PROPERTY_ISSUE_SCENARIO_INDEX } from "./property-issues";

export interface LeadMatchCount {
  leadCode: string;
  matches: number;
}

export interface DatasetValidationResult {
  employees: DemoEmployeeSet;
  properties: Property[];
  availableProperties: Property[];
  leads: Lead[];
  perLead: LeadMatchCount[];
  totalMatchPairs: number;
  outsideRange: LeadMatchCount[];
  passed: boolean;
  errors: string[];
}

/**
 * Single source of truth for "what would seed:demo generate, and does its
 * matching distribution meet the quality gate" - built from the exact same
 * pure builders (buildEmployeeStubs/buildOwnerData/buildPropertyData/
 * buildLeadData) that createDemoEmployees/createDemoOwners/
 * createDemoProperties/createDemoLeads call internally, driven by a fresh
 * Rng(DEMO_SEED) in the identical employees -> owners -> properties -> leads
 * order/counts those functions use. Two Rng instances seeded identically
 * and driven through an identical call sequence produce byte-identical
 * output (Rng has no external state - see rng.ts), so this projection is
 * not an approximation of what seed:demo will create, it IS what seed:demo
 * will create, computed before any prisma call happens.
 *
 * Zero database I/O. ensureDemoPropertyAssets() is filesystem-only
 * (idempotent SVG placeholder generation, see assets.ts), not a DB write.
 */
export function buildAndValidateProjectedDataset(): DatasetValidationResult {
  const errors: string[] = [];
  const rng = new Rng(DEMO_SEED);
  const employees = buildEmployeeStubs(rng);

  const owners: Owner[] = [];
  for (let i = 1; i <= DEMO_SEED_PLAN.owners; i++) {
    owners.push(buildOwnerData(rng, i, employees) as unknown as Owner);
  }

  // Phase 4 - built here (same rng stream position as the real
  // createDemoInventoryPartners call in scripts/seed-demo.ts, between
  // owners and properties) so this projection stays byte-identical to
  // what seed:demo will actually create - see this file's doc comment.
  const partners: InventoryPartner[] = [];
  for (let i = 1; i <= DEMO_SEED_PLAN.inventoryPartners; i++) {
    partners.push(buildInventoryPartnerData(rng, i, employees) as unknown as InventoryPartner);
  }

  const assetsByType = ensureDemoPropertyAssets();
  const properties: Property[] = [];
  for (let i = 1; i <= DEMO_SEED_PLAN.properties; i++) {
    properties.push(buildPropertyData(rng, i, owners, employees, assetsByType, partners) as unknown as Property);
  }

  // Single source of truth for the ONE post-calibration Property mutation
  // scripts/seed-demo.ts's real pipeline performs before lead-property
  // matching is ever checked: src/lib/demo-data/property-issues.ts's
  // "approved availability report" scenario unconditionally flips this
  // property to RENTED (pure index arithmetic, not an rng draw, so this
  // stays byte-identical to what the real seed will do). Applied here,
  // BEFORE `availableProperties` is computed and BEFORE lead budgets are
  // calibrated against it, so the calibration - and therefore the dry-run
  // and the real seed - are both working from the true FINAL property
  // state, not a pre-mutation snapshot that later silently goes stale.
  // Every other demo-data module was audited (grep for
  // prisma.property.update/prisma.lead.update across src/lib/demo-data/)
  // and performs no other field mutation relevant to matching.
  const approvedAvailabilityIndex = PROPERTY_ISSUE_SCENARIO_INDEX.approvedAvailability;
  properties[approvedAvailabilityIndex - 1] = {
    ...properties[approvedAvailabilityIndex - 1],
    status: "RENTED",
  };

  const availableProperties = properties.filter((p) => p.status === "AVAILABLE");

  const leads: Lead[] = [];
  for (let i = 1; i <= DEMO_SEED_PLAN.leads; i++) {
    leads.push(buildLeadData(rng, i, employees, DEMO_SEED_PLAN.leads, availableProperties) as unknown as Lead);
  }

  const perLead: LeadMatchCount[] = leads.map((lead) => ({
    leadCode: lead.leadCode,
    matches: matchPropertiesToLead(availableProperties, lead, 0.2).length,
  }));
  const totalMatchPairs = perLead.reduce((sum, l) => sum + l.matches, 0);
  const { min, max } = DEMO_SEED_PLAN.leadPropertyMatchRange;
  const outsideRange = perLead.filter((l) => l.matches < min || l.matches > max);

  if (totalMatchPairs < DEMO_SEED_PLAN.minLeadPropertyMatches) {
    errors.push(`Total match pairs ${totalMatchPairs} below minimum ${DEMO_SEED_PLAN.minLeadPropertyMatches}.`);
  }
  if (outsideRange.length > 0) {
    errors.push(`${outsideRange.length} lead(s) outside the ${min}-${max} match range: ${outsideRange.map((l) => `${l.leadCode}=${l.matches}`).join(", ")}`);
  }

  return {
    employees,
    properties,
    availableProperties,
    leads,
    perLead,
    totalMatchPairs,
    outsideRange,
    passed: errors.length === 0,
    errors,
  };
}
