import { describe, expect, it } from "vitest";
import { housingLeadPayloadSchema } from "./schema";

const validPayload = {
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
};

describe("housingLeadPayloadSchema", () => {
  it("accepts the documented valid residential lead payload", () => {
    const result = housingLeadPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts a null email", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, lead_email: null });
    expect(result.success).toBe(true);
  });

  it("accepts null min_area/max_area", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, min_area: null, max_area: null });
    expect(result.success).toBe(true);
  });

  it("accepts a price range and non-null areas", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, min_area: 900, max_area: 1200 });
    expect(result.success).toBe(true);
  });

  it.each([
    "lead_date", "apartment_names", "country_code", "service_type", "category_type",
    "locality_name", "city_name", "lead_name", "lead_phone", "project_id", "project_name",
    "property_field", "min_price", "max_price",
  ])("rejects a payload missing required field %s", (field) => {
    const payload = { ...validPayload } as Record<string, unknown>;
    delete payload[field];
    const result = housingLeadPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("rejects an implausible/invalid phone number", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, lead_phone: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects a phone that doesn't start 6-9 for country_code +91", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, lead_phone: "1234567890" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric epoch timestamp", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, lead_date: "not-a-number" });
    expect(result.success).toBe(false);
  });

  it("rejects an implausibly old epoch timestamp", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, lead_date: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a lead_date far in the future", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, lead_date: Math.floor(Date.now() / 1000) + 86400 * 30 });
    expect(result.success).toBe(false);
  });

  it("rejects a negative price", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, min_price: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects max_price less than min_price", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, min_price: 100, max_price: 50 });
    expect(result.success).toBe(false);
  });

  it("rejects max_area less than min_area", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, min_area: 1000, max_area: 500 });
    expect(result.success).toBe(false);
  });

  it("rejects property_field that isn't an array of strings", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, property_field: "Apartment" });
    expect(result.success).toBe(false);
  });

  it("ignores unrecognized extra keys rather than rejecting the whole payload", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, some_future_field: "x" });
    expect(result.success).toBe(true);
  });

  it("accepts project_id sent as a string", () => {
    const result = housingLeadPayloadSchema.safeParse({ ...validPayload, project_id: "265012" });
    expect(result.success).toBe(true);
  });
});
