import { describe, expect, it } from "vitest";
import { requirementMessage, sanitizeRequirement } from "./requirement-network";

describe("requirement broadcast privacy", () => {
  const lead = {
    requirementType: "RENT" as const, preferredLocation: "Rajouri Garden",
    minBudget: 30000, maxBudget: 45000, preferredBhk: 2,
    furnishingPref: "SEMI_FURNISHED" as const, moveInDate: new Date("2026-09-01T00:00:00.000Z"),
  };

  it("contains only requirement fields and no client identity", () => {
    const snapshot = sanitizeRequirement(lead);
    expect(Object.keys(snapshot).sort()).toEqual(["bhk", "budget", "furnishing", "locality", "moveInDate", "requirementType"]);
    expect(JSON.stringify(snapshot)).not.toMatch(/client|phone|email|notes|score/i);
  });

  it("renders a useful, sanitized partner message", () => {
    const message = requirementMessage(sanitizeRequirement(lead));
    expect(message).toContain("2 BHK");
    expect(message).toContain("Rajouri Garden");
    expect(message).toContain("₹30,000–₹45,000");
  });
});
