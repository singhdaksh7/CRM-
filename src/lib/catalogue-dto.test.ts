import { describe, it, expect } from "vitest";
import { toPublicCatalogueDTO, toExecutiveCatalogueDTO } from "./catalogue-dto";
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
    pincode: null,
    formattedAddress: null,
    placeId: null,
    geocodeStatus: "NOT_ATTEMPTED",
    geocodedAt: null,
    locationPrecision: "APPROXIMATE",
    publicLocationMode: "LOCALITY_ONLY",
    // Phase 4 fields
    inventorySource: "DIRECT",
    partnerId: null,
    buildingName: "Sunrise Apartments",
    flatNumber: "301",
    gateNumber: "Gate 2",
    propertySource: "Referral",
    keyAvailability: "With owner",
    entryInstructions: "Ring the bell twice",
    internalNotes: "Owner prefers evening visits only",
    negotiationNotes: "Can go 5% lower on rent",
    hiddenRemarks: "Slightly noisy road-facing unit",
    imagesUpdatedAt: null,
    pendingVerification: false,
    lastVerifiedAt: null,
    lastVerifiedById: null,
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
    version: 1,
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

  it("never includes any Internal Property View field (Phase 4, Objective 3)", () => {
    const dto = toPublicCatalogueDTO(fakeCatalogue());
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("Sunrise Apartments"); // buildingName
    expect(serialized).not.toContain("301"); // flatNumber (also not a coincidental price/id match)
    expect(serialized).not.toContain("Gate 2"); // gateNumber
    expect(serialized).not.toContain("Ring the bell twice"); // entryInstructions
    expect(serialized).not.toContain("evening visits only"); // internalNotes
    expect(serialized).not.toContain("5% lower on rent"); // negotiationNotes
    expect(serialized).not.toContain("noisy road-facing"); // hiddenRemarks
    expect(serialized).not.toContain("With owner"); // keyAvailability
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

  it("excludes a soft-removed property (Phase 4 catalogue versioning) - the same link always shows the current version", () => {
    const base = fakeCatalogue();
    base.properties[0].removedAt = new Date("2026-08-01T00:00:00Z");
    const dto = toPublicCatalogueDTO(fakeCatalogue({ properties: base.properties }));
    expect(dto.properties).toEqual([]);
  });
});

describe("toPublicCatalogueDTO - location privacy", () => {
  it("hides coordinates entirely when publicLocationMode is LOCALITY_ONLY (the default)", () => {
    const dto = toPublicCatalogueDTO(fakeCatalogue());
    expect(dto.properties[0].latitude).toBeNull();
    expect(dto.properties[0].longitude).toBeNull();
    expect(dto.properties[0].locationDisclosure).toBe("HIDDEN");
  });

  it("hides coordinates entirely when publicLocationMode is HIDDEN, even with address visible", () => {
    const base = fakeCatalogue();
    base.properties[0].addressVisible = true;
    base.properties[0].property = property({ publicLocationMode: "HIDDEN" });
    const dto = toPublicCatalogueDTO(fakeCatalogue({ includeAddress: true, properties: base.properties }));
    expect(dto.properties[0].latitude).toBeNull();
    expect(dto.properties[0].locationDisclosure).toBe("HIDDEN");
  });

  it("reveals a fuzzed (reduced-precision) pin for APPROXIMATE mode, regardless of address visibility", () => {
    const base = fakeCatalogue();
    base.properties[0].property = property({ publicLocationMode: "APPROXIMATE", latitude: 28.612945, longitude: 77.229467 });
    const dto = toPublicCatalogueDTO(fakeCatalogue({ properties: base.properties }));
    expect(dto.properties[0].locationDisclosure).toBe("APPROXIMATE");
    expect(dto.properties[0].latitude).toBe(28.61);
    expect(dto.properties[0].longitude).toBe(77.23);
  });

  it("never reveals the exact coordinate for APPROXIMATE mode even if address visibility is on", () => {
    const base = fakeCatalogue();
    base.properties[0].addressVisible = true;
    base.properties[0].property = property({ publicLocationMode: "APPROXIMATE", latitude: 28.612945, longitude: 77.229467 });
    const dto = toPublicCatalogueDTO(fakeCatalogue({ includeAddress: true, properties: base.properties }));
    expect(dto.properties[0].latitude).not.toBe(28.612945);
  });

  it("reveals the exact coordinate for EXACT mode only when address visibility is also on", () => {
    const base = fakeCatalogue();
    base.properties[0].addressVisible = true;
    base.properties[0].property = property({ publicLocationMode: "EXACT", latitude: 28.612945, longitude: 77.229467 });
    const dto = toPublicCatalogueDTO(fakeCatalogue({ includeAddress: true, properties: base.properties }));
    expect(dto.properties[0].latitude).toBe(28.612945);
    expect(dto.properties[0].locationDisclosure).toBe("EXACT");
  });

  it("falls back to a fuzzed pin for EXACT mode when address visibility is off - never a silent full reveal", () => {
    const base = fakeCatalogue();
    base.properties[0].property = property({ publicLocationMode: "EXACT", latitude: 28.612945, longitude: 77.229467 });
    const dto = toPublicCatalogueDTO(fakeCatalogue({ properties: base.properties })); // addressVisible stays false
    expect(dto.properties[0].latitude).not.toBe(28.612945);
    expect(dto.properties[0].locationDisclosure).toBe("APPROXIMATE");
  });

  it("hides coordinates when the property has none geocoded, regardless of mode", () => {
    const base = fakeCatalogue();
    base.properties[0].property = property({ publicLocationMode: "EXACT", latitude: null, longitude: null });
    const dto = toPublicCatalogueDTO(fakeCatalogue({ properties: base.properties }));
    expect(dto.properties[0].latitude).toBeNull();
    expect(dto.properties[0].locationDisclosure).toBe("HIDDEN");
  });
});

describe("toExecutiveCatalogueDTO", () => {
  function directProperty() {
    return {
      ...property({ inventorySource: "DIRECT" }),
      owner: { id: "owner1", name: "Ramesh Gupta", phone: "+919111111111" },
      partner: null,
    };
  }

  function indirectProperty() {
    return {
      ...property({ inventorySource: "INDIRECT", ownerName: "", ownerPhone: "" }),
      owner: null,
      partner: { id: "partner1", name: "Sharma Dealers", phone: "+919222222222" },
    };
  }

  it("ignores priceVisible/addressVisible/brokerageVisible and includePrice/includeAddress/includeBrokerage entirely", () => {
    const base = fakeCatalogue({ includePrice: false, includeAddress: false, includeBrokerage: false });
    base.properties[0].priceVisible = false;
    base.properties[0].addressVisible = false;
    base.properties[0].property = directProperty();
    const dto = toExecutiveCatalogueDTO(fakeCatalogue({ ...base, properties: base.properties }));
    expect(dto.properties[0].price).not.toBeNull();
    expect(dto.properties[0].address).toBe("123 Main Street, Janakpuri");
  });

  it("exposes owner contact details for a DIRECT property", () => {
    const base = fakeCatalogue();
    base.properties[0].property = directProperty();
    const dto = toExecutiveCatalogueDTO(fakeCatalogue({ properties: base.properties }));
    expect(dto.properties[0].ownerName).toBe("Ramesh Gupta");
    expect(dto.properties[0].ownerPhone).toBe("+919111111111");
    expect(dto.properties[0].partnerName).toBeNull();
    expect(dto.properties[0].partnerPhone).toBeNull();
  });

  it("exposes inventory partner contact details for an INDIRECT property, never owner fields", () => {
    const base = fakeCatalogue();
    base.properties[0].property = indirectProperty();
    const dto = toExecutiveCatalogueDTO(fakeCatalogue({ properties: base.properties }));
    expect(dto.properties[0].partnerName).toBe("Sharma Dealers");
    expect(dto.properties[0].partnerPhone).toBe("+919222222222");
    expect(dto.properties[0].ownerName).toBeNull();
    expect(dto.properties[0].ownerPhone).toBeNull();
  });

  it("exposes Internal Property View fields (building, flat, gate, entry instructions, internal/negotiation notes, hidden remarks)", () => {
    const base = fakeCatalogue();
    base.properties[0].property = directProperty();
    const dto = toExecutiveCatalogueDTO(fakeCatalogue({ properties: base.properties }));
    expect(dto.properties[0].buildingName).toBe("Sunrise Apartments");
    expect(dto.properties[0].flatNumber).toBe("301");
    expect(dto.properties[0].gateNumber).toBe("Gate 2");
    expect(dto.properties[0].entryInstructions).toBe("Ring the bell twice");
    expect(dto.properties[0].internalNotes).toBe("Owner prefers evening visits only");
    expect(dto.properties[0].negotiationNotes).toBe("Can go 5% lower on rent");
    expect(dto.properties[0].hiddenRemarks).toBe("Slightly noisy road-facing unit");
  });

  it("exposes exact coordinates for navigation regardless of publicLocationMode", () => {
    const base = fakeCatalogue();
    base.properties[0].property = { ...directProperty(), publicLocationMode: "HIDDEN", latitude: 28.612945, longitude: 77.229467 };
    const dto = toExecutiveCatalogueDTO(fakeCatalogue({ properties: base.properties }));
    expect(dto.properties[0].latitude).toBe(28.612945);
    expect(dto.properties[0].longitude).toBe(77.229467);
  });

  it("excludes a soft-removed property, same as the public DTO", () => {
    const base = fakeCatalogue();
    base.properties[0].removedAt = new Date("2026-08-01T00:00:00Z");
    const dto = toExecutiveCatalogueDTO(fakeCatalogue({ properties: base.properties }));
    expect(dto.properties).toEqual([]);
  });

  it("carries through the per-property executive engagement status and note", () => {
    const base = fakeCatalogue();
    base.properties[0].executiveStatus = "CUSTOMER_LIKED";
    base.properties[0].executiveStatusNote = "Loved the balcony view";
    const dto = toExecutiveCatalogueDTO(fakeCatalogue({ properties: base.properties }));
    expect(dto.properties[0].executiveStatus).toBe("CUSTOMER_LIKED");
    expect(dto.properties[0].executiveStatusNote).toBe("Loved the balcony view");
  });
});
