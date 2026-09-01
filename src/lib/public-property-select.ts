import type { Prisma } from "@prisma/client";

/**
 * The public-safe Property field allow-list, shared by the bare public
 * property page (/p/[id]) and its regression test. Kept in its own module
 * with no Next.js/prisma-client/auth imports so the test can assert on it
 * directly without pulling in the full server module graph.
 *
 * Safe at the data boundary, not just in JSX: this is a strict Prisma
 * `select`, mirroring the same public-safe fields toPublicCatalogueDTO
 * (catalogue-dto.ts) already exposes for a shared catalogue. It never
 * selects internalNotes, negotiationNotes, hiddenRemarks,
 * ownerName/ownerPhone/ownerAlternatePhone/ownerNotes, entryInstructions,
 * gateNumber, buildingName, flatNumber, exact address, latitude/longitude,
 * geocode/verification metadata, or propertySource - those fields are
 * simply never in scope for a page built on this select to leak, regardless
 * of what future JSX gets added there.
 */
export const PUBLIC_PROPERTY_SELECT = {
  id: true,
  organizationId: true,
  propertyCode: true,
  title: true,
  listingType: true,
  area: true,
  bhk: true,
  bathrooms: true,
  builtUpAreaSqft: true,
  monthlyRent: true,
  salePrice: true,
  negotiable: true,
  furnishing: true,
  floorNumber: true,
  totalFloors: true,
  facing: true,
  parkingAvailable: true,
  tenantPreference: true,
  amenities: true,
  description: true,
  coverImage: true,
  status: true,
} satisfies Prisma.PropertySelect;
