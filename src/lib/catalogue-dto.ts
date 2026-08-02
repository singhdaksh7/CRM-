import { formatINR } from "./utils";
import { renderCatalogueMessage } from "@/integrations/whatsapp";
import type { CatalogueStatus } from "@prisma/client";
// Type-only import: erased at compile time, so this never triggers
// catalogues.ts's runtime module graph (which pulls in next-auth via
// api-auth.ts and can't load under a plain Node/Vitest environment). This
// file must stay free of any import that isn't `import type` from
// "./catalogues" so its pure functions stay unit-testable in isolation.
import type { getCatalogueByToken } from "./catalogues";

type CatalogueForDTO = Awaited<ReturnType<typeof getCatalogueByToken>>;

export function budgetSummary(lead: { requirementType: string; preferredBhk: number | null; preferredLocation: string; minBudget: number; maxBudget: number }): string {
  const bhk = lead.preferredBhk ? `${lead.preferredBhk} BHK ` : "";
  const kind = lead.requirementType === "RENT" ? "rental" : "sale";
  return `a ${bhk}${kind} property in ${lead.preferredLocation} within ${formatINR(lead.minBudget, { compact: true })}–${formatINR(lead.maxBudget, { compact: true })}`;
}

export function getPublicCatalogueUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/share/catalogue/${token}`;
}

/** Builds the WhatsApp-ready text for a catalogue - used both for preview and for the actual send. */
export function buildCatalogueMessageText(catalogue: CatalogueForDTO) {
  return renderCatalogueMessage({
    clientFirstName: catalogue.lead.clientName.split(" ")[0],
    requirementSummary: budgetSummary(catalogue.lead),
    introMessage: catalogue.introMessage,
    catalogueUrl: getPublicCatalogueUrl(catalogue.token),
    properties: catalogue.properties.map((cp) => ({
      property: cp.property,
      customNote: cp.customNote,
      priceVisible: cp.priceVisible && catalogue.includePrice,
      addressVisible: cp.addressVisible && catalogue.includeAddress,
      brokerageVisible: cp.brokerageVisible && catalogue.includeBrokerage,
    })),
  });
}

/** Public-safe DTO - never serialize the Prisma CatalogueShare/Property records directly on the public route. */
export interface PublicCatalogueProperty {
  id: string;
  title: string;
  area: string;
  address: string | null;
  bhk: number;
  bathrooms: number;
  furnishing: string;
  builtUpAreaSqft: number;
  amenities: string[];
  coverImage: string | null;
  images: string[];
  price: string | null;
  brokerage: string | null;
  availableFrom: string | null;
  status: string;
  isAvailable: boolean;
  customNote: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PublicCatalogueDTO {
  token: string;
  title: string;
  introMessage: string | null;
  status: CatalogueStatus;
  expiresAt: string | null;
  brokerageName: string;
  brokerageContactPhone: string;
  clientFirstName: string;
  requirementSummary: string;
  properties: PublicCatalogueProperty[];
}

export function toPublicCatalogueDTO(catalogue: CatalogueForDTO): PublicCatalogueDTO {
  // A revoked/expired catalogue must not reveal property details via the
  // API either - not just in the page's conditional rendering. Only the
  // status/branding fields (needed to render the "no longer available"
  // message) survive.
  const propertiesVisible = catalogue.status === "ACTIVE";

  return {
    token: catalogue.token,
    title: catalogue.title,
    introMessage: catalogue.introMessage,
    status: catalogue.status,
    expiresAt: catalogue.expiresAt?.toISOString() ?? null,
    brokerageName: "Delhi Broker CRM",
    brokerageContactPhone: "+919811100001",
    clientFirstName: catalogue.lead.clientName.split(" ")[0],
    requirementSummary: budgetSummary(catalogue.lead),
    properties: !propertiesVisible ? [] : catalogue.properties.map((cp) => {
      const p = cp.property;
      const priceVisible = cp.priceVisible && catalogue.includePrice;
      const brokerageVisible = cp.brokerageVisible && catalogue.includeBrokerage;
      const price = priceVisible ? (p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true })) : null;
      const brokerageAmount = p.listingType === "RENT" ? p.rentBrokerage : p.saleBrokerageAmount;
      const isAvailable = p.status === "AVAILABLE";

      return {
        id: p.id,
        title: p.title,
        area: p.area,
        address: cp.addressVisible && catalogue.includeAddress ? p.address : null,
        bhk: p.bhk,
        bathrooms: p.bathrooms,
        furnishing: p.furnishing,
        builtUpAreaSqft: p.builtUpAreaSqft,
        amenities: JSON.parse(p.amenities || "[]"),
        coverImage: p.coverImage,
        images: JSON.parse(p.images || "[]"),
        price,
        brokerage: brokerageVisible && brokerageAmount ? formatINR(brokerageAmount, { compact: true }) : null,
        availableFrom: p.availableFrom?.toISOString() ?? null,
        status: p.status,
        isAvailable,
        customNote: cp.customNote,
        latitude: p.latitude,
        longitude: p.longitude,
      };
    }),
  };
}
