import { describe, expect, it } from "vitest";
import { shouldRematchProperty } from "./property-rematch";

const property = { status: "AVAILABLE", monthlyRent: 25000, salePrice: null, area: "Rajouri Garden", bhk: 2, propertyType: "APARTMENT", builtUpAreaSqft: 850, furnishing: "SEMI_FURNISHED", availableFrom: null };

describe("shouldRematchProperty", () => {
  it("rematches new available inventory and client-relevant changes", () => {
    expect(shouldRematchProperty(null, property)).toBe(true);
    expect(shouldRematchProperty(property, { ...property, monthlyRent: 26000 })).toBe(true);
    expect(shouldRematchProperty(property, { ...property, area: "Ramesh Nagar" })).toBe(true);
  });
  it("does not rematch a cosmetic/no-op update", () => expect(shouldRematchProperty(property, { ...property })).toBe(false));
});
