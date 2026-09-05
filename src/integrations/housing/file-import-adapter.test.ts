import { describe, expect, it } from "vitest";
import { deriveHousingFileEventId, normalizeHousingFileRow, parseHousingLeadDate, type HousingFileRow } from "./file-import-adapter";

const baseRow: HousingFileRow = {
  "Service Type": "resale",
  "Property Type": "residential",
  "Lead Date": "2026-08-15",
  "Lead Name": "Ramesh Kumar",
  "Lead Phone Number": "+91 98765-43210",
  "Lead Email": "Ramesh.Kumar@Example.com",
  "Seller Id": "SELLER-1",
  "Seller Name": "ABC Realty",
  Locality: "Janakpuri",
  City: "Delhi",
  Configuration: "3 BHK",
  Price: "85 lakh",
  "Building/Project Name": "Green Residency",
  "Property/Project ID": "PROJ-9001",
  Address: "House 12, Sector 5, Janakpuri, New Delhi",
  primary_lead_status: "Fresh",
  secondary_lead_status: "Contacted",
  Notes: "Client wants a 3 BHK with parking",
};

describe("normalizeHousingFileRow", () => {
  it("maps a fully valid row to a canonical lead with no review needed", () => {
    const result = normalizeHousingFileRow(baseRow);
    expect(result.errors).toEqual([]);
    expect(result.needsReview).toBe(false);
    expect(result.canonical).toBeDefined();
    expect(result.canonical!.name).toBe("Ramesh Kumar");
    expect(result.canonical!.phone).toBe("919876543210");
    expect(result.canonical!.email).toBe("ramesh.kumar@example.com");
    expect(result.canonical!.assetClass).toBe("RESIDENTIAL");
    expect(result.canonical!.transactionType).toBe("SALE");
    expect(result.canonical!.bhk).toBe(3);
    expect(result.canonical!.minBudget).toBe(8_500_000);
    expect(result.canonical!.maxBudget).toBe(8_500_000);
  });

  it("never includes Address in the staff-facing snapshot", () => {
    const result = normalizeHousingFileRow(baseRow);
    expect(JSON.stringify(result.snapshot)).not.toContain("Sector 5");
    expect(result.snapshot).not.toHaveProperty("address");
  });

  it("preserves Notes with provenance handled by the caller, not lost", () => {
    const result = normalizeHousingFileRow(baseRow);
    expect(result.notes).toBe("Client wants a 3 BHK with parking");
  });

  it("preserves Housing Property/Project ID, Seller Id/Name, and primary/secondary status as metadata only", () => {
    const result = normalizeHousingFileRow(baseRow);
    expect(result.snapshot.projectId).toBe("PROJ-9001");
    expect(result.snapshot.sellerId).toBe("SELLER-1");
    expect(result.snapshot.sellerName).toBe("ABC Realty");
    expect(result.snapshot.primaryStatusRaw).toBe("Fresh");
    expect(result.snapshot.secondaryStatusRaw).toBe("Contacted");
  });

  describe("phone normalization", () => {
    const variants = ["9876543210", "+919876543210", "919876543210", "09876543210", "98765 43210", "98765-43210"];
    for (const phone of variants) {
      it(`accepts "${phone}"`, () => {
        const result = normalizeHousingFileRow({ ...baseRow, "Lead Phone Number": phone });
        expect(result.errors).toEqual([]);
        expect(result.canonical!.phone).toBe("919876543210");
      });
    }

    it("rejects an implausible phone number", () => {
      const result = normalizeHousingFileRow({ ...baseRow, "Lead Phone Number": "12345" });
      expect(result.errors.some((e) => e.includes("Lead Phone Number"))).toBe(true);
      expect(result.canonical).toBeUndefined();
    });

    it("requires a phone number at all", () => {
      const result = normalizeHousingFileRow({ ...baseRow, "Lead Phone Number": "" });
      expect(result.errors).toContain("Lead Phone Number is required");
    });
  });

  describe("required fields", () => {
    it("requires Lead Name", () => {
      const result = normalizeHousingFileRow({ ...baseRow, "Lead Name": "" });
      expect(result.errors).toContain("Lead Name is required");
    });

    it("requires a non-empty Locality and never fabricates one", () => {
      const result = normalizeHousingFileRow({ ...baseRow, Locality: "" });
      expect(result.errors).toContain("Locality is required");
    });
  });

  describe("email", () => {
    it("is nullable", () => {
      const result = normalizeHousingFileRow({ ...baseRow, "Lead Email": "" });
      expect(result.errors).toEqual([]);
      expect(result.canonical!.email).toBeUndefined();
    });

    it("lowercases and trims a valid email", () => {
      const result = normalizeHousingFileRow({ ...baseRow, "Lead Email": "  Foo@BAR.com " });
      expect(result.canonical!.email).toBe("foo@bar.com");
    });

    it("drops (does not guess) an invalid email and flags for review", () => {
      const result = normalizeHousingFileRow({ ...baseRow, "Lead Email": "not-an-email" });
      expect(result.canonical!.email).toBeUndefined();
      expect(result.needsReview).toBe(true);
    });
  });

  describe("price", () => {
    it("parses lakh/crore suffixes", () => {
      expect(normalizeHousingFileRow({ ...baseRow, Price: "1.2 cr" }).canonical!.minBudget).toBe(12_000_000);
      expect(normalizeHousingFileRow({ ...baseRow, Price: "50k" }).canonical!.minBudget).toBe(50_000);
    });

    it("flags an unparseable price for review but still imports the row", () => {
      const result = normalizeHousingFileRow({ ...baseRow, Price: "call for price" });
      expect(result.errors).toEqual([]);
      expect(result.needsReview).toBe(true);
      expect(result.canonical!.minBudget).toBe(0);
    });
  });

  describe("configuration / BHK", () => {
    it("parses documented BHK shapes", () => {
      expect(normalizeHousingFileRow({ ...baseRow, Configuration: "2BHK" }).canonical!.bhk).toBe(2);
      expect(normalizeHousingFileRow({ ...baseRow, Configuration: "2 bhk" }).canonical!.bhk).toBe(2);
    });

    it("preserves an unknown configuration and flags for review instead of discarding it", () => {
      const result = normalizeHousingFileRow({ ...baseRow, Configuration: "Studio" });
      expect(result.errors).toEqual([]);
      expect(result.needsReview).toBe(true);
      expect(result.canonical!.bhk).toBeUndefined();
      expect(result.snapshot.configurationRaw).toBe("Studio");
    });
  });

  describe("unknown Property Type", () => {
    it("defaults to RESIDENTIAL, flags for review, and preserves the raw value", () => {
      const result = normalizeHousingFileRow({ ...baseRow, "Property Type": "Farmhouse" });
      expect(result.canonical!.assetClass).toBe("RESIDENTIAL");
      expect(result.needsReview).toBe(true);
      expect(result.snapshot.propertyTypeRaw).toBe("Farmhouse");
    });
  });

  describe("notes", () => {
    it("handles empty notes", () => {
      expect(normalizeHousingFileRow({ ...baseRow, Notes: "" }).notes).toBeNull();
    });

    it("handles very long notes without throwing", () => {
      const long = "x".repeat(10_000);
      const result = normalizeHousingFileRow({ ...baseRow, Notes: long });
      expect(result.notes).toBe(long);
    });
  });
});

describe("parseHousingLeadDate", () => {
  it("parses ISO dates", () => {
    expect(parseHousingLeadDate("2026-08-15").ambiguous).toBe(false);
  });

  it("parses the documented dd/mm/yyyy Housing export convention", () => {
    const result = parseHousingLeadDate("31/01/2026");
    expect(result.ambiguous).toBe(false);
    expect(result.iso).toContain("2026-01-31");
  });

  it("never silently misinterprets a genuinely ambiguous/invalid date - flags it instead", () => {
    expect(parseHousingLeadDate("not a date").ambiguous).toBe(true);
    expect(parseHousingLeadDate("13/13/2026").ambiguous).toBe(true);
  });
});

describe("deriveHousingFileEventId (dedup key)", () => {
  it("is identical for the exact same row parsed twice (same file uploaded twice)", () => {
    const a = deriveHousingFileEventId(baseRow);
    const b = deriveHousingFileEventId({ ...baseRow });
    expect(a).toBe(b);
  });

  it("differs when the same phone enquires about a different property (must not be treated as one lead identity)", () => {
    const a = deriveHousingFileEventId(baseRow);
    const b = deriveHousingFileEventId({ ...baseRow, "Property/Project ID": "PROJ-9002" });
    expect(a).not.toBe(b);
  });

  it("differs when the same phone enquires on a different date", () => {
    const a = deriveHousingFileEventId(baseRow);
    const b = deriveHousingFileEventId({ ...baseRow, "Lead Date": "2026-09-01" });
    expect(a).not.toBe(b);
  });

  it("never uses Property/Project ID alone (two different phones, same property, produce different ids)", () => {
    const a = deriveHousingFileEventId(baseRow);
    const b = deriveHousingFileEventId({ ...baseRow, "Lead Phone Number": "9999999999" });
    expect(a).not.toBe(b);
  });
});
