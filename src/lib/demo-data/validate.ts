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
