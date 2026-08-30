import { formatINR } from "./utils";
export { catalogueSpecChips } from "./catalogue-specs";
import { renderCatalogueMessage } from "@/integrations/whatsapp";
import type { CatalogueStatus } from "@prisma/client";
// Type-only import: erased at compile time, so this never triggers
// catalogues.ts's runtime module graph (which pulls in next-auth via
// api-auth.ts and can't load under a plain Node/Vitest environment). This
// file must stay free of any import that isn't `import type` from
// "./catalogues" so its pure functions stay unit-testable in isolation.
import type { getCatalogueByToken } from "./catalogues";

type CatalogueForDTO = Awaited<ReturnType<typeof getCatalogueByToken>>;

export function budgetSummary(lead: { requirementType: string; preferredBhk: number | null; preferredLocation: string; minBudget: number; maxBudget: number; assetClass?: string | null }): string {
  // Commercial requirements have no BHK by design, so the phrase is built from
  // the asset class instead of reading like a residential enquiry.
  const commercial = lead.assetClass === "COMMERCIAL";
  const bhk = !commercial && lead.preferredBhk ? `${lead.preferredBhk} BHK ` : "";
  const kind = lead.requirementType === "RENT" ? "rental" : "sale";
  const noun = commercial ? "commercial property" : "property";
  return `a ${bhk}${kind} ${noun} in ${lead.preferredLocation} within ${formatINR(lead.minBudget, { compact: true })}–${formatINR(lead.maxBudget, { compact: true })}`;
}

export function getPublicCatalogueUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/share/catalogue/${token}`;
}

/** Builds the WhatsApp-ready text for a catalogue - used both for preview and for the actual send. */
export function buildCatalogueMessageText(catalogue: CatalogueForDTO) {
  return renderCatalogueMessage({
    lead: {
      clientName: catalogue.lead.clientName,
      requirementType: catalogue.lead.requirementType,
      preferredBhk: catalogue.lead.preferredBhk,
      preferredLocation: catalogue.lead.preferredLocation,
      minBudget: catalogue.lead.minBudget,
      maxBudget: catalogue.lead.maxBudget,
    },
    catalogueUrl: getPublicCatalogueUrl(catalogue.token),
    employeeName: catalogue.createdBy?.name ?? catalogue.lead.assignedTo?.name ?? null,
    brokerageName: catalogue.organization?.name ?? null,
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
  /** RESIDENTIAL | COMMERCIAL - required so the public view never renders residential-only specs for a commercial listing. */
  assetClass: string;
  propertyType: string;
  workstations: number | null;
  cabins: number | null;
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
  /** What the coordinates above (if any) actually represent - lets the UI show "Approximate area" rather than implying a precise pin when it isn't one. */
  locationDisclosure: "EXACT" | "APPROXIMATE" | "HIDDEN";
}

/**
 * Coordinate precision reduced to ~2 decimal places (~1.1km at Delhi's
 * latitude) - enough to place an approximate map pin without revealing the
 * exact building, matching Property.publicLocationMode = "APPROXIMATE".
 */
function toApproximateCoordinate(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Resolves what location data (if any) is safe to reveal on a public
 * catalogue, independent of the address-text visibility toggle:
 * - HIDDEN / LOCALITY_ONLY: never reveal coordinates - `area` (locality
 *   text) is the only location info shown, exactly like before this field
 *   existed.
 * - APPROXIMATE: reveal a deliberately fuzzed pin regardless of whether the
 *   address text is visible - an approximate pin alone doesn't identify a
 *   specific building.
 * - EXACT: only reveal the real coordinates when this catalogue entry has
 *   also explicitly made the address text visible (`addressVisible &&
 *   includeAddress`) - exact coordinates are exactly as sensitive as the
 *   exact address, so they share the same permission. Otherwise falls back
 *   to the same fuzzed pin as APPROXIMATE, never a silent full reveal.
 */
function resolvePublicLocation(
  property: { latitude: number | null; longitude: number | null; publicLocationMode: string },
  addressVisible: boolean
): Pick<PublicCatalogueProperty, "latitude" | "longitude" | "locationDisclosure"> {
  if (property.latitude === null || property.longitude === null || property.publicLocationMode === "HIDDEN" || property.publicLocationMode === "LOCALITY_ONLY") {
    return { latitude: null, longitude: null, locationDisclosure: "HIDDEN" };
  }
  if (property.publicLocationMode === "EXACT" && addressVisible) {
    return { latitude: property.latitude, longitude: property.longitude, locationDisclosure: "EXACT" };
  }
  return { latitude: toApproximateCoordinate(property.latitude), longitude: toApproximateCoordinate(property.longitude), locationDisclosure: "APPROXIMATE" };
}

export interface PublicCatalogueDTO {
  token: string;
  title: string;
  introMessage: string | null;
  status: CatalogueStatus;
  expiresAt: string | null;
  brokerageName: string;
  brokerageContactPhone: string | null;
  brokerageLogoUrl: string | null;
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
    // Multi-tenant branding (Phase A / A3) - always the OWNING
    // organization's own name/phone/logo, never a different tenant's.
    // catalogue.organization is always present (organizationId is
    // required on CatalogueShare); name is a required field on
    // Organization, phone/logoUrl are optional and simply omitted when unset.
    brokerageName: catalogue.organization?.name || "Property Listing",
    brokerageContactPhone: catalogue.organization?.phone ?? null,
    brokerageLogoUrl: catalogue.organization?.logoUrl ?? null,
    clientFirstName: catalogue.lead.clientName.split(" ")[0],
    requirementSummary: budgetSummary(catalogue.lead),
    // Phase 4 - versioning: a soft-removed property (cp.removedAt set) must
    // never appear here either - the same public token always reflects only
    // the current active property set, "latest version" falls out naturally.
    properties: !propertiesVisible ? [] : catalogue.properties.filter((cp) => !cp.removedAt).map((cp) => {
      const p = cp.property;
      const priceVisible = cp.priceVisible && catalogue.includePrice;
      const brokerageVisible = cp.brokerageVisible && catalogue.includeBrokerage;
      const price = priceVisible ? (p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true })) : null;
      const brokerageAmount = p.listingType === "RENT" ? p.rentBrokerage : p.saleBrokerageAmount;
      const isAvailable = p.status === "AVAILABLE";
      const addressVisible = cp.addressVisible && catalogue.includeAddress;
      const location = resolvePublicLocation(p, addressVisible);

      return {
        id: p.id,
        title: p.title,
        area: p.area,
        address: addressVisible ? p.address : null,
        assetClass: p.assetClass,
        propertyType: p.propertyType,
        workstations: p.workstations,
        cabins: p.cabins,
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
        latitude: location.latitude,
        longitude: location.longitude,
        locationDisclosure: location.locationDisclosure,
      };
    }),
  };
}

/**
 * Executive-only DTO (Phase 4, Objective 9). Reads the SAME CatalogueShare
 * the client sees - no second share/token record - but skips the
 * priceVisible/addressVisible/brokerageVisible/includePrice/includeAddress/
 * includeBrokerage gating entirely and additionally exposes owner/partner
 * contact info, the Internal Property View fields, exact coordinates for
 * navigation, and the per-property executive engagement checklist. NEVER
 * reachable from the public token-based route - callers must restrict this
 * to FIELD_EXECUTIVE/ADMIN/DATA_MANAGER sessions, and a field executive to
 * only their own assigned lead's catalogue.
 */
export interface ExecutiveCatalogueProperty {
  id: string;
  title: string;
  area: string;
  address: string;
  buildingName: string | null;
  flatNumber: string | null;
  gateNumber: string | null;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  assetClass: string;
  propertyType: string;
  workstations: number | null;
  cabins: number | null;
  bhk: number;
  bathrooms: number;
  furnishing: string;
  builtUpAreaSqft: number;
  amenities: string[];
  coverImage: string | null;
  images: string[];
  price: string | null;
  status: string;
  isAvailable: boolean;
  customNote: string | null;
  inventorySource: string;
  ownerName: string | null;
  ownerPhone: string | null;
  partnerName: string | null;
  partnerPhone: string | null;
  propertySource: string | null;
  keyAvailability: string | null;
  entryInstructions: string | null;
  internalNotes: string | null;
  negotiationNotes: string | null;
  hiddenRemarks: string | null;
  executiveStatus: string;
  executiveStatusNote: string | null;
}

export interface ExecutiveCatalogueDTO {
  id: string;
  token: string;
  title: string;
  status: CatalogueStatus;
  version: number;
  clientName: string;
  properties: ExecutiveCatalogueProperty[];
}

export function toExecutiveCatalogueDTO(catalogue: CatalogueForDTO): ExecutiveCatalogueDTO {
  return {
    id: catalogue.id,
    token: catalogue.token,
    title: catalogue.title,
    status: catalogue.status,
    version: catalogue.version,
    clientName: catalogue.lead.clientName,
    properties: catalogue.properties
      .filter((cp) => !cp.removedAt)
      .map((cp) => {
        const p = cp.property;
        const price = p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true });

        return {
          id: p.id,
          title: p.title,
          area: p.area,
          address: p.address,
          buildingName: p.buildingName,
          flatNumber: p.flatNumber,
          gateNumber: p.gateNumber,
          landmark: p.landmark,
          latitude: p.latitude,
          longitude: p.longitude,
          assetClass: p.assetClass,
          propertyType: p.propertyType,
          workstations: p.workstations,
          cabins: p.cabins,
          bhk: p.bhk,
          bathrooms: p.bathrooms,
          furnishing: p.furnishing,
          builtUpAreaSqft: p.builtUpAreaSqft,
          amenities: JSON.parse(p.amenities || "[]"),
          coverImage: p.coverImage,
          images: JSON.parse(p.images || "[]"),
          price,
          status: p.status,
          isAvailable: p.status === "AVAILABLE",
          customNote: cp.customNote,
          inventorySource: p.inventorySource,
          ownerName: p.inventorySource === "DIRECT" ? (p.owner?.name ?? p.ownerName) : null,
          ownerPhone: p.inventorySource === "DIRECT" ? (p.owner?.phone ?? p.ownerPhone) : null,
          partnerName: p.inventorySource === "INDIRECT" ? (p.partner?.name ?? null) : null,
          partnerPhone: p.inventorySource === "INDIRECT" ? (p.partner?.phone ?? null) : null,
          propertySource: p.propertySource,
          keyAvailability: p.keyAvailability,
          entryInstructions: p.entryInstructions,
          internalNotes: p.internalNotes,
          negotiationNotes: p.negotiationNotes,
          hiddenRemarks: p.hiddenRemarks,
          executiveStatus: cp.executiveStatus,
          executiveStatusNote: cp.executiveStatusNote,
        };
      }),
  };
}
