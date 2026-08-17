/**
 * Privacy and shaping rules for the Visit Detail view model. These matter
 * because the same page serves an Admin and a Field Executive, and the
 * executive must never receive commercial terms - not "hidden with CSS", but
 * genuinely absent from the payload.
 */

import { describe, it, expect } from "vitest";
import { toVisitDetailDTO, buildRequirementSummary } from "./visit-detail-dto";
import type { Role } from "@prisma/client";

const lead = {
  id: "lead_rahul",
  clientName: "Rahul Sharma",
  leadCode: "LEAD-0001",
  phone: "+919876543210",
  requirementType: "RENT",
  preferredLocation: "Janakpuri",
  preferredBhk: 2,
  minBudget: 25000,
  maxBudget: 40000,
  additionalRequirements: "Needs covered parking",
};

function property(overrides: Record<string, unknown> = {}) {
  return {
    id: "propF",
    title: "F Block 2BHK",
    propertyCode: "PROP-1",
    propertyType: "APARTMENT",
    listingType: "RENT",
    area: "Janakpuri",
    address: "F Block, near the metro",
    buildingName: null,
    flatNumber: "12B",
    landmark: null,
    floorNumber: 2,
    builtUpAreaSqft: 850,
    bhk: 2,
    monthlyRent: 28000,
    salePrice: null,
    status: "AVAILABLE",
    inventorySource: "DIRECT",
    latitude: 28.62,
    longitude: 77.08,
    ownerName: "Ravi Kumar",
    ownerPhone: "+919111111111",
    keyAvailability: "Keys with the guard",
    entryInstructions: "Use the rear gate",
    internalNotes: "Owner is flexible on the deposit",
    negotiationNotes: "Will accept 26000; our brokerage is one month",
    partner: null,
    ...overrides,
  };
}

function visit(overrides: Record<string, unknown> = {}) {
  return {
    id: "visit1",
    status: "IN_PROGRESS" as const,
    visitDate: new Date("2026-08-18T05:30:00.000Z"),
    visitTime: "11:00",
    meetingLocation: "Property site",
    startedAt: new Date("2026-08-18T05:35:00.000Z"),
    completedAt: null,
    overallRating: null,
    completionSummary: null,
    cancellationReason: null,
    leadId: "lead_rahul",
    assignedToId: "emp_sagar",
    lead,
    assignedTo: { id: "emp_sagar", name: "Sagar" },
    catalogueShare: { id: "cat1", title: "Janakpuri shortlist", version: 2 },
    properties: [
      {
        id: "vp1",
        propertyId: "propF",
        sequence: 0,
        status: "VISITED" as const,
        visitedAt: new Date("2026-08-18T06:00:00.000Z"),
        reactionRating: 4,
        reactionNote: "Liked the balcony",
        skipReason: null,
        isPreferred: false,
        visitedBy: { name: "Sagar" },
        property: property(),
      },
      {
        id: "vp2",
        propertyId: "propM",
        sequence: 1,
        status: "PENDING" as const,
        visitedAt: null,
        reactionRating: null,
        reactionNote: null,
        skipReason: null,
        isPreferred: false,
        visitedBy: null,
        property: property({ id: "propM", title: "M Block 3BHK", inventorySource: "INDIRECT", ownerName: "Should be hidden", ownerPhone: "+919222222222", partner: { name: "Delhi Homes", phone: "+919333333333" } }),
      },
    ],
    ...overrides,
  };
}

const SAGAR = { id: "emp_sagar", role: "FIELD_EXECUTIVE" as Role };
const OTHER_EXEC = { id: "emp_other", role: "FIELD_EXECUTIVE" as Role };
const ADMIN = { id: "admin1", role: "ADMIN" as Role };
const DATA_MANAGER = { id: "dm1", role: "DATA_MANAGER" as Role };

describe("commercial-term privacy", () => {
  it("withholds negotiation and internal notes from a field executive entirely", () => {
    const dto = toVisitDetailDTO(visit(), SAGAR);
    for (const p of dto.properties) {
      expect(p.negotiationNotes).toBeNull();
      expect(p.internalNotes).toBeNull();
    }
    expect(dto.can.seeCommercialTerms).toBe(false);
    // Belt and braces: no serialized copy of the commercial text survives.
    expect(JSON.stringify(dto)).not.toContain("our brokerage");
  });

  it("gives an admin and a data manager the commercial notes", () => {
    for (const viewer of [ADMIN, DATA_MANAGER]) {
      const dto = toVisitDetailDTO(visit(), viewer);
      expect(dto.properties[0].negotiationNotes).toContain("26000");
      expect(dto.properties[0].internalNotes).toBeTruthy();
      expect(dto.can.seeCommercialTerms).toBe(true);
    }
  });
});

describe("owner and partner contact exposure", () => {
  it("shows owner contact for DIRECT inventory and partner contact for INDIRECT", () => {
    const dto = toVisitDetailDTO(visit(), SAGAR);
    const [direct, indirect] = dto.properties;

    expect(direct.ownerName).toBe("Ravi Kumar");
    expect(direct.ownerPhone).toBe("+919111111111");
    expect(direct.partnerName).toBeNull();

    // An INDIRECT property has no owner to expose, even though the legacy
    // ownerName/ownerPhone columns still hold data.
    expect(indirect.ownerName).toBeNull();
    expect(indirect.ownerPhone).toBeNull();
    expect(indirect.partnerName).toBe("Delhi Homes");
    expect(indirect.partnerPhone).toBe("+919333333333");
  });

  it("passes through the key/entry instructions the executive needs on site", () => {
    const dto = toVisitDetailDTO(visit(), SAGAR);
    expect(dto.properties[0].keyAvailability).toBe("Keys with the guard");
    expect(dto.properties[0].entryInstructions).toBe("Use the rear gate");
  });
});

describe("workflow permissions", () => {
  it("lets the assigned executive run the workflow", () => {
    expect(toVisitDetailDTO(visit(), SAGAR).can.runFieldWorkflow).toBe(true);
  });

  it("does not let a different executive run it", () => {
    expect(toVisitDetailDTO(visit(), OTHER_EXEC).can.runFieldWorkflow).toBe(false);
  });

  it("does not let a data manager run the on-site workflow, but does let them manage the schedule", () => {
    const dto = toVisitDetailDTO(visit(), DATA_MANAGER);
    expect(dto.can.runFieldWorkflow).toBe(false);
    expect(dto.can.manage).toBe(true);
  });

  it("closes the workflow once the visit is cancelled", () => {
    expect(toVisitDetailDTO(visit({ status: "CANCELLED" }), SAGAR).can.runFieldWorkflow).toBe(false);
  });

  it("withholds the client phone from an executive who is not assigned", () => {
    expect(toVisitDetailDTO(visit(), OTHER_EXEC).client.phone).toBeNull();
    expect(toVisitDetailDTO(visit(), SAGAR).client.phone).toBe("+919876543210");
    expect(toVisitDetailDTO(visit(), ADMIN).client.phone).toBe("+919876543210");
  });
});

describe("shaping", () => {
  it("orders properties by sequence and derives an interest label from the raw star value", () => {
    const dto = toVisitDetailDTO(visit(), ADMIN);
    expect(dto.properties.map((p) => p.sequence)).toEqual([0, 1]);
    expect(dto.properties[0].reactionRating).toBe(4);
    expect(dto.properties[0].reactionLabel).toBe("INTERESTED");
    expect(dto.properties[1].reactionLabel).toBeNull();
  });

  it("computes progress across the whole visit", () => {
    const dto = toVisitDetailDTO(visit(), ADMIN);
    expect(dto.progress.label).toBe("1/2 Visited, 1 Remaining");
    expect(dto.progress.allResolved).toBe(false);
  });

  it("surfaces the source catalogue reference", () => {
    expect(toVisitDetailDTO(visit(), ADMIN).catalogue).toEqual({ id: "cat1", title: "Janakpuri shortlist", version: 2 });
    expect(toVisitDetailDTO(visit({ catalogueShare: null }), ADMIN).catalogue).toBeNull();
  });

  it("formats rent and sale prices from the correct column", () => {
    const rent = toVisitDetailDTO(visit(), ADMIN).properties[0];
    expect(rent.price).toBeTruthy();

    const saleVisit = visit();
    saleVisit.properties[0].property = property({ listingType: "SALE", monthlyRent: null, salePrice: 9500000 });
    expect(toVisitDetailDTO(saleVisit, ADMIN).properties[0].price).toBeTruthy();
  });

  it("keeps the internal address available to staff and builds a directions target", () => {
    const dto = toVisitDetailDTO(visit(), SAGAR);
    expect(dto.properties[0].address).toBe("F Block, near the metro");
    expect(dto.properties[0].directionsAddress).toContain("Janakpuri");
  });

  it("reports availability alongside per-property visit progress", () => {
    const dto = toVisitDetailDTO(visit(), ADMIN);
    expect(dto.properties[0].availabilityStatus).toBe("AVAILABLE");
    expect(dto.properties[0].isAvailable).toBe(true);
    expect(dto.properties[0].status).toBe("VISITED");
    expect(dto.properties[1].status).toBe("PENDING");
  });
});

describe("requirement summary", () => {
  it("composes the structured lead columns into one readable line", () => {
    const summary = buildRequirementSummary(lead);
    expect(summary).toContain("Rent");
    expect(summary).toContain("2 BHK");
    expect(summary).toContain("Janakpuri");
    expect(summary).toContain("Needs covered parking");
  });

  it("omits the trailing note when there is none", () => {
    // The budget range legitimately contains a dash, so assert on the note
    // text itself rather than on the separator.
    const withNote = buildRequirementSummary(lead);
    const withoutNote = buildRequirementSummary({ ...lead, additionalRequirements: null });
    expect(withNote).toContain("Needs covered parking");
    expect(withoutNote).not.toContain("Needs covered parking");
    expect(withNote.startsWith(withoutNote)).toBe(true);
  });
});
