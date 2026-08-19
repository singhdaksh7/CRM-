import type { Property, CustomerRequirement, Lead } from "@prisma/client";
import { normalizeLocality, getNearbyLocalities } from "./locality";
import type { LocationMatchKind } from "./matching";

/**
 * Two-way demand-pool matching engine: Property <-> {CustomerRequirement,
 * Lead}. Both directions (a Property's matched customers, and a
 * requirement's matching properties) run through this exact same
 * `scoreDemandCandidate` function against a `NormalizedRequirement` -
 * CustomerRequirement and Lead are each adapted into that one shape by
 * `normalizeCustomerRequirement`/`normalizeLeadRequirement` below, so there
 * is deliberately only one scoring algorithm, never two inconsistent ones.
 *
 * Distinct from src/lib/matching.ts (the Lead <-> Property "which properties
 * fit this lead" workflow used elsewhere in the app, with its own
 * bucketed-sections UI). This module additionally introduces the tiered
 * EXACT/STRONG/STRETCH/LOW classification and the configurable budget
 * stretch tolerance the demand pool needs; it does not replace matching.ts.
 */

export type DemandRequirementSource = "CONTACT" | "LEAD";

export interface NormalizedRequirement {
  source: DemandRequirementSource;
  /** The CustomerContact.id or Lead.id this requirement belongs to - the "person". */
  candidateId: string;
  /** CustomerRequirement.id when source === "CONTACT", else null (a Lead has no separate requirement row). */
  requirementId: string | null;
  assetClass: "RESIDENTIAL" | "COMMERCIAL";
  transactionType: "RENT" | "SALE";
  preferredLocalities: string[];
  minBudget: number | null;
  maxBudget: number | null;
  bhk: number | null;
  commercialPropertyType: string | null;
  minArea: number | null;
  maxArea: number | null;
  furnishing: string | null;
  parkingRequired: boolean | null;
  liftRequired: boolean | null;
  commercialFitOutPref: string | null;
  /** False for a DNC/opted-out contact, or a stale (unconfirmed) requirement - excluded from automatic matching upstream, never scored. */
  contactable: boolean;
}

export interface MatchTierConfig {
  /** Organization-configurable, never hardcoded permanently - see SystemConfig.propertyMatchBudgetStretchPct. Fraction, e.g. 0.2 = 20%. */
  budgetStretchPct: number;
}

export const DEFAULT_MATCH_TIER_CONFIG: MatchTierConfig = { budgetStretchPct: 0.2 };

export interface DemandMatchReason {
  label: string;
  matched: boolean;
  detail: string;
}

export type DemandMatchTier = "EXACT" | "STRONG" | "STRETCH" | "LOW";

export interface DemandMatchResult {
  requirement: NormalizedRequirement;
  score: number; // 0-100
  tier: DemandMatchTier;
  reasons: DemandMatchReason[];
  overagePct: number;
  locationMatchKind: LocationMatchKind;
}

function normalizeLocalityList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
  } catch {
    return [];
  }
}

/** Adapts a CustomerRequirement (+ its parent contact's contactability) into the shape the scorer operates on. */
export function normalizeCustomerRequirement(
  requirement: CustomerRequirement,
  contact: { id: string; doNotContact: boolean; whatsAppOptOut: boolean; status: string },
  isStale: boolean
): NormalizedRequirement {
  return {
    source: "CONTACT",
    candidateId: contact.id,
    requirementId: requirement.id,
    assetClass: requirement.assetClass,
    transactionType: requirement.transactionType,
    preferredLocalities: normalizeLocalityList(requirement.preferredLocalities),
    minBudget: requirement.minBudget,
    maxBudget: requirement.maxBudget,
    bhk: requirement.bhk,
    commercialPropertyType: requirement.commercialPropertyType,
    minArea: requirement.minArea,
    maxArea: requirement.maxArea,
    furnishing: requirement.furnishing,
    parkingRequired: requirement.parkingRequired,
    liftRequired: requirement.liftRequired,
    commercialFitOutPref: requirement.commercialFitOutPref,
    contactable:
      requirement.active &&
      !isStale &&
      !contact.doNotContact &&
      !contact.whatsAppOptOut &&
      contact.status !== "DO_NOT_CONTACT" &&
      contact.status !== "ARCHIVED",
  };
}

/** Old/inactive Lead statuses that make continued automatic matching irrelevant (already transacted, or explicitly dead). */
const LEAD_MATCH_INELIGIBLE_STATUSES = new Set(["CLOSED_WON", "CLOSED_LOST", "NOT_INTERESTED", "INVALID"]);

/** Adapts a Lead into the same normalized shape - so a Property's demand match query can union CONTACT and LEAD candidates through one scorer. A Lead with no active, still-relevant requirement is simply not passed in by the caller (see leadIsMatchEligible). */
export function normalizeLeadRequirement(lead: Lead): NormalizedRequirement {
  const transactionType = lead.transactionType ?? (lead.requirementType === "RENT" ? "RENT" : "SALE");
  return {
    source: "LEAD",
    candidateId: lead.id,
    requirementId: null,
    assetClass: lead.assetClass,
    transactionType,
    preferredLocalities: lead.preferredLocation ? [lead.preferredLocation] : [],
    minBudget: lead.minBudget,
    maxBudget: lead.maxBudget,
    bhk: lead.preferredBhk,
    commercialPropertyType: lead.commercialPropertyType,
    minArea: lead.minAreaSqft,
    maxArea: lead.maxAreaSqft,
    furnishing: lead.furnishingPref,
    parkingRequired: lead.parkingRequired,
    liftRequired: lead.liftRequired,
    commercialFitOutPref: lead.commercialFitOutPref,
    contactable: leadIsMatchEligible(lead),
  };
}

/** A Lead still participates in demand matching unless it is DNC-equivalent or has reached a terminal, already-transacted state (CLOSED_WON/CLOSED_LOST/DROPPED) - see rule 31 "do not send to a CLOSED_WON buyer who already bought". */
export function leadIsMatchEligible(lead: Pick<Lead, "status">): boolean {
  return !LEAD_MATCH_INELIGIBLE_STATUSES.has(lead.status);
}

const WEIGHTS = { location: 25, budget: 25, typeFit: 20, furnishing: 10, parking: 5, lift: 5, area: 10 };

function getListingPrice(property: Property): number {
  return property.listingType === "RENT" ? property.monthlyRent ?? 0 : property.salePrice ?? 0;
}

function scoreLocation(requirement: NormalizedRequirement, property: Property, reasons: DemandMatchReason[]): { score: number; kind: LocationMatchKind } {
  if (!requirement.preferredLocalities.length) {
    reasons.push({ label: "Location", matched: true, detail: "No specific locality preference" });
    return { score: WEIGHTS.location, kind: "none" };
  }
  const propLocality = normalizeLocality(property.area);
  for (const preferred of requirement.preferredLocalities) {
    const reqLocality = normalizeLocality(preferred);
    if (reqLocality.matched && propLocality.matched && reqLocality.canonical === propLocality.canonical) {
      reasons.push({ label: "Location", matched: true, detail: `${property.area} exact match` });
      return { score: WEIGHTS.location, kind: "exact" };
    }
  }
  for (const preferred of requirement.preferredLocalities) {
    const reqLocality = normalizeLocality(preferred);
    if (reqLocality.matched && propLocality.matched && getNearbyLocalities(reqLocality.canonical).includes(propLocality.canonical)) {
      reasons.push({ label: "Location", matched: true, detail: `${property.area} is a nearby locality` });
      return { score: WEIGHTS.location * 0.5, kind: "nearby" };
    }
  }
  // Freeform substring fallback, matching the convention already
  // established in src/lib/matching.ts for localities not in the table.
  const propText = property.area.toLowerCase();
  const addrText = property.address.toLowerCase();
  const hit = requirement.preferredLocalities.some((preferred) => {
    const p = preferred.toLowerCase();
    return propText.includes(p) || p.includes(propText) || addrText.includes(p);
  });
  if (hit) {
    reasons.push({ label: "Location", matched: true, detail: `${property.area} matches preferred locality` });
    return { score: WEIGHTS.location, kind: "exact" };
  }
  reasons.push({ label: "Location", matched: false, detail: `${property.area} is not in any preferred locality` });
  return { score: 0, kind: "none" };
}

/**
 * Core scorer shared by both matching directions. Returns null when a hard
 * filter fails (asset class, transaction type, property availability,
 * requirement not contactable, commercial subtype/area/parking/lift, or
 * budget overage beyond `config.budgetStretchPct`) - a null result is never
 * persisted as a PropertyRecommendation. Budget is directional per rule 15:
 * a property cheaper than the requirement's max is never penalized; only a
 * property priced above max consumes stretch tolerance.
 */
export function scoreDemandCandidate(property: Property, requirement: NormalizedRequirement, config: MatchTierConfig = DEFAULT_MATCH_TIER_CONFIG): DemandMatchResult | null {
  if (!requirement.contactable) return null;
  if (property.assetClass !== requirement.assetClass) return null;
  const wantsRent = requirement.transactionType === "RENT";
  if (wantsRent && property.listingType !== "RENT") return null;
  if (!wantsRent && property.listingType !== "SALE") return null;
  if (property.status !== "AVAILABLE") return null;

  const reasons: DemandMatchReason[] = [];
  let score = 0;

  const { score: locationScore, kind: locationMatchKind } = scoreLocation(requirement, property, reasons);
  score += locationScore;

  // Budget: directional (rule 15) - a property below the requirement's max
  // is never penalized. Only overage beyond max consumes stretch tolerance,
  // and overage beyond `config.budgetStretchPct` hard-excludes the match.
  const price = getListingPrice(property);
  const overagePct = requirement.maxBudget && requirement.maxBudget > 0 && price > requirement.maxBudget ? (price - requirement.maxBudget) / requirement.maxBudget : 0;
  if (overagePct > config.budgetStretchPct) {
    reasons.push({ label: "Budget", matched: false, detail: `${(overagePct * 100).toFixed(0)}% above max budget - exceeds ${(config.budgetStretchPct * 100).toFixed(0)}% stretch tolerance` });
    return null;
  }
  if (overagePct === 0) {
    score += WEIGHTS.budget;
    reasons.push({ label: "Budget", matched: true, detail: requirement.maxBudget ? `Within budget (max ₹${requirement.maxBudget.toLocaleString("en-IN")})` : "No specific budget cap" });
  } else {
    const budgetScore = WEIGHTS.budget * (1 - overagePct / config.budgetStretchPct);
    score += budgetScore;
    reasons.push({ label: "Budget", matched: true, detail: `${(overagePct * 100).toFixed(0)}% above max budget of ₹${requirement.maxBudget!.toLocaleString("en-IN")}` });
  }

  if (requirement.assetClass === "COMMERCIAL") {
    // Commercial requirements never depend on BHK (rule 3/16).
    if (requirement.commercialPropertyType && property.propertyType !== requirement.commercialPropertyType) return null;
    if (requirement.minArea && property.builtUpAreaSqft < requirement.minArea) return null;
    if (requirement.maxArea && property.builtUpAreaSqft > requirement.maxArea) return null;
    if (requirement.parkingRequired && !property.parkingAvailable) return null;
    if (requirement.liftRequired && !property.liftAvailable) return null;

    if (requirement.commercialFitOutPref && property.commercialFitOut && property.commercialFitOut !== requirement.commercialFitOutPref) {
      reasons.push({ label: "Fit-out", matched: false, detail: "Fit-out differs from requirement" });
    } else {
      score += WEIGHTS.typeFit;
      reasons.push({ label: "Commercial fit", matched: true, detail: "Property type and area within requirement" });
    }
    score += WEIGHTS.parking + WEIGHTS.lift + WEIGHTS.area; // hard-gated above; presence here just fills the 100-pt scale
    reasons.push({ label: "Parking/Lift/Area", matched: true, detail: "Meets required parking, lift and area constraints" });
  } else {
    // Residential: BHK is a soft signal (off-by-one still scores partially),
    // matching the convention already established in src/lib/matching.ts.
    if (requirement.bhk == null) {
      score += WEIGHTS.typeFit;
      reasons.push({ label: "BHK", matched: true, detail: "No specific BHK preference" });
    } else if (property.bhk === requirement.bhk) {
      score += WEIGHTS.typeFit;
      reasons.push({ label: "BHK", matched: true, detail: `${property.bhk} BHK exact match` });
    } else if (Math.abs(property.bhk - requirement.bhk) === 1) {
      score += WEIGHTS.typeFit * 0.5;
      reasons.push({ label: "BHK", matched: true, detail: `${property.bhk} BHK is close to requested ${requirement.bhk} BHK` });
    } else {
      reasons.push({ label: "BHK", matched: false, detail: `${property.bhk} BHK does not match requested ${requirement.bhk} BHK` });
    }

    if (requirement.furnishing) {
      if (property.furnishing === requirement.furnishing) {
        score += WEIGHTS.furnishing;
        reasons.push({ label: "Furnishing", matched: true, detail: `${property.furnishing.replace("_", " ")} as requested` });
      } else {
        score += WEIGHTS.furnishing * 0.3;
        reasons.push({ label: "Furnishing", matched: false, detail: `Requested ${requirement.furnishing.replace("_", " ")}, property is ${property.furnishing.replace("_", " ")}` });
      }
    } else {
      score += WEIGHTS.furnishing;
      reasons.push({ label: "Furnishing", matched: true, detail: "No specific furnishing preference" });
    }

    if (requirement.parkingRequired == null || !requirement.parkingRequired || property.parkingAvailable) {
      score += WEIGHTS.parking;
    } else {
      reasons.push({ label: "Parking", matched: false, detail: "Parking requested but not available" });
    }
    if (requirement.liftRequired == null || !requirement.liftRequired || property.liftAvailable) {
      score += WEIGHTS.lift;
    } else {
      reasons.push({ label: "Lift", matched: false, detail: "Lift requested but not available" });
    }
    score += WEIGHTS.area; // no distinct residential area-range field on requirement today - see minArea/maxArea limitation
  }

  score = Math.round(Math.min(100, score));
  const tier = classifyTier(score, overagePct, locationMatchKind, config);
  return { requirement, score, tier, reasons, overagePct, locationMatchKind };
}

/**
 * Tier boundaries (documented explicitly so they're auditable, not a black
 * box - rule 18 "match explanation"):
 *  - EXACT:  in budget (overagePct === 0), exact locality, score >= 85
 *  - STRONG: overage within half the stretch tolerance (e.g. <=10% of a 20%
 *            default), or in-budget with a solid-but-imperfect secondary
 *            fit (score >= 65)
 *  - STRETCH: overage in the upper half of the stretch tolerance (e.g.
 *            10%-20% of a 20% default) - property is affordable-adjacent,
 *            worth a look
 *  - LOW:    passed every hard filter and is in budget, but scores weakly
 *            on secondary fit (locality/BHK/furnishing) - "technically
 *            eligible, not a great fit"
 * Anything beyond the stretch tolerance is hard-excluded before this
 * function is reached (see scoreDemandCandidate) - LOW never means
 * "unaffordable", only "weak secondary fit".
 */
export function classifyTier(score: number, overagePct: number, locationMatchKind: LocationMatchKind, config: MatchTierConfig = DEFAULT_MATCH_TIER_CONFIG): DemandMatchTier {
  const halfStretch = config.budgetStretchPct / 2;
  if (overagePct > halfStretch) return "STRETCH";
  if (overagePct === 0 && locationMatchKind === "exact" && score >= 85) return "EXACT";
  if (score >= 65) return "STRONG";
  if (overagePct === 0) return "LOW";
  return "STRETCH";
}

/** Batch entry point for either direction: pass every candidate property against one requirement, or every candidate requirement against one property (call per-requirement and flatten). Sorted by score descending. */
export function scoreDemandCandidates(properties: Property[], requirement: NormalizedRequirement, config: MatchTierConfig = DEFAULT_MATCH_TIER_CONFIG): DemandMatchResult[] {
  return properties
    .map((property) => scoreDemandCandidate(property, requirement, config))
    .filter((r): r is DemandMatchResult => r !== null)
    .sort((a, b) => b.score - a.score);
}

/** The idempotency key stored on PropertyRecommendation.candidateKey - see the model doc comment in schema.prisma for why this exists (Postgres NULL semantics in composite unique constraints). */
export function candidateKeyFor(requirement: Pick<NormalizedRequirement, "source" | "candidateId">): string {
  return `${requirement.source}:${requirement.candidateId}`;
}
