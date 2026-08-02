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

export interface CatalogueTemplateParams {
  clientFirstName: string;
  requirementSummary: string;
  introMessage?: string | null;
  properties: CatalogueTemplateProperty[];
  catalogueUrl: string;
  brokerageCompanyName?: string;
}

function priceLine(property: Property): string {
  const price = property.listingType === "RENT" ? property.monthlyRent : property.salePrice;
  if (price === null || price === undefined) return "Price on request";
  return property.listingType === "RENT" ? formatINR(price, { suffix: "month" }) : formatINR(price, { compact: true });
}

/**
 * Renders the readable WhatsApp catalogue message. Missing/hidden fields are
 * omitted cleanly - never renders "undefined", "null", or a blank label.
 */
export function renderCatalogueMessage(params: CatalogueTemplateParams): string {
  const clientName = params.clientFirstName?.trim() || "there";
  const brokerageCompanyName = params.brokerageCompanyName ?? "Delhi Broker CRM";
  const lines: string[] = [];

  lines.push(`Hello ${clientName},`);
  lines.push("");
  if (params.introMessage?.trim()) {
    lines.push(params.introMessage.trim());
  } else if (params.requirementSummary?.trim()) {
    lines.push(`Based on your requirement for ${params.requirementSummary}, we shortlisted these options:`);
  } else {
    lines.push("We shortlisted these options for you:");
  }
  lines.push("");

  params.properties.forEach((entry, i) => {
    const p = entry.property;
    lines.push(`${i + 1}. ${p.title}`);
    lines.push(entry.addressVisible ? p.address : p.area);
    if (entry.priceVisible) lines.push(priceLine(p));
    lines.push(`${p.bhk} BHK · ${enumToLabel(p.furnishing)}`);
    if (entry.brokerageVisible) {
      const brokerage = p.listingType === "RENT" ? p.rentBrokerage : p.saleBrokerageAmount;
      if (brokerage) lines.push(`Brokerage: ${formatINR(brokerage, { compact: true })}`);
    }
    if (typeof entry.matchScore === "number") lines.push(`Match: ${entry.matchScore}%`);
    if (entry.customNote?.trim()) lines.push(`Note: ${entry.customNote.trim()}`);
    lines.push("");
  });

  lines.push("View full photos and details:");
  lines.push(params.catalogueUrl);
  lines.push("");
  lines.push("Please tell us which property you would like to visit.");
  lines.push("");
  lines.push("Regards,");
  lines.push(brokerageCompanyName);

  return lines.join("\n");
}
