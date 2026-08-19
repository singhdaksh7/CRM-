import { describe, it, expect } from "vitest";
import { buildRecommendationMessage, buildClickToChatLink, NEW_PROPERTY_MATCH_TEMPLATE_VARIABLES } from "./demand-whatsapp";

describe("buildRecommendationMessage (rule 25)", () => {
  it("includes the customer name, property spec, and public link", () => {
    const message = buildRecommendationMessage({
      customerName: "Rahul", propertyTypeLabel: "3 BHK", locality: "Rajouri Garden", priceLabel: "₹1 Cr", publicUrl: "https://example.com/p/prop1",
    });
    expect(message).toContain("Hi Rahul,");
    expect(message).toContain("3 BHK");
    expect(message).toContain("Rajouri Garden");
    expect(message).toContain("₹1 Cr");
    expect(message).toContain("https://example.com/p/prop1");
    expect(message).toContain("Reply if you'd like to arrange a visit.");
  });

  it("never embeds anything resembling a phone number or credential", () => {
    const message = buildRecommendationMessage({ customerName: "Test", propertyTypeLabel: "2 BHK", locality: "X", priceLabel: "₹1", publicUrl: "https://x/p/1" });
    expect(message).not.toMatch(/\+91\d{10}/);
    expect(message).not.toMatch(/api[_-]?key|token|secret/i);
  });
});

describe("buildClickToChatLink - zero network call, zero auto-send (rule 26/27)", () => {
  it("builds a wa.me URL for a valid Indian mobile number, never calling any network API", () => {
    const link = buildClickToChatLink("9876543210", "Hello");
    expect(link).toBe("https://wa.me/919876543210?text=Hello");
  });
  it("returns null (never throws, never guesses) for an invalid phone", () => {
    expect(buildClickToChatLink("123", "Hello")).toBeNull();
  });
  it("URL-encodes the message body", () => {
    const link = buildClickToChatLink("9876543210", "Hi there! Special chars: & = ?");
    expect(link).not.toBeNull();
    expect(link).toContain(encodeURIComponent("Hi there! Special chars: & = ?"));
  });
});

describe("NEW_PROPERTY_MATCH_TEMPLATE_VARIABLES (rule 29)", () => {
  it("declares exactly the 5 variables in the order a Meta template would expect", () => {
    expect(NEW_PROPERTY_MATCH_TEMPLATE_VARIABLES).toEqual(["customerName", "propertyTypeLabel", "locality", "priceLabel", "publicUrl"]);
  });
});
