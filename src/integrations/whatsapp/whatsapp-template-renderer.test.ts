import { describe, it, expect } from "vitest";
import { renderCatalogueMessage, type CatalogueTemplateProperty } from "./whatsapp-template-renderer";
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
    description: "desc",
    city: "Delhi",
    area: "Janakpuri",
    address: "123 Main Street, Janakpuri",
    landmark: null,
    latitude: null,
    longitude: null,
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
    amenities: "[]",
    images: "[]",
    coverImage: null,
    videoUrl: null,
    virtualTourUrl: null,
    floorPlanImage: null,
    ownerName: "Owner Name",
    ownerPhone: "+919999999999",
    ownerAlternatePhone: null,
    ownerNotes: null,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Property;
}

function entry(overrides: Partial<CatalogueTemplateProperty> = {}): CatalogueTemplateProperty {
  return {
    property: property(),
    priceVisible: true,
    addressVisible: false,
    brokerageVisible: false,
    ...overrides,
  };
}

describe("renderCatalogueMessage", () => {
  it("renders a complete message for a lead with full data", () => {
    const msg = renderCatalogueMessage({
      clientFirstName: "Rahul",
      requirementSummary: "a 2 BHK rental property in Janakpuri within ₹20,000–₹25,000",
      properties: [entry({ matchScore: 92 })],
      catalogueUrl: "https://example.com/share/catalogue/abc",
    });
    expect(msg).toContain("Hello Rahul,");
    expect(msg).toContain("Janakpuri");
    expect(msg).toContain("₹22,000/month");
    expect(msg).toContain("Match: 92%");
    expect(msg).toContain("https://example.com/share/catalogue/abc");
  });

  it("falls back to 'there' when the client's first name is missing", () => {
    const msg = renderCatalogueMessage({ clientFirstName: "", requirementSummary: "", properties: [], catalogueUrl: "https://x" });
    expect(msg).toContain("Hello there,");
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("null");
  });

  it("handles a missing requirement summary cleanly", () => {
    const msg = renderCatalogueMessage({ clientFirstName: "Priya", requirementSummary: "", properties: [], catalogueUrl: "https://x" });
    expect(msg).toContain("We shortlisted these options for you");
    expect(msg).not.toContain("undefined");
  });

  it("renders multiple properties in order with numbering", () => {
    const msg = renderCatalogueMessage({
      clientFirstName: "Amit",
      requirementSummary: "a rental",
      properties: [entry({ property: property({ title: "First Flat" }) }), entry({ property: property({ title: "Second Flat" }) })],
      catalogueUrl: "https://x",
    });
    expect(msg.indexOf("1. First Flat")).toBeLessThan(msg.indexOf("2. Second Flat"));
  });

  it("uses Indian currency formatting for both rent and sale", () => {
    const rentMsg = renderCatalogueMessage({ clientFirstName: "A", requirementSummary: "", properties: [entry({ property: property({ monthlyRent: 45000 }) })], catalogueUrl: "https://x" });
    expect(rentMsg).toContain("₹45,000/month");

    const saleMsg = renderCatalogueMessage({
      clientFirstName: "A",
      requirementSummary: "",
      properties: [entry({ property: property({ listingType: "SALE", salePrice: 12500000, monthlyRent: null }) })],
      catalogueUrl: "https://x",
    });
    expect(saleMsg).toContain("₹1.25 Cr");
  });

  it("omits the price line entirely when priceVisible is false", () => {
    const msg = renderCatalogueMessage({ clientFirstName: "A", requirementSummary: "", properties: [entry({ priceVisible: false })], catalogueUrl: "https://x" });
    expect(msg).not.toContain("₹22,000");
  });

  it("shows the area (not the exact address) when addressVisible is false", () => {
    const msg = renderCatalogueMessage({ clientFirstName: "A", requirementSummary: "", properties: [entry({ addressVisible: false })], catalogueUrl: "https://x" });
    expect(msg).toContain("Janakpuri");
    expect(msg).not.toContain("123 Main Street");
  });

  it("shows the exact address only when addressVisible is true", () => {
    const msg = renderCatalogueMessage({ clientFirstName: "A", requirementSummary: "", properties: [entry({ addressVisible: true })], catalogueUrl: "https://x" });
    expect(msg).toContain("123 Main Street, Janakpuri");
  });

  it("never renders 'undefined' when price is null", () => {
    const msg = renderCatalogueMessage({ clientFirstName: "A", requirementSummary: "", properties: [entry({ property: property({ monthlyRent: null }) })], catalogueUrl: "https://x" });
    expect(msg).toContain("Price on request");
    expect(msg).not.toContain("undefined");
  });
});
