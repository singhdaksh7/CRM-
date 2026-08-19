import { describe, expect, it } from "vitest";
import { mapHousingLead, deriveHousingEventId } from "./adapter";
import { housingLeadPayloadSchema } from "./schema";

const basePayload = housingLeadPayloadSchema.parse({
  lead_date: 1692858120,
  apartment_names: "3 BHK",
  country_code: "+91",
  service_type: "new-projects",
  category_type: "residential",
  locality_name: "Khyora",
  city_name: "Kanpur",
  lead_name: "Manish",
  lead_email: "example@gmail.com",
  lead_phone: "9415516905",
  project_id: 265012,
  project_name: "The Peak",
  property_field: ["Apartment"],
  max_area: null,
  min_area: null,
  min_price: 8298450,
  max_price: 9315000,
});

describe("mapHousingLead", () => {
  it("maps a residential 3 BHK lead to the canonical shape", () => {
    const { canonical } = mapHousingLead(basePayload);
    expect(canonical.assetClass).toBe("RESIDENTIAL");
    expect(canonical.bhk).toBe(3);
    expect(canonical.transactionType).toBe("SALE");
    expect(canonical.minBudget).toBe(8298450);
    expect(canonical.maxBudget).toBe(9315000);
    expect(canonical.name).toBe("Manish");
    expect(canonical.email).toBe("example@gmail.com");
  });

  it("normalizes the phone the same way regardless of input format", () => {
    const digitsOnly = mapHousingLead(basePayload).canonical.phone;
    const withCountryPrefix = mapHousingLead({ ...basePayload, lead_phone: "919415516905" }).canonical.phone;
    const withPlus = mapHousingLead({ ...basePayload, lead_phone: "+919415516905" }).canonical.phone;
    expect(digitsOnly).toBe("919415516905");
    expect(withCountryPrefix).toBe(digitsOnly);
    expect(withPlus).toBe(digitsOnly);
  });

  it("preserves locality and city in the preferred location", () => {
    const { canonical } = mapHousingLead(basePayload);
    expect(canonical.locality).toContain("Khyora");
    expect(canonical.locality).toContain("Kanpur");
  });

  it("maps null areas to undefined rather than 0", () => {
    const { canonical } = mapHousingLead(basePayload);
    expect(canonical.minAreaSqft).toBeUndefined();
    expect(canonical.maxAreaSqft).toBeUndefined();
  });

  it("maps a non-null area range", () => {
    const { canonical } = mapHousingLead({ ...basePayload, min_area: 900, max_area: 1200 });
    expect(canonical.minAreaSqft).toBe(900);
    expect(canonical.maxAreaSqft).toBe(1200);
  });

  it("maps rent service types to RENT and flags nothing for review", () => {
    const { canonical, needsReview } = mapHousingLead({ ...basePayload, service_type: "rent-flatmates-pg" });
    expect(canonical.transactionType).toBe("RENT");
    expect(needsReview).toBe(false);
  });

  it("maps commercial category_type to COMMERCIAL and never sets a BHK", () => {
    const { canonical } = mapHousingLead({ ...basePayload, category_type: "commercial" });
    expect(canonical.assetClass).toBe("COMMERCIAL");
    expect(canonical.bhk).toBeUndefined();
  });

  it("does not guess a BHK from a non-deterministic apartment_names value, and flags it for review", () => {
    const { canonical, needsReview, reviewReasons } = mapHousingLead({ ...basePayload, apartment_names: "Studio / 1-2 BHK" });
    expect(canonical.bhk).toBeUndefined();
    expect(needsReview).toBe(true);
    expect(reviewReasons.join(" ")).toMatch(/apartment_names/);
  });

  it("defaults an unrecognized category_type to RESIDENTIAL but flags it for review instead of silently guessing", () => {
    const { canonical, needsReview, reviewReasons } = mapHousingLead({ ...basePayload, category_type: "mixed-use" });
    expect(canonical.assetClass).toBe("RESIDENTIAL");
    expect(needsReview).toBe(true);
    expect(reviewReasons.join(" ")).toMatch(/category_type/);
  });

  it("always preserves the raw project id/name and locality/city in the snapshot", () => {
    const { snapshot } = mapHousingLead(basePayload);
    expect(snapshot.projectId).toBe(265012);
    expect(snapshot.projectName).toBe("The Peak");
    expect(snapshot.localityName).toBe("Khyora");
    expect(snapshot.cityName).toBe("Kanpur");
  });

  it("never includes the raw provider payload itself in the snapshot", () => {
    const { snapshot } = mapHousingLead(basePayload);
    expect(JSON.stringify(snapshot)).not.toContain("lead_phone");
  });
});

describe("deriveHousingEventId", () => {
  it("is deterministic for an identical payload", () => {
    expect(deriveHousingEventId(basePayload)).toBe(deriveHousingEventId({ ...basePayload }));
  });

  it("changes when the stable identity fields change", () => {
    expect(deriveHousingEventId(basePayload)).not.toBe(deriveHousingEventId({ ...basePayload, lead_phone: "9876543210" }));
  });

  it("is insensitive to phone formatting differences that normalize to the same number", () => {
    expect(deriveHousingEventId(basePayload)).toBe(deriveHousingEventId({ ...basePayload, lead_phone: "+91 94155 16905" }));
  });
});
