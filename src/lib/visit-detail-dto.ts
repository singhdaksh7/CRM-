/**
 * Role-aware view model for the Visit Detail page.
 *
 * Kept out of the page component so the privacy rules are unit-testable
 * rather than buried in JSX. Two rules matter:
 *
 *  1. Owner/partner contact exposure reuses the EXISTING internal-property
 *     convention already established in src/lib/catalogue-dto.ts
 *     (toExecutiveCatalogueDTO): owner contact for DIRECT inventory, partner
 *     contact for INDIRECT, plus the key-availability / entry instructions a
 *     person physically standing at the door needs. No new exposure is
 *     invented here.
 *  2. Commercial terms - negotiation notes, hidden remarks, brokerage and
 *     commission - are NEVER included for a FIELD_EXECUTIVE. They are not
 *     "hidden with CSS"; they never leave the server.
 */

import { formatINR } from "./utils";
import { computeVisitProgress, interestLabelFromRating, type VisitProgress } from "./visits";
import type { Role, VisitPropertyStatus, VisitStatus } from "@prisma/client";

export interface VisitDetailProperty {
  visitPropertyId: string;
  propertyId: string;
  sequence: number;
  title: string;
  propertyCode: string;
  propertyType: string;
  listingType: string;
  /** Locality. Always shown - internal staff need to know where they are going. */
  area: string;
  /** Full address. Internal-only surface; never rendered on a client-facing page. */
  address: string;
  buildingName: string | null;
  flatNumber: string | null;
  landmark: string | null;
  floorNumber: number | null;
  builtUpAreaSqft: number;
  bhk: number;
  /** Formatted rent/sale price. */
  price: string | null;
  availabilityStatus: string;
  isAvailable: boolean;
  /** DIRECT / INDIRECT. */
  inventorySource: string;
  latitude: number | null;
  longitude: number | null;
  /** Google Maps deep link, built from the existing external-directions helper. */
  directionsAddress: string;

  // Progress
  status: VisitPropertyStatus;
  visitedAt: Date | null;
  visitedByName: string | null;
  reactionRating: number | null;
  reactionLabel: string | null;
  reactionNote: string | null;
  skipReason: string | null;
  isPreferred: boolean;

  // Contact - only populated when the viewer is allowed it.
  ownerName: string | null;
  ownerPhone: string | null;
  partnerName: string | null;
  partnerPhone: string | null;
  keyAvailability: string | null;
  entryInstructions: string | null;

  /** Commercial notes. Always null for FIELD_EXECUTIVE. */
  negotiationNotes: string | null;
  internalNotes: string | null;
}

export interface VisitDetailDTO {
  id: string;
  status: VisitStatus;
  visitDate: Date;
  visitTime: string;
  meetingLocation: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  overallRating: number | null;
  overallLabel: string | null;
  completionSummary: string | null;
  cancellationReason: string | null;

  client: {
    leadId: string;
    name: string;
    leadCode: string;
    /** Null when the viewer may not see it. */
    phone: string | null;
    requirement: string | null;
    preferredLocation: string | null;
  };

  assignedTo: { id: string; name: string } | null;
  catalogue: { id: string; title: string; version: number } | null;

  properties: VisitDetailProperty[];
  progress: VisitProgress;

  /** What the current viewer is allowed to do. */
  can: {
    runFieldWorkflow: boolean;
    manage: boolean;
    seeCommercialTerms: boolean;
  };
}

/** Shape this DTO needs; deliberately structural so tests can build fixtures without Prisma. */
interface VisitInput {
  id: string;
  status: VisitStatus;
  visitDate: Date;
  visitTime: string;
  meetingLocation: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  overallRating: number | null;
  completionSummary: string | null;
  cancellationReason: string | null;
  leadId: string;
  assignedToId: string | null;
  lead: {
    id: string;
    clientName: string;
    leadCode: string;
    phone: string;
    requirementType: string;
    preferredLocation: string;
    preferredBhk: number | null;
    minBudget: number;
    maxBudget: number;
    additionalRequirements: string | null;
  };
  assignedTo: { id: string; name: string } | null;
  catalogueShare: { id: string; title: string; version: number } | null;
  properties: VisitPropertyInput[];
}

interface VisitPropertyInput {
  id: string;
  propertyId: string;
  sequence: number;
  status: VisitPropertyStatus;
  visitedAt: Date | null;
  reactionRating: number | null;
  reactionNote: string | null;
  skipReason: string | null;
  isPreferred: boolean;
  visitedBy?: { name: string } | null;
  property: {
    id: string;
    title: string;
    propertyCode: string;
    propertyType: string;
    listingType: string;
    area: string;
    address: string;
    buildingName: string | null;
    flatNumber: string | null;
    landmark: string | null;
    floorNumber: number | null;
    builtUpAreaSqft: number;
    bhk: number;
    monthlyRent: number | null;
    salePrice: number | null;
    status: string;
    inventorySource: string;
    latitude: number | null;
    longitude: number | null;
    ownerName: string | null;
    ownerPhone: string | null;
    keyAvailability: string | null;
    entryInstructions: string | null;
    internalNotes: string | null;
    negotiationNotes: string | null;
    partner?: { name: string; phone: string } | null;
  };
}

/**
 * A one-line "what is this client actually looking for", assembled from the
 * structured Lead columns. The Lead model has no single free-text
 * `requirement` field, so this composes the real ones rather than inventing
 * a schema field.
 */
export function buildRequirementSummary(lead: VisitInput["lead"]): string {
  const parts = [
    lead.requirementType === "RENT" ? "Rent" : lead.requirementType === "BUY" ? "Buy" : lead.requirementType,
    lead.preferredBhk ? `${lead.preferredBhk} BHK` : null,
    `in ${lead.preferredLocation}`,
    `${formatINR(lead.minBudget, { compact: true })} - ${formatINR(lead.maxBudget, { compact: true })}`,
  ].filter(Boolean);
  const base = parts.join(" ");
  return lead.additionalRequirements ? `${base} - ${lead.additionalRequirements}` : base;
}

export function toVisitDetailDTO(visit: VisitInput, viewer: { id: string; role: Role }): VisitDetailDTO {
  const isExecutive = viewer.role === "FIELD_EXECUTIVE";
  const seeCommercialTerms = !isExecutive;
  // The assignee runs the field workflow. An ADMIN may also drive it (e.g.
  // recording for an executive whose phone died) - a DATA_MANAGER may not,
  // matching the existing "manage scheduling, don't perform visits" split.
  const runFieldWorkflow = visit.assignedToId === viewer.id || viewer.role === "ADMIN";

  return {
    id: visit.id,
    status: visit.status,
    visitDate: visit.visitDate,
    visitTime: visit.visitTime,
    meetingLocation: visit.meetingLocation,
    startedAt: visit.startedAt,
    completedAt: visit.completedAt,
    overallRating: visit.overallRating,
    overallLabel: interestLabelFromRating(visit.overallRating),
    completionSummary: visit.completionSummary,
    cancellationReason: visit.cancellationReason,

    client: {
      leadId: visit.leadId,
      name: visit.lead.clientName,
      leadCode: visit.lead.leadCode,
      // The executive assigned to meet this client needs to be able to phone
      // them; anyone else on the internal side already sees lead phones.
      phone: runFieldWorkflow || !isExecutive ? visit.lead.phone : null,
      requirement: buildRequirementSummary(visit.lead),
      preferredLocation: visit.lead.preferredLocation,
    },

    assignedTo: visit.assignedTo,
    catalogue: visit.catalogueShare ? { id: visit.catalogueShare.id, title: visit.catalogueShare.title, version: visit.catalogueShare.version } : null,

    properties: visit.properties
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((vp) => {
        const p = vp.property;
        const isDirect = p.inventorySource === "DIRECT";
        return {
          visitPropertyId: vp.id,
          propertyId: vp.propertyId,
          sequence: vp.sequence,
          title: p.title,
          propertyCode: p.propertyCode,
          propertyType: p.propertyType,
          listingType: p.listingType,
          area: p.area,
          address: p.address,
          buildingName: p.buildingName,
          flatNumber: p.flatNumber,
          landmark: p.landmark,
          floorNumber: p.floorNumber,
          builtUpAreaSqft: p.builtUpAreaSqft,
          bhk: p.bhk,
          price: p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true }),
          availabilityStatus: p.status,
          isAvailable: p.status === "AVAILABLE",
          inventorySource: p.inventorySource,
          latitude: p.latitude,
          longitude: p.longitude,
          directionsAddress: `${p.address}, ${p.area}, Delhi`,

          status: vp.status,
          visitedAt: vp.visitedAt,
          visitedByName: vp.visitedBy?.name ?? null,
          reactionRating: vp.reactionRating,
          reactionLabel: interestLabelFromRating(vp.reactionRating),
          reactionNote: vp.reactionNote,
          skipReason: vp.skipReason,
          isPreferred: vp.isPreferred,

          // Same DIRECT/INDIRECT split the executive catalogue view already
          // uses - no new exposure, and nothing extra for a non-assignee.
          ownerName: isDirect ? p.ownerName : null,
          ownerPhone: isDirect ? p.ownerPhone : null,
          partnerName: !isDirect ? (p.partner?.name ?? null) : null,
          partnerPhone: !isDirect ? (p.partner?.phone ?? null) : null,
          keyAvailability: p.keyAvailability,
          entryInstructions: p.entryInstructions,

          // Commercial terms stay server-side for field executives.
          negotiationNotes: seeCommercialTerms ? p.negotiationNotes : null,
          internalNotes: seeCommercialTerms ? p.internalNotes : null,
        };
      }),

    progress: computeVisitProgress(visit.properties),

    can: {
      runFieldWorkflow: runFieldWorkflow && visit.status !== "CANCELLED",
      manage: viewer.role === "ADMIN" || viewer.role === "DATA_MANAGER",
      seeCommercialTerms,
    },
  };
}
