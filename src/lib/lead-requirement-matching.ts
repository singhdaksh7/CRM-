import type { AssetClass, FurnishingStatus, ListingType, PropertyStatus, PropertyType, TransactionType } from "@prisma/client";

export type RequirementPreferenceValue = "REQUIRED" | "PREFERRED" | "NO_PREFERENCE";

export type RequirementForMatching = {
  id: string;
  status: "ACTIVE" | "PAUSED" | "FULFILLED" | "CANCELLED";
  assetClass: AssetClass;
  transactionType: TransactionType;
  propertyType: PropertyType | null;
  minBudget: number | null;
  maxBudget: number | null;
  minAreaSqft: number | null;
  maxAreaSqft: number | null;
  floorPreference: string | null;
  liftPreference: RequirementPreferenceValue;
  parkingPreference: RequirementPreferenceValue;
  furnishingPreference: FurnishingStatus | null;
  possessionPreference: string | null;
  notes: string | null;
  localities: Array<{ localityId: string; locality: { id: string; name: string } }>;
  bhkValues: Array<{ bhk: number }>;
};

export type RequirementMatchableProperty = {
  id: string;
  status: PropertyStatus;
  assetClass: AssetClass;
  listingType: ListingType;
  propertyType: PropertyType;
  localityId: string | null;
  area: string;
  bhk: number;
  builtUpAreaSqft: number;
  monthlyRent: number | null;
  salePrice: number | null;
  liftAvailable: boolean | null;
  parkingAvailable: boolean | null;
  furnishing: FurnishingStatus | null;
  floorNumber: number | null;
  possessionStatus?: string | null;
};

export type RequirementMatchReason = { label: string; matched: boolean; detail: string };

export type RequirementMatch<T extends RequirementMatchableProperty = RequirementMatchableProperty> = {
  property: T;
  score: number;
  reasons: RequirementMatchReason[];
  matchedRequirement: Pick<RequirementForMatching, "id" | "transactionType" | "status"> & { localities: Array<{ localityId: string; locality: { id: string; name: string } }>; bhkValues: Array<{ bhk: number }> };
};

function priceOf(property: RequirementMatchableProperty) {
  return property.listingType === "RENT" ? property.monthlyRent : property.salePrice;
}

function preferenceScore(
  label: string,
  preference: RequirementPreferenceValue,
  available: boolean | null,
  reasons: RequirementMatchReason[],
): number | null {
  if (preference === "NO_PREFERENCE") return 0;
  if (preference === "REQUIRED" && available === false) return null;
  if (available === true) {
    reasons.push({ label, matched: true, detail: preference === "REQUIRED" ? `${label} available as required` : `${label} available as preferred` });
    return preference === "REQUIRED" ? 8 : 5;
  }
  reasons.push({ label, matched: false, detail: available === false ? `${label} is not available` : `${label} is not confirmed` });
  return 0;
}

/** Match exactly one independent brief. It never combines criteria across briefs. */
export function matchPropertyToRequirement<T extends RequirementMatchableProperty>(property: T, requirement: RequirementForMatching, maxOverageTolerance = 0.2): RequirementMatch<T> | null {
  if (requirement.status !== "ACTIVE" || property.status !== "AVAILABLE") return null;
  if (property.assetClass !== requirement.assetClass) return null;
  if ((requirement.transactionType === "RENT") !== (property.listingType === "RENT")) return null;
  if (requirement.propertyType && property.propertyType !== requirement.propertyType) return null;
  if (requirement.bhkValues.length && !requirement.bhkValues.some((value) => value.bhk === property.bhk)) return null;
  if (requirement.minAreaSqft && property.builtUpAreaSqft < requirement.minAreaSqft) return null;
  if (requirement.maxAreaSqft && property.builtUpAreaSqft > requirement.maxAreaSqft) return null;

  const reasons: RequirementMatchReason[] = [];
  const lift = preferenceScore("Lift", requirement.liftPreference, property.liftAvailable, reasons);
  if (lift === null) return null;
  const parking = preferenceScore("Parking", requirement.parkingPreference, property.parkingAvailable, reasons);
  if (parking === null) return null;

  let score = 18 + lift + parking;
  const price = priceOf(property);
  if (price != null && requirement.maxBudget != null) {
    const overage = price > requirement.maxBudget ? (price - requirement.maxBudget) / requirement.maxBudget : 0;
    if (overage > maxOverageTolerance) return null;
    if (requirement.minBudget != null && price < requirement.minBudget * 0.7) {
      reasons.push({ label: "Budget", matched: false, detail: "Price is well below the stated range" });
    } else if (overage > 0) {
      score += Math.round(24 * (1 - overage / maxOverageTolerance));
      reasons.push({ label: "Budget", matched: true, detail: `${Math.round(overage * 100)}% above the stated maximum` });
    } else {
      score += 28;
      reasons.push({ label: "Budget", matched: true, detail: "Within budget" });
    }
  } else {
    reasons.push({ label: "Budget", matched: false, detail: "Price or budget is not confirmed" });
  }

  if (requirement.localities.length) {
    const locality = requirement.localities.find((item) => item.localityId === property.localityId);
    if (locality) {
      score += 30;
      reasons.push({ label: "Locality", matched: true, detail: `${locality.locality.name} matches a preferred locality` });
    } else {
      reasons.push({ label: "Locality", matched: false, detail: "Not one of the selected localities" });
    }
  }
  if (requirement.bhkValues.length) {
    score += 16;
    reasons.push({ label: "BHK", matched: true, detail: `${property.bhk} BHK is selected in this requirement` });
  }
  if (requirement.furnishingPreference) {
    if (property.furnishing === requirement.furnishingPreference) {
      score += 6;
      reasons.push({ label: "Furnishing", matched: true, detail: "Furnishing preference matches" });
    } else {
      reasons.push({ label: "Furnishing", matched: false, detail: property.furnishing ? "Furnishing differs from preference" : "Furnishing is not confirmed" });
    }
  }
  if (requirement.floorPreference) {
    const floor = property.floorNumber == null ? "unknown" : String(property.floorNumber);
    const matched = floor !== "unknown" && requirement.floorPreference.toLowerCase().includes(floor);
    reasons.push({ label: "Floor", matched, detail: matched ? "Floor preference matches" : floor === "unknown" ? "Floor is not confirmed" : "Floor preference differs" });
    if (matched) score += 3;
  }
  if (requirement.possessionPreference) {
    const matched = Boolean(property.possessionStatus && property.possessionStatus === requirement.possessionPreference);
    reasons.push({ label: "Possession", matched, detail: matched ? "Possession preference matches" : "Possession preference not confirmed" });
    if (matched) score += 3;
  }
  return { property, score: Math.min(100, Math.round(score)), reasons, matchedRequirement: { id: requirement.id, transactionType: requirement.transactionType, status: requirement.status, localities: requirement.localities, bhkValues: requirement.bhkValues } };
}

/** Retain the best valid independent requirement for every property. */
export function matchPropertiesToRequirements<T extends RequirementMatchableProperty>(properties: T[], requirements: RequirementForMatching[], maxOverageTolerance = 0.2): RequirementMatch<T>[] {
  return properties.flatMap((property) => {
    const matches = requirements.map((requirement) => matchPropertyToRequirement(property, requirement, maxOverageTolerance)).filter((match): match is RequirementMatch<T> => match !== null);
    const best = matches.sort((a, b) => b.score - a.score)[0];
    return best ? [best] : [];
  }).sort((a, b) => b.score - a.score);
}
