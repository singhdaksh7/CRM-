import { describe, it, expect } from "vitest";
import { renderCatalogueMessage, buildRequirementSummary, type CatalogueTemplateProperty, type CatalogueTemplateLead } from "./whatsapp-template-renderer";
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

function lead(overrides: Partial<CatalogueTemplateLead> = {}): CatalogueTemplateLead {
  return {
    clientName: "Rahul Sharma",
    requirementType: "RENT",
    preferredBhk: 2,
    preferredLocation: "Ramesh Nagar",
    minBudget: 20000,
    maxBudget: 25000,
    ...overrides,
  };
}

function fiveMatchingProperties(): CatalogueTemplateProperty[] {
  return Array.from({ length: 5 }, () => entry());
}

describe("renderCatalogueMessage", () => {
  it("renders the exact approved message format for a fully-populated lead", () => {
    const msg = renderCatalogueMessage({
      lead: lead(),
      properties: fiveMatchingProperties(),
      catalogueUrl: "https://example.com/share/catalogue/abc",
      employeeName: "Priya",
      brokerageName: "Delhi Broker CRM",
    });

    expect(msg).toBe(
      [
        "Hello Rahul Ji 👋",
        "",
        "As discussed, we have shortlisted 5 suitable 2 BHK rental properties for you in and around Ramesh Nagar.",
        "",
        "💰 Budget range: ₹20,000–₹25,000",
        "📍 Preferred area: Ramesh Nagar",
        "🏠 Property type: 2 BHK Flat",
        "",
        "You can view the complete options with photos and details here:",
        "",
        "https://example.com/share/catalogue/abc",
        "",
        "Please select the properties you like, and we will arrange a site visit for you.",
        "",
        "Regards,",
        "Priya",
        "Delhi Broker CRM",
      ].join("\n")
    );
  });

  it("uses only the first token of the client's name, title-cased as-is, with the Ji honorific", () => {
    const msg = renderCatalogueMessage({ lead: lead({ clientName: "rahul sharma" }), properties: [], catalogueUrl: "https://x" });
    expect(msg.startsWith("Hello rahul Ji 👋")).toBe(true);
  });

  it("falls back to a generic greeting when the client's name is missing", () => {
    const msg = renderCatalogueMessage({ lead: lead({ clientName: "" }), properties: [], catalogueUrl: "https://x" });
    expect(msg).toContain("Hello there 👋");
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("null");
  });

  it("omits the BHK clause gracefully when preferredBhk is not set", () => {
    const msg = renderCatalogueMessage({ lead: lead({ preferredBhk: null }), properties: fiveMatchingProperties(), catalogueUrl: "https://x" });
    expect(msg).toContain("we have shortlisted 5 suitable rental properties for you in and around Ramesh Nagar.");
    expect(msg).not.toContain("null BHK");
    expect(msg).not.toContain("undefined");
  });

  it("still shows a Property type line with just the type when BHK is unset", () => {
    const msg = renderCatalogueMessage({ lead: lead({ preferredBhk: null }), properties: fiveMatchingProperties(), catalogueUrl: "https://x" });
    expect(msg).toContain("🏠 Property type: Flat");
  });

  it("still shows a Property type line with just the BHK when no properties are shortlisted yet", () => {
    const msg = renderCatalogueMessage({ lead: lead(), properties: [], catalogueUrl: "https://x" });
    expect(msg).toContain("🏠 Property type: 2 BHK");
  });

  it("omits the Property type line entirely when neither BHK nor a property type is known", () => {
    const msg = renderCatalogueMessage({ lead: lead({ preferredBhk: null }), properties: [], catalogueUrl: "https://x" });
    expect(msg).not.toContain("Property type");
  });

  it("uses the singular 'property' noun when exactly one is shortlisted", () => {
    const msg = renderCatalogueMessage({ lead: lead(), properties: [entry()], catalogueUrl: "https://x" });
    expect(msg).toContain("we have shortlisted 1 suitable 2 BHK rental property for you");
  });

  it("labels the sale kind correctly for SALE requirements", () => {
    const msg = renderCatalogueMessage({ lead: lead({ requirementType: "SALE" }), properties: fiveMatchingProperties(), catalogueUrl: "https://x" });
    expect(msg).toContain("suitable 2 BHK sale properties");
  });

  it("uses Indian currency formatting (non-compact) for the budget range", () => {
    const msg = renderCatalogueMessage({ lead: lead({ minBudget: 45000, maxBudget: 60000 }), properties: [], catalogueUrl: "https://x" });
    expect(msg).toContain("💰 Budget range: ₹45,000–₹60,000");
  });

  it("falls back to default employee/brokerage names when not provided", () => {
    const msg = renderCatalogueMessage({ lead: lead(), properties: [], catalogueUrl: "https://x" });
    expect(msg).toContain("Regards,\nOur Team\nKP Properties");
  });

  it("uses the provided employee and brokerage names in the sign-off", () => {
    const msg = renderCatalogueMessage({ lead: lead(), properties: [], catalogueUrl: "https://x", employeeName: "Amit Kumar", brokerageName: "Sharma Estates" });
    expect(msg).toContain("Regards,\nAmit Kumar\nSharma Estates");
  });

  it("puts the catalogue URL on its own line, framed by blank lines", () => {
    const msg = renderCatalogueMessage({ lead: lead(), properties: [], catalogueUrl: "https://example.com/share/catalogue/xyz" });
    expect(msg).toContain("here:\n\nhttps://example.com/share/catalogue/xyz\n\nPlease select");
  });

  it("never renders 'undefined' or 'null' anywhere in a minimal message", () => {
    const msg = renderCatalogueMessage({ lead: lead({ clientName: "", preferredBhk: null, preferredLocation: "" }), properties: [], catalogueUrl: "https://x" });
    expect(msg).not.toContain("undefined");
    expect(msg).not.toContain("null");
  });
});

describe("buildRequirementSummary", () => {
  it("builds a short 'N BHK kind type' phrase", () => {
    expect(buildRequirementSummary(lead(), fiveMatchingProperties())).toBe("2 BHK rental flat");
  });

  it("omits the BHK clause when unset", () => {
    expect(buildRequirementSummary(lead({ preferredBhk: null }), fiveMatchingProperties())).toBe("rental flat");
  });

  it("omits the type when there are no properties to derive it from", () => {
    expect(buildRequirementSummary(lead(), [])).toBe("2 BHK rental");
  });

  it("uses 'sale' for SALE requirements", () => {
    expect(buildRequirementSummary(lead({ requirementType: "SALE" }), fiveMatchingProperties())).toBe("2 BHK sale flat");
  });
});
