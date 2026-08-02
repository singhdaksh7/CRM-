import { describe, it, expect } from "vitest";
import { toPublicCatalogueDTO } from "./catalogue-dto";
import type { Property } from "@prisma/client";

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: "p1",
    organizationId: "org_default",
    propertyCode: "PROP-0001",
    title: "Spacious 2 BHK Apartment",
    propertyType: "APARTMENT",
    listingType: "RENT",
    status: "AVAILABLE",
    description: "A lovely flat",
    city: "Delhi",
    area: "Janakpuri",
    address: "123 Main Street, Janakpuri",
    landmark: null,
    latitude: 28.6,
    longitude: 77.1,
    monthlyRent: 22000,
    securityDeposit: 44000,
    maintenanceCharge: 1000,
    rentBrokerage: 22000,
    salePrice: null,
    pricePerSqft: null,
    saleBrokeragePct: null,
    saleBrokerageAmount: null,
    negotiable: false,
    bhk: 2,
    bathrooms: 2,
    balconies: 1,
    furnishing: "SEMI_FURNISHED",
    floorNumber: 2,
    totalFloors: 5,
    propertyAgeYears: 5,
    builtUpAreaSqft: 900,
    carpetAreaSqft: 750,
    facing: "NORTH",
    parkingAvailable: true,
    tenantPreference: "FAMILY",
    availableFrom: null,
    amenities: JSON.stringify(["Lift", "Parking"]),
    images: "[]",
    coverImage: "https://example.com/cover.jpg",
    videoUrl: null,
    virtualTourUrl: null,
    floorPlanImage: null,
    ownerName: "Secret Owner Name",
    ownerPhone: "+919999999999",
    ownerAlternatePhone: "+918888888888",
    ownerNotes: "Owner is difficult to reach after 8pm",
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Property;
}

function fakeCatalogue(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cat1",
    organizationId: "org_default",
    token: "abc123",
    leadId: "lead1",
    conversationId: null,
    createdByUserId: "user1",
    title: "Shortlist for Rahul",
    introMessage: null,
    includePrice: true,
    includeAddress: false,
    includeBrokerage: false,
    status: "ACTIVE" as const,
    expiresAt: null,
    viewCount: 0,
    lastViewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lead: {
      id: "lead1",
      clientName: "Rahul Sharma",
      phone: "+919876543210",
      email: "rahul@example.com",
      requirementType: "RENT",
      preferredLocation: "Janakpuri",
      preferredBhk: 2,
      minBudget: 18000,
      maxBudget: 25000,
    },
    properties: [
      {
        id: "csp1",
        catalogueShareId: "cat1",
        propertyId: "p1",
        sortOrder: 0,
        customNote: "Great natural light",
        priceVisible: true,
        addressVisible: false,
        brokerageVisible: false,
        createdAt: new Date(),
        property: property(),
      },
    ],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("toPublicCatalogueDTO - privacy", () => {
  it("never includes owner name, phone, alternate phone, or notes anywhere in the serialized output", () => {
    const dto = toPublicCatalogueDTO(fakeCatalogue());
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("Secret Owner Name");
    expect(serialized).not.toContain("+919999999999");
    expect(serialized).not.toContain("+918888888888");
    expect(serialized).not.toContain("difficult to reach");
  });

  it("never includes the lead's own phone or email", () => {
    const dto = toPublicCatalogueDTO(fakeCatalogue());
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("+919876543210");
    expect(serialized).not.toContain("rahul@example.com");
  });

  it("never includes internal database IDs (organizationId, leadId, createdByUserId)", () => {
    const dto = toPublicCatalogueDTO(fakeCatalogue());
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("org_default");
    expect(serialized).not.toContain("lead1");
    expect(serialized).not.toContain("user1");
  });

  it("hides the exact address when addressVisible/includeAddress is false, showing only the area", () => {
    const dto = toPublicCatalogueDTO(fakeCatalogue());
    expect(dto.properties[0].address).toBeNull();
    expect(dto.properties[0].area).toBe("Janakpuri");
  });

  it("shows the exact address only when both the catalogue and the property-level flag allow it", () => {
    const base = fakeCatalogue();
    base.properties[0].addressVisible = true; // property-level flag must also be on
    const dto = toPublicCatalogueDTO(fakeCatalogue({ includeAddress: true, properties: base.properties }));
    expect(dto.properties[0].address).toBe("123 Main Street, Janakpuri");
  });

  it("hides brokerage by default and shows it only when both flags are enabled", () => {
    const hidden = toPublicCatalogueDTO(fakeCatalogue());
    expect(hidden.properties[0].brokerage).toBeNull();

    const base = fakeCatalogue();
    base.properties[0].brokerageVisible = true; // property-level flag must also be on
    const shown = toPublicCatalogueDTO(fakeCatalogue({ includeBrokerage: true, properties: base.properties }));
    expect(shown.properties[0].brokerage).not.toBeNull();
  });

  it("hides price when includePrice is false", () => {
    const dto = toPublicCatalogueDTO(fakeCatalogue({ includePrice: false }));
    expect(dto.properties[0].price).toBeNull();
  });

  it("marks a property unavailable when its status is RENTED or SOLD", () => {
    const dto = toPublicCatalogueDTO(
      fakeCatalogue({
        properties: [{ id: "csp1", propertyId: "p1", sortOrder: 0, customNote: null, priceVisible: true, addressVisible: true, brokerageVisible: true, createdAt: new Date(), property: property({ status: "RENTED" }) }],
      })
    );
    expect(dto.properties[0].isAvailable).toBe(false);
  });

  it("reveals no property details at all when the catalogue is revoked", () => {
    const dto = toPublicCatalogueDTO(fakeCatalogue({ status: "REVOKED" }));
    expect(dto.properties).toEqual([]);
    expect(JSON.stringify(dto)).not.toContain("Spacious 2 BHK Apartment");
  });

  it("reveals no property details at all when the catalogue is expired", () => {
    const dto = toPublicCatalogueDTO(fakeCatalogue({ status: "EXPIRED" }));
    expect(dto.properties).toEqual([]);
  });

  it("carries through the custom note and client first name", () => {
    const dto = toPublicCatalogueDTO(fakeCatalogue());
    expect(dto.properties[0].customNote).toBe("Great natural light");
    expect(dto.clientFirstName).toBe("Rahul");
  });
});
