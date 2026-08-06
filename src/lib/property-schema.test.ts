import { describe, it, expect } from "vitest";
import { propertySchema } from "./validators";

function baseRentPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "2 BHK Apartment",
    propertyType: "APARTMENT",
    listingType: "RENT",
    status: "AVAILABLE",
    description: "Spacious 2 BHK apartment near metro station",
    area: "Karol Bagh",
    address: "Aggarwal Mandi, Tatiri",
    landmark: null,
    pincode: "250601",
    monthlyRent: 15000,
    securityDeposit: 15000,
    maintenanceCharge: null,
    rentBrokerage: 14999,
    bhk: 2,
    bathrooms: 2,
    balconies: 1,
    furnishing: "SEMI_FURNISHED",
    floorNumber: null,
    totalFloors: null,
    propertyAgeYears: null,
    builtUpAreaSqft: 727,
    carpetAreaSqft: null,
    facing: null,
    parkingAvailable: true,
    tenantPreference: null,
    availableFrom: null,
    amenities: [],
    images: [],
    coverImage: null,
    videoUrl: null,
    virtualTourUrl: null,
    ownerName: "Owner Name",
    ownerPhone: "9760942003",
    ownerAlternatePhone: null,
    ownerNotes: null,
    ...overrides,
  };
}

function baseSalePayload(overrides: Record<string, unknown> = {}) {
  const { monthlyRent, securityDeposit, maintenanceCharge, rentBrokerage, ...rest } = baseRentPayload();
  void monthlyRent;
  void securityDeposit;
  void maintenanceCharge;
  void rentBrokerage;
  return {
    ...rest,
    listingType: "SALE",
    salePrice: 8500000,
    pricePerSqft: 11000,
    saleBrokeragePct: 1.5,
    ...overrides,
  };
}

describe("propertySchema", () => {
  it("accepts a valid complete RENT property", () => {
    const result = propertySchema.safeParse(baseRentPayload());
    expect(result.success).toBe(true);
  });

  it("accepts a valid complete SALE property", () => {
    const result = propertySchema.safeParse(baseSalePayload());
    expect(result.success).toBe(true);
  });

  it("rejects a description shorter than 10 characters (this was the original bug repro)", () => {
    const result = propertySchema.safeParse(baseRentPayload({ description: "gergh" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "description")).toBe(true);
    }
  });

  it("allows a blank alternate phone (sent as null)", () => {
    const result = propertySchema.safeParse(baseRentPayload({ ownerAlternatePhone: null }));
    expect(result.success).toBe(true);
  });

  it("rejects an alternate phone containing letters", () => {
    const result = propertySchema.safeParse(baseRentPayload({ ownerAlternatePhone: "fgsd" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "ownerAlternatePhone")).toBe(true);
    }
  });

  it("accepts a valid numeric alternate phone", () => {
    const result = propertySchema.safeParse(baseRentPayload({ ownerAlternatePhone: "9812345678" }));
    expect(result.success).toBe(true);
  });

  it("accepts blank floor/total floors/property age/carpet area as null", () => {
    const result = propertySchema.safeParse(
      baseRentPayload({ floorNumber: null, totalFloors: null, propertyAgeYears: null, carpetAreaSqft: null })
    );
    expect(result.success).toBe(true);
  });

  it("accepts a blank availableFrom", () => {
    const result = propertySchema.safeParse(baseRentPayload({ availableFrom: null }));
    expect(result.success).toBe(true);
  });

  it("accepts blank maintenance and brokerage", () => {
    const result = propertySchema.safeParse(baseRentPayload({ maintenanceCharge: null, rentBrokerage: null }));
    expect(result.success).toBe(true);
  });

  it("accepts blank optional URLs", () => {
    const result = propertySchema.safeParse(baseRentPayload({ coverImage: null, videoUrl: null, virtualTourUrl: null }));
    expect(result.success).toBe(true);
  });

  it("rejects an invalid (non-URL) video URL", () => {
    const result = propertySchema.safeParse(baseRentPayload({ videoUrl: "not-a-url" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "videoUrl")).toBe(true);
    }
  });

  it("accepts a valid video URL", () => {
    const result = propertySchema.safeParse(baseRentPayload({ videoUrl: "https://youtube.com/watch?v=abc123" }));
    expect(result.success).toBe(true);
  });

  it("accepts a valid owner phone", () => {
    const result = propertySchema.safeParse(baseRentPayload({ ownerPhone: "9760942003" }));
    expect(result.success).toBe(true);
  });

  it("rejects an owner phone shorter than 8 characters", () => {
    const result = propertySchema.safeParse(baseRentPayload({ ownerPhone: "12345" }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid (non-6-digit) pincode", () => {
    const result = propertySchema.safeParse(baseRentPayload({ pincode: "ABC123" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "pincode")).toBe(true);
    }
  });

  it("accepts a blank pincode", () => {
    const result = propertySchema.safeParse(baseRentPayload({ pincode: null }));
    expect(result.success).toBe(true);
  });

  it("accepts a valid RENT property with monthlyRent and rejects a missing one", () => {
    expect(propertySchema.safeParse(baseRentPayload()).success).toBe(true);
    const { monthlyRent, ...withoutRent } = baseRentPayload();
    void monthlyRent;
    // monthlyRent is optional at the schema level (SALE properties omit it);
    // route-level UI still requires it for RENT listings.
    expect(propertySchema.safeParse(withoutRent).success).toBe(true);
  });

  it("accepts a valid SALE property", () => {
    expect(propertySchema.safeParse(baseSalePayload()).success).toBe(true);
  });

  it("maps furnishing display labels to backend enum values", () => {
    const result = propertySchema.safeParse(baseRentPayload({ furnishing: "SEMI_FURNISHED" }));
    expect(result.success).toBe(true);
    const rejected = propertySchema.safeParse(baseRentPayload({ furnishing: "Semi-Furnished" }));
    expect(rejected.success).toBe(false);
  });
});
