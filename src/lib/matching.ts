import type { Property, Lead, OwnerVerificationStatus } from "@prisma/client";
import { normalizeLocality, getNearbyLocalities, getLocalityCentroid } from "./locality";
import { haversineDistanceMeters } from "./geo";

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

/** How the location score was earned - "exact" (canonical locality match), "nearby" (curated/derived adjacency), or "none" (no locality match, including the freeform substring fallback). */
export type LocationMatchKind = "exact" | "nearby" | "none";

/**
 * A `Property` optionally carrying its `owner` relation. `owner` is optional
 * so callers that don't `include: { owner: true }` on their Prisma query
 * still satisfy this type - `verified` simply defaults to `false` when the
 * relation isn't loaded.
 */
export type MatchableProperty = Property & {
  owner?: { verificationStatus: OwnerVerificationStatus } | null;
};

export interface MatchResult {
  property: Property;
  score: number; // 0-100
  reasons: MatchReason[];
  aboveBudget: boolean;
  overagePct: number;
  budgetTier: string;
  /** How the location score was earned - additive field, defaults to "none". */
  locationMatchKind: LocationMatchKind;
  /** Whether the property's linked owner has a VERIFIED verification status. Defaults to false when the owner relation wasn't loaded. */
  verified: boolean;
  /** Whether the property has a cover image or any images in its images JSON array. */
  hasImages: boolean;
}

const WEIGHTS = {
  location: 25,
  budget: 30,
  bhk: 20,
  furnishing: 10,
  availability: 8,
  propertyType: 7,
};

/** Small, additive bonuses layered on top of the core 100-point scale - tiebreakers, not a rework of the existing weights. Total score is always capped at 100. */
const VERIFIED_BONUS = 3;
const HAS_IMAGES_BONUS = 2;

function getListingPrice(property: Property): number {
  return property.listingType === "RENT" ? property.monthlyRent ?? 0 : property.salePrice ?? 0;
}

function normalizeLocation(s: string): string {
  return s.trim().toLowerCase();
}

/** Best-effort parse of the `images` JSON array field - tolerates malformed/legacy data instead of throwing. */
function parseImageCount(images: string | null | undefined): number | null {
  if (!images) return null;
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed)) return parsed.length;
    return null;
  } catch {
    return null;
  }
}

function finalizeMatch(property: MatchableProperty, score: number, reasons: MatchReason[], overagePct: number, budgetTier: string, locationMatchKind: LocationMatchKind): MatchResult {
  const verified = property.owner?.verificationStatus === "VERIFIED";
  const imageCount = parseImageCount(property.images);
  const hasImages = Boolean(property.coverImage) || Boolean(imageCount && imageCount > 0);
  if (verified) score += VERIFIED_BONUS;
  if (hasImages) score += HAS_IMAGES_BONUS;
  return { property, score: Math.round(Math.min(100, score)), reasons, aboveBudget: overagePct > 0, overagePct, budgetTier, locationMatchKind, verified, hasImages };
}

export function matchPropertyToLead(property: MatchableProperty, lead: Lead, maxOverageTolerance = 0.2): MatchResult | null {
  // Canonical mandatory gates. Legacy leads safely derive transaction from
  // `requirementType`, preserving pre-foundation records during rollout.
  if (property.assetClass !== lead.assetClass) return null;
  const transactionType = lead.transactionType ?? (lead.requirementType === "RENT" ? "RENT" : "SALE");
  const wantsRent = transactionType === "RENT";
  if (wantsRent && property.listingType !== "RENT") return null;
  if (!wantsRent && property.listingType !== "SALE") return null;
  if (property.status !== "AVAILABLE") return null;

  const reasons: MatchReason[] = [];
  let score = 0;

  // Location match - locality-normalized first, substring as a last resort.
  let locationMatchKind: LocationMatchKind = "none";
  const leadLocality = normalizeLocality(lead.preferredLocation);
  const propLocality = normalizeLocality(property.area);

  if (leadLocality.matched && propLocality.matched && leadLocality.canonical === propLocality.canonical) {
    locationMatchKind = "exact";
    score += WEIGHTS.location;
    reasons.push({ label: "Location", matched: true, detail: "Exact locality match" });
  } else if (leadLocality.matched && propLocality.matched && getNearbyLocalities(leadLocality.canonical).includes(propLocality.canonical)) {
    locationMatchKind = "nearby";
    score += WEIGHTS.location * 0.5;
    reasons.push({ label: "Location", matched: true, detail: `Nearby locality: ${propLocality.canonical}` });
  } else {
    // Fallback: freeform substring containment (keeps working for
    // preferredLocation/area values that aren't in the locality table).
    const leadLoc = normalizeLocation(lead.preferredLocation);
    const propLoc = normalizeLocation(property.area);
    const propAddr = normalizeLocation(property.address);
    const locationMatched = propLoc.includes(leadLoc) || leadLoc.includes(propLoc) || propAddr.includes(leadLoc);
    if (locationMatched) {
      locationMatchKind = "exact";
      score += WEIGHTS.location;
      reasons.push({ label: "Location", matched: true, detail: `${property.area} matches preferred "${lead.preferredLocation}"` });
    } else {
      reasons.push({ label: "Location", matched: false, detail: `${property.area} is not in preferred "${lead.preferredLocation}"` });
    }
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

  // Commercial requirements deliberately do not depend on residential BHK.
  if (lead.assetClass === "COMMERCIAL") {
    if (lead.commercialPropertyType && property.propertyType !== lead.commercialPropertyType) return null;
    if (lead.minAreaSqft && property.builtUpAreaSqft < lead.minAreaSqft) return null;
    if (lead.maxAreaSqft && property.builtUpAreaSqft > lead.maxAreaSqft) return null;
    if (lead.commercialFitOutPref && property.commercialFitOut && property.commercialFitOut !== lead.commercialFitOutPref) {
      reasons.push({ label: "Fit-out", matched: false, detail: "Fit-out differs from requirement" });
    } else {
      score += WEIGHTS.bhk;
      reasons.push({ label: "Commercial fit", matched: true, detail: "Commercial type and area match requirement" });
    }
    if (lead.parkingRequired && !property.parkingAvailable) return null;
    if (lead.liftRequired && !property.liftAvailable) return null;
    return finalizeMatch(property, score, reasons, overagePct, budgetTier, locationMatchKind);
  }

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

  // Verified-listing signal - additive bonus, never part of the hard filter.
  const verified = property.owner?.verificationStatus === "VERIFIED";
  if (verified) {
    score += VERIFIED_BONUS;
    reasons.push({ label: "Verified", matched: true, detail: "Verified listing" });
  }

  // Has-images signal - additive bonus, never part of the hard filter.
  const imageCount = parseImageCount(property.images);
  const hasImages = Boolean(property.coverImage) || Boolean(imageCount && imageCount > 0);
  if (hasImages) {
    score += HAS_IMAGES_BONUS;
    reasons.push({
      label: "Photos",
      matched: true,
      detail: imageCount && imageCount > 0 ? `Includes ${imageCount} photos` : "Includes photos",
    });
  }

  return {
    property,
    score: Math.round(Math.min(100, score)),
    reasons,
    aboveBudget: overagePct > 0,
    overagePct,
    budgetTier,
    locationMatchKind,
    verified,
    hasImages,
  };
}

export function matchPropertiesToLead(properties: MatchableProperty[], lead: Lead, maxOverageTolerance = 0.2): MatchResult[] {
  const results = properties
    .map((p) => matchPropertyToLead(p, lead, maxOverageTolerance))
    .filter((r): r is MatchResult => r !== null)
    .sort((a, b) => b.score - a.score);

  // Best-effort proximity refinement: only applied when both the lead's
  // preferred-locality centroid and the property's coordinate (or its own
  // locality centroid) are resolvable. Silently skipped otherwise - never
  // throws, never blocks the base result set.
  const leadCentroid = getLocalityCentroid(lead.preferredLocation);
  if (!leadCentroid) return results;

  return results
    .map((result) => {
      const property = result.property;
      let propertyCoords: { latitude: number; longitude: number } | null = null;
      if (property.latitude !== null && property.longitude !== null) {
        propertyCoords = { latitude: property.latitude, longitude: property.longitude };
      } else {
        propertyCoords = getLocalityCentroid(property.area);
      }
      if (!propertyCoords) return result;

      const distanceMeters = haversineDistanceMeters(leadCentroid, propertyCoords);
      return applyProximityBonus(result, distanceMeters);
    })
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

export interface SectionedMatches {
  bestMatches: MatchResult[];
  nearBudget: MatchResult[];
  nearbyLocalities: MatchResult[];
  slightlyAboveBudget: MatchResult[];
  otherSuggestions: MatchResult[];
}

/**
 * Pure, additive bucketing of an already-computed match list into the
 * workspace's five display sections. Each result appears in exactly one
 * section - first matching rule wins, evaluated top to bottom:
 *   1. bestMatches: score >= 80, within budget, exact locality match
 *   2. nearBudget: within/at budget (not already in bestMatches)
 *   3. nearbyLocalities: locationMatchKind === "nearby" (not yet placed)
 *   4. slightlyAboveBudget: aboveBudget === true (not yet placed)
 *   5. otherSuggestions: everything else
 * The input is expected to already be sorted by score descending (as
 * `matchPropertiesToLead` returns); since each section is built via a
 * stable `filter`, that ordering is preserved within every section.
 */
export function sectionizeMatches(results: MatchResult[]): SectionedMatches {
  const bestMatches: MatchResult[] = [];
  const nearBudget: MatchResult[] = [];
  const nearbyLocalities: MatchResult[] = [];
  const slightlyAboveBudget: MatchResult[] = [];
  const otherSuggestions: MatchResult[] = [];

  for (const result of results) {
    if (result.score >= 80 && !result.aboveBudget && result.locationMatchKind === "exact") {
      bestMatches.push(result);
    } else if (!result.aboveBudget) {
      nearBudget.push(result);
    } else if (result.locationMatchKind === "nearby") {
      nearbyLocalities.push(result);
    } else if (result.aboveBudget) {
      slightlyAboveBudget.push(result);
    } else {
      otherSuggestions.push(result);
    }
  }

  return { bestMatches, nearBudget, nearbyLocalities, slightlyAboveBudget, otherSuggestions };
}
