import type { Lead } from "@prisma/client";

type SanitizableRequirement = Pick<
  Lead,
  "requirementType" | "preferredLocation" | "minBudget" | "maxBudget" | "preferredBhk" | "furnishingPref" | "moveInDate"
> &
  Partial<Pick<Lead, "assetClass" | "commercialPropertyType" | "minAreaSqft" | "maxAreaSqft">>;

/** A client-safe snapshot: identity, contact details, notes and scores never leave CRM. */
export function sanitizeRequirement(lead: SanitizableRequirement) {
  // Asset class travels with the snapshot: without it a commercial
  // requirement broadcast to an inventory partner was indistinguishable from
  // a residential one (BHK is null for commercial by design, so the message
  // lost the only distinguishing detail).
  const assetClass = lead.assetClass ?? "RESIDENTIAL";
  const commercial = assetClass === "COMMERCIAL";
  return {
    assetClass,
    requirementType: lead.requirementType,
    locality: lead.preferredLocation,
    budget: { min: lead.minBudget, max: lead.maxBudget },
    bhk: commercial ? null : lead.preferredBhk,
    commercialPropertyType: commercial ? lead.commercialPropertyType ?? null : null,
    areaSqft: commercial ? { min: lead.minAreaSqft ?? null, max: lead.maxAreaSqft ?? null } : null,
    furnishing: lead.furnishingPref,
    moveInDate: lead.moveInDate?.toISOString() ?? null,
  };
}

function areaClause(areaSqft: { min: number | null; max: number | null } | null): string | null {
  if (!areaSqft || (areaSqft.min === null && areaSqft.max === null)) return null;
  if (areaSqft.min !== null && areaSqft.max !== null) return `${areaSqft.min}-${areaSqft.max} sqft`;
  return areaSqft.min !== null ? `${areaSqft.min}+ sqft` : `Up to ${areaSqft.max} sqft`;
}

export function requirementMessage(snapshot: ReturnType<typeof sanitizeRequirement>) {
  const commercial = snapshot.assetClass === "COMMERCIAL";
  return [
    commercial ? "COMMERCIAL PROPERTY REQUIREMENT" : "PROPERTY REQUIREMENT",
    commercial ? snapshot.commercialPropertyType?.replace(/_/g, " ") ?? null : snapshot.bhk ? `${snapshot.bhk} BHK` : null,
    commercial ? areaClause(snapshot.areaSqft) : null,
    snapshot.locality,
    `Budget ₹${snapshot.budget.min.toLocaleString("en-IN")}–₹${snapshot.budget.max.toLocaleString("en-IN")}`,
    snapshot.furnishing?.replace(/_/g, " "),
    snapshot.moveInDate ? "Immediate / as discussed" : null,
  ]
    .filter(Boolean)
    .join("\n");
}
