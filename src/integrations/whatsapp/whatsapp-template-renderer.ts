import { formatINR, enumToLabel } from "@/lib/utils";
import type { Property } from "@prisma/client";

export interface CatalogueTemplateProperty {
  property: Property;
  matchScore?: number | null;
  customNote?: string | null;
  priceVisible: boolean;
  addressVisible: boolean;
  brokerageVisible: boolean;
}

/** The subset of `Lead` fields the catalogue message is built from - kept as a narrow structural type (not `Lead` itself) so this file stays free of any Prisma runtime import, per its pure-function/no-I/O contract. */
export interface CatalogueTemplateLead {
  clientName: string;
  requirementType: string; // "RENT" | "SALE"
  preferredBhk?: number | null;
  preferredLocation: string;
  minBudget: number;
  maxBudget: number;
}

export interface CatalogueTemplateParams {
  lead: CatalogueTemplateLead;
  properties: CatalogueTemplateProperty[];
  catalogueUrl: string;
  /** The employee sending/assigned to this lead. Falls back to a generic sign-off when absent. */
  employeeName?: string | null;
  /** Organization.name. Falls back to "KP Properties" when absent. */
  brokerageName?: string | null;
}

/**
 * "Flat" / "Villa" / "Independent House" / etc - derived from whichever
 * PropertyType is most common among the shortlisted properties, so the
 * message's "Property type" line describes what's actually being sent
 * rather than requiring a separate field on Lead (which has none). Returns
 * null when there are no properties to derive it from.
 */
function dominantPropertyTypeLabel(properties: CatalogueTemplateProperty[]): string | null {
  if (properties.length === 0) return null;
  const counts = new Map<string, number>();
  for (const entry of properties) {
    const type = entry.property.propertyType;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  if (!best) return null;
  // "Flat" is the term Delhi brokers/clients actually use; enumToLabel's
  // literal "Apartment" reads more like a US listing site than local usage.
  return best === "APARTMENT" ? "Flat" : enumToLabel(best);
}

/**
 * Short requirement phrase, e.g. "2 BHK rental flat" - shared between the
 * catalogue message's intro line and the PROPERTY_OPTIONS_SHARED Meta
 * template's {{3}} variable so both describe the shortlist identically.
 */
export function buildRequirementSummary(lead: CatalogueTemplateLead, properties: CatalogueTemplateProperty[]): string {
  const bhkClause = lead.preferredBhk ? `${lead.preferredBhk} BHK ` : "";
  const kind = lead.requirementType === "RENT" ? "rental" : "sale";
  const typeLabel = dominantPropertyTypeLabel(properties);
  return `${bhkClause}${kind}${typeLabel ? ` ${typeLabel.toLowerCase()}` : ""}`.trim();
}

/**
 * Renders the WhatsApp catalogue message in the CRM's approved format:
 * greeting, shortlist summary, budget/area/type lines, the catalogue link,
 * and a sign-off. Missing/optional fields degrade gracefully - never
 * renders "undefined", "null", or an awkward empty token (e.g. no BHK
 * clause when preferredBhk is unset, no "Property type" line at all when
 * neither BHK nor a property type can be determined).
 *
 * Pure function - no I/O, no Prisma - so it stays directly unit-testable
 * and is exactly what `catalogue-builder.tsx`'s preview textarea shows
 * before send (editable-before-send contract).
 */
export function renderCatalogueMessage(params: CatalogueTemplateParams): string {
  const firstName = params.lead.clientName?.trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Hello ${firstName} Ji 👋` : "Hello there 👋";

  const count = params.properties.length;
  const bhk = params.lead.preferredBhk;
  const kind = params.lead.requirementType === "RENT" ? "rental" : "sale";
  const bhkClause = bhk ? `${bhk} BHK ` : "";
  const propertyNoun = count === 1 ? "property" : "properties";
  const location = params.lead.preferredLocation?.trim();
  const locationClause = location ? ` in and around ${location}` : "";
  const introLine = `As discussed, we have shortlisted ${count} suitable ${bhkClause}${kind} ${propertyNoun} for you${locationClause}.`;

  const typeLabel = dominantPropertyTypeLabel(params.properties);
  const typeLine = bhk || typeLabel ? `🏠 Property type: ${[bhk ? `${bhk} BHK` : null, typeLabel].filter(Boolean).join(" ")}` : null;

  const employeeName = params.employeeName?.trim() || "Our Team";
  const brokerageName = params.brokerageName?.trim() || "KP Properties";

  const lines: string[] = [greeting, "", introLine, "", `💰 Budget range: ${formatINR(params.lead.minBudget)}–${formatINR(params.lead.maxBudget)}`];
  if (location) lines.push(`📍 Preferred area: ${location}`);
  if (typeLine) lines.push(typeLine);
  lines.push("");
  lines.push("You can view the complete options with photos and details here:");
  lines.push("");
  lines.push(params.catalogueUrl);
  lines.push("");
  lines.push("Please select the properties you like, and we will arrange a site visit for you.");
  lines.push("");
  lines.push("Regards,");
  lines.push(employeeName);
  lines.push(brokerageName);

  return lines.join("\n");
}
