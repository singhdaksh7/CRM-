import type { Lead } from "@prisma/client";

/** A client-safe snapshot: identity, contact details, notes and scores never leave CRM. */
export function sanitizeRequirement(lead: Pick<Lead, "requirementType" | "preferredLocation" | "minBudget" | "maxBudget" | "preferredBhk" | "furnishingPref" | "moveInDate">) {
  return { requirementType: lead.requirementType, locality: lead.preferredLocation, budget: { min: lead.minBudget, max: lead.maxBudget }, bhk: lead.preferredBhk, furnishing: lead.furnishingPref, moveInDate: lead.moveInDate?.toISOString() ?? null };
}
export function requirementMessage(snapshot: ReturnType<typeof sanitizeRequirement>) {
  return ["PROPERTY REQUIREMENT", snapshot.bhk ? `${snapshot.bhk} BHK` : null, snapshot.locality, `Budget ₹${snapshot.budget.min.toLocaleString("en-IN")}–₹${snapshot.budget.max.toLocaleString("en-IN")}`, snapshot.furnishing?.replace(/_/g, " "), snapshot.moveInDate ? "Immediate / as discussed" : null].filter(Boolean).join("\n");
}
