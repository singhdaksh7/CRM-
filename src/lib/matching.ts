import type { Property, Lead } from "@prisma/client";

/**
 * Property matching engine.
 *
 * Scores each property against a lead's requirements on six weighted
 * dimensions. Budget tolerance is configurable so properties slightly above
 * the client's max budget still surface (clearly labelled) instead of being
 * filtered out entirely - this mirrors how brokers actually work: a client
 * asking for 20k/month will often accept 22k for the right flat.
 */

export const BUDGET_TOLERANCE_TIERS = [
  { label: "Within budget", maxOveragePct: 0 },
  { label: "Up to 10% above budget", maxOveragePct: 0.1 },
  { label: "Up to 20% above budget", maxOveragePct: 0.2 },
] as const;

export interface MatchReason {
  label: string;
  matched: boolean;
  detail: string;
}

export interface MatchResult {
  property: Property;
  score: number; // 0-100
  reasons: MatchReason[];
  aboveBudget: boolean;
  overagePct: number;
  budgetTier: string;
}

const WEIGHTS = {
  location: 25,
  budget: 30,
  bhk: 20,
  furnishing: 10,
  availability: 8,
  propertyType: 7,
};

function getListingPrice(property: Property): number {
  return property.listingType === "RENT" ? property.monthlyRent ?? 0 : property.salePrice ?? 0;
}

function normalizeLocation(s: string): string {
  return s.trim().toLowerCase();
}

export function matchPropertyToLead(property: Property, lead: Lead, maxOverageTolerance = 0.2): MatchResult | null {
  // Hard filter: listing type must match requirement type
  const wantsRent = lead.requirementType === "RENT";
  if (wantsRent && property.listingType !== "RENT") return null;
  if (!wantsRent && property.listingType !== "SALE") return null;
  if (property.status !== "AVAILABLE") return null;

  const reasons: MatchReason[] = [];
  let score = 0;

  // Location match (contains / equals area or address)
  const leadLoc = normalizeLocation(lead.preferredLocation);
  const propLoc = normalizeLocation(property.area);
  const propAddr = normalizeLocation(property.address);
  const locationMatched = propLoc.includes(leadLoc) || leadLoc.includes(propLoc) || propAddr.includes(leadLoc);
  if (locationMatched) {
    score += WEIGHTS.location;
    reasons.push({ label: "Location", matched: true, detail: `${property.area} matches preferred "${lead.preferredLocation}"` });
  } else {
    reasons.push({ label: "Location", matched: false, detail: `${property.area} is not in preferred "${lead.preferredLocation}"` });
  }

  // Budget match
  const price = getListingPrice(property);
  const overagePct = price > lead.maxBudget ? (price - lead.maxBudget) / lead.maxBudget : 0;
  const belowMin = price < lead.minBudget * 0.7; // way below min is also a mismatch (unusual for client)
  let budgetTier = "Within budget";
  if (overagePct > 0 && overagePct <= 0.1) budgetTier = "Up to 10% above budget";
  else if (overagePct > 0.1 && overagePct <= 0.2) budgetTier = "Up to 20% above budget";
  else if (overagePct > 0.2) budgetTier = "Above tolerance";

  if (overagePct === 0 && !belowMin) {
    score += WEIGHTS.budget;
    reasons.push({ label: "Budget", matched: true, detail: `Price fits within ₹${price.toLocaleString("en-IN")} budget range` });
  } else if (overagePct > 0 && overagePct <= maxOverageTolerance) {
    const budgetScore = WEIGHTS.budget * (1 - overagePct / maxOverageTolerance) * 0.85;
    score += budgetScore;
    reasons.push({ label: "Budget", matched: true, detail: `${(overagePct * 100).toFixed(0)}% above max budget of ₹${lead.maxBudget.toLocaleString("en-IN")}` });
  } else if (overagePct > maxOverageTolerance) {
    reasons.push({ label: "Budget", matched: false, detail: `${(overagePct * 100).toFixed(0)}% above budget - exceeds tolerance` });
  } else if (belowMin) {
    reasons.push({ label: "Budget", matched: false, detail: `Priced well below client's minimum budget` });
  }
  if (overagePct > maxOverageTolerance) return null; // hard cutoff beyond tolerance

  // BHK match
  if (lead.preferredBhk) {
    if (property.bhk === lead.preferredBhk) {
      score += WEIGHTS.bhk;
      reasons.push({ label: "BHK", matched: true, detail: `${property.bhk} BHK matches requirement` });
    } else if (Math.abs(property.bhk - lead.preferredBhk) === 1) {
      score += WEIGHTS.bhk * 0.5;
      reasons.push({ label: "BHK", matched: true, detail: `${property.bhk} BHK is close to requested ${lead.preferredBhk} BHK` });
    } else {
      reasons.push({ label: "BHK", matched: false, detail: `${property.bhk} BHK does not match requested ${lead.preferredBhk} BHK` });
    }
  } else {
    score += WEIGHTS.bhk;
    reasons.push({ label: "BHK", matched: true, detail: "No specific BHK preference" });
  }

  // Furnishing match
  if (lead.furnishingPref) {
    if (property.furnishing === lead.furnishingPref) {
      score += WEIGHTS.furnishing;
      reasons.push({ label: "Furnishing", matched: true, detail: `${property.furnishing.replace("_", " ")} as requested` });
    } else {
      score += WEIGHTS.furnishing * 0.3;
      reasons.push({ label: "Furnishing", matched: false, detail: `Client wants ${lead.furnishingPref.replace("_", " ")}, property is ${property.furnishing.replace("_", " ")}` });
    }
  } else {
    score += WEIGHTS.furnishing;
    reasons.push({ label: "Furnishing", matched: true, detail: "No specific furnishing preference" });
  }

  // Availability match
  if (lead.moveInDate && property.availableFrom) {
    const available = new Date(property.availableFrom) <= new Date(lead.moveInDate);
    if (available) {
      score += WEIGHTS.availability;
      reasons.push({ label: "Availability", matched: true, detail: "Available before client's move-in date" });
    } else {
      reasons.push({ label: "Availability", matched: false, detail: "Available after client's desired move-in date" });
    }
  } else {
    score += WEIGHTS.availability;
    reasons.push({ label: "Availability", matched: true, detail: "No specific move-in constraint" });
  }

  // Property type sanity (always passes for now, placeholder for future preference field)
  score += WEIGHTS.propertyType;
  reasons.push({ label: "Property Type", matched: true, detail: `${property.propertyType.replace(/_/g, " ")}` });

  return {
    property,
    score: Math.round(Math.min(100, score)),
    reasons,
    aboveBudget: overagePct > 0,
    overagePct,
    budgetTier,
  };
}

export function matchPropertiesToLead(properties: Property[], lead: Lead, maxOverageTolerance = 0.2): MatchResult[] {
  return properties
    .map((p) => matchPropertyToLead(p, lead, maxOverageTolerance))
    .filter((r): r is MatchResult => r !== null)
    .sort((a, b) => b.score - a.score);
}

const MAX_PROXIMITY_BONUS = 5; // small relative to the 100-point scale - a tiebreaker, not a rework of the existing weights
const PROXIMITY_BONUS_RADIUS_METERS = 5000;

/**
 * Optional, additive proximity refinement - never changes the core scoring
 * above. Only applied when the caller explicitly has both a real property
 * coordinate and a reference point for the lead's preferred locality (see
 * src/lib/locality.ts#getLocalityCentroid); a lead with no resolvable
 * locality centroid, or a property with no geocoded coordinate, is
 * completely unaffected - existing match results/tests for properties
 * without coordinates are unchanged.
 */
export function applyProximityBonus(result: MatchResult, distanceMeters: number | null): MatchResult {
  if (distanceMeters === null || distanceMeters > PROXIMITY_BONUS_RADIUS_METERS) return result;
  const bonus = MAX_PROXIMITY_BONUS * (1 - distanceMeters / PROXIMITY_BONUS_RADIUS_METERS);
  return { ...result, score: Math.round(Math.min(100, result.score + bonus)) };
}
