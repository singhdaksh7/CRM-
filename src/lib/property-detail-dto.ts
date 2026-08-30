import type { Property, InventoryPartner } from "@prisma/client";

type PropertyWithPartner = Property & { partner?: Pick<InventoryPartner, "name" | "phone"> | null };

/**
 * FIELD_EXECUTIVE view of a single Property. Mirrors the exposure rules
 * already established in visit-detail-dto.ts and catalogue-dto.ts's
 * executive DTO - no new privacy policy is invented here, this just applies
 * the existing one to the plain property-detail route/page:
 *
 *  - Commercial/internal notes (internalNotes, negotiationNotes,
 *    hiddenRemarks, propertySource, lastVerifiedById) never leave the
 *    server for a FIELD_EXECUTIVE, assigned or not.
 *  - Exact address, building/flat/gate detail, entry instructions, GPS, and
 *    owner/partner contact (DIRECT -> owner, INDIRECT -> partner) are only
 *    included when `hasFieldAccess` is true - i.e. the viewer has a
 *    legitimate assigned-visit or assigned-lead-catalogue reason to need
 *    them (see fieldExecutiveHasPropertyAccess in property-access.ts).
 */
export function toFieldExecutivePropertyDTO(property: PropertyWithPartner, hasFieldAccess: boolean) {
  const isDirect = property.inventorySource === "DIRECT";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- discarded on purpose: `partner` (the full relation object) must never appear in this DTO, only the derived partnerName/partnerPhone fields below
  const { partner, ...base } = property;

  return {
    ...base,

    // Commercial terms - never for a field executive.
    internalNotes: null as string | null,
    negotiationNotes: null as string | null,
    hiddenRemarks: null as string | null,
    propertySource: null as string | null,
    lastVerifiedById: null as string | null,

    // Address / on-site detail - only for a legitimately assigned executive.
    address: hasFieldAccess ? property.address : null,
    buildingName: hasFieldAccess ? property.buildingName : null,
    flatNumber: hasFieldAccess ? property.flatNumber : null,
    gateNumber: hasFieldAccess ? property.gateNumber : null,
    landmark: hasFieldAccess ? property.landmark : null,
    entryInstructions: hasFieldAccess ? property.entryInstructions : null,
    keyAvailability: hasFieldAccess ? property.keyAvailability : null,
    latitude: hasFieldAccess ? property.latitude : null,
    longitude: hasFieldAccess ? property.longitude : null,
    // A7 - GPS capture audit metadata; same gate as the coordinate itself.
    locationCapturedAt: hasFieldAccess ? property.locationCapturedAt : null,
    locationCapturedById: hasFieldAccess ? property.locationCapturedById : null,
    locationAccuracy: hasFieldAccess ? property.locationAccuracy : null,

    // Owner/partner contact - same DIRECT/INDIRECT split used everywhere
    // else in the app, gated the same as address.
    ownerName: hasFieldAccess && isDirect ? property.ownerName : null,
    ownerPhone: hasFieldAccess && isDirect ? property.ownerPhone : null,
    ownerAlternatePhone: null as string | null,
    ownerNotes: null as string | null,
    partnerName: hasFieldAccess && !isDirect ? (property.partner?.name ?? null) : null,
    partnerPhone: hasFieldAccess && !isDirect ? (property.partner?.phone ?? null) : null,
  };
}
