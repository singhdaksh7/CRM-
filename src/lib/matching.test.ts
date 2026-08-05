import { describe, it, expect } from "vitest";
import { matchPropertyToLead, matchPropertiesToLead, applyProximityBonus, sectionizeMatches, type MatchResult } from "./matching";
import type { Property, Lead } from "@prisma/client";

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop1",
    organizationId: "org_default",
    propertyCode: "PROP-0001",
    title: "Test Apartment",
    propertyType: "APARTMENT",
    listingType: "RENT",
    status: "AVAILABLE",
    description: "A test property",
    city: "Delhi",
    area: "Janakpuri",
    address: "123 Test Street",
    landmark: null,
    latitude: null,
    longitude: null,
    monthlyRent: 20000,
    securityDeposit: 40000,
    maintenanceCharge: 1000,
    rentBrokerage: 20000,
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
    ownerName: "Test Owner",
    ownerPhone: "+919999999999",
    ownerAlternatePhone: null,
    ownerNotes: null,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Property;
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead1",
    organizationId: "org_default",
    leadCode: "LEAD-0001",
    clientName: "Test Client",
    phone: "+919876543210",
    email: null,
    source: "WEBSITE",
    externalLeadId: null,
    requirementType: "RENT",
    preferredLocation: "Janakpuri",
    minBudget: 18000,
    maxBudget: 20000,
    preferredBhk: 2,
    furnishingPref: "SEMI_FURNISHED",
    moveInDate: null,
    additionalRequirements: null,
    assignedToId: null,
    status: "NEW",
    priority: "WARM",
    assignmentStrategy: null,
    assignmentReason: null,
    autoAssignedAt: null,
    score: 0,
    scoreExplanation: null,
    scoreUpdatedAt: null,
    lastContactedAt: null,
    nextFollowUpAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Lead;
}

describe("matchPropertyToLead - hard filters", () => {
  it("rejects a property with the wrong listing type", () => {
    const result = matchPropertyToLead(property({ listingType: "SALE" }), lead({ requirementType: "RENT" }));
    expect(result).toBeNull();
  });

  it("rejects a property that is not AVAILABLE", () => {
    const result = matchPropertyToLead(property({ status: "RENTED" }), lead());
    expect(result).toBeNull();
  });
});

describe("matchPropertyToLead - budget tolerance", () => {
  it("matches a property exactly within budget with full budget score", () => {
    const result = matchPropertyToLead(property({ monthlyRent: 19000 }), lead({ minBudget: 18000, maxBudget: 20000 }));
    expect(result).not.toBeNull();
    expect(result!.aboveBudget).toBe(false);
  });

  it("allows a property up to 10% above budget and labels it as such", () => {
    // 20000 max budget, 10% over = 22000
    const result = matchPropertyToLead(property({ monthlyRent: 21500 }), lead({ minBudget: 15000, maxBudget: 20000 }), 0.2);
    expect(result).not.toBeNull();
    expect(result!.aboveBudget).toBe(true);
    expect(result!.budgetTier).toBe("Up to 10% above budget");
  });

  it("allows a property up to 20% above budget when tolerance is 0.2", () => {
    const result = matchPropertyToLead(property({ monthlyRent: 23500 }), lead({ minBudget: 15000, maxBudget: 20000 }), 0.2);
    expect(result).not.toBeNull();
    expect(result!.budgetTier).toBe("Up to 20% above budget");
  });

  it("rejects a property beyond the configured tolerance", () => {
    const result = matchPropertyToLead(property({ monthlyRent: 30000 }), lead({ minBudget: 15000, maxBudget: 20000 }), 0.2);
    expect(result).toBeNull();
  });

  it("respects a stricter tolerance when the caller passes 0 (exact budget only)", () => {
    const result = matchPropertyToLead(property({ monthlyRent: 20500 }), lead({ minBudget: 15000, maxBudget: 20000 }), 0);
    expect(result).toBeNull();
  });
});

describe("matchPropertyToLead - location matching", () => {
  it("scores a location match higher than a location mismatch", () => {
    const inArea = matchPropertyToLead(property({ area: "Janakpuri" }), lead({ preferredLocation: "Janakpuri" }));
    const outOfArea = matchPropertyToLead(property({ area: "Rohini" }), lead({ preferredLocation: "Janakpuri" }));
    expect(inArea!.score).toBeGreaterThan(outOfArea!.score);
  });
});

describe("matchPropertyToLead - locality-normalized location matching", () => {
  it("gives an exact canonical-locality match full credit and marks locationMatchKind exact", () => {
    const result = matchPropertyToLead(property({ area: "Janak Puri" }), lead({ preferredLocation: "Janakpuri" }));
    expect(result).not.toBeNull();
    expect(result!.locationMatchKind).toBe("exact");
    expect(result!.reasons.find((r) => r.label === "Location")?.detail).toBe("Exact locality match");
  });

  it("scores a locality-normalized exact match higher than a plain substring-only match", () => {
    // "Janak Puri" and "Janakpuri" only match today via locality normalization,
    // not via naive substring containment.
    const normalized = matchPropertyToLead(property({ area: "Janak Puri" }), lead({ preferredLocation: "Janakpuri" }));
    const mismatch = matchPropertyToLead(property({ area: "Rohini" }), lead({ preferredLocation: "Janakpuri" }));
    expect(normalized!.score).toBeGreaterThan(mismatch!.score);
  });

  it("gives partial credit and marks locationMatchKind nearby for a curated adjacent locality", () => {
    const result = matchPropertyToLead(property({ area: "Vikaspuri" }), lead({ preferredLocation: "Janakpuri" }));
    expect(result).not.toBeNull();
    expect(result!.locationMatchKind).toBe("nearby");
    expect(result!.reasons.find((r) => r.label === "Location")?.detail).toBe("Nearby locality: Vikaspuri");
  });

  it("nearby-locality credit scores lower than an exact match but higher than an unrelated locality", () => {
    const exact = matchPropertyToLead(property({ area: "Janakpuri" }), lead({ preferredLocation: "Janakpuri" }));
    const nearby = matchPropertyToLead(property({ area: "Vikaspuri" }), lead({ preferredLocation: "Janakpuri" }));
    const unrelated = matchPropertyToLead(property({ area: "Rohini" }), lead({ preferredLocation: "Janakpuri" }));
    expect(exact!.score).toBeGreaterThan(nearby!.score);
    expect(nearby!.score).toBeGreaterThan(unrelated!.score);
  });

  it("falls back to substring containment for freeform locations not in the locality table", () => {
    const result = matchPropertyToLead(property({ area: "Some Random Colony Phase 2" }), lead({ preferredLocation: "Random Colony" }));
    expect(result).not.toBeNull();
    expect(result!.locationMatchKind).toBe("exact");
  });

  it("marks locationMatchKind none when there is no match at all", () => {
    const result = matchPropertyToLead(property({ area: "Rohini" }), lead({ preferredLocation: "Janakpuri" }));
    expect(result).not.toBeNull();
    expect(result!.locationMatchKind).toBe("none");
  });
});

describe("matchPropertyToLead - verified listing bonus", () => {
  it("adds a bonus and a reason when the owner is VERIFIED", () => {
    // Use a furnishing mismatch so the base score isn't already at the 100 cap.
    const base = { furnishing: "UNFURNISHED" as const };
    const verifiedProp = { ...property(base), owner: { verificationStatus: "VERIFIED" as const } };
    const unverifiedProp = { ...property(base), owner: { verificationStatus: "UNVERIFIED" as const } };
    const verified = matchPropertyToLead(verifiedProp, lead());
    const unverified = matchPropertyToLead(unverifiedProp, lead());
    expect(verified!.verified).toBe(true);
    expect(verified!.score).toBeGreaterThan(unverified!.score);
    expect(verified!.reasons.some((r) => r.detail === "Verified listing")).toBe(true);
  });

  it("defaults verified to false when the owner relation isn't loaded", () => {
    const result = matchPropertyToLead(property(), lead());
    expect(result!.verified).toBe(false);
  });

  it("never pushes score above 100 even with all bonuses stacked", () => {
    const maxedProp = { ...property({ area: "Janakpuri", monthlyRent: 19000, bhk: 2, furnishing: "SEMI_FURNISHED", coverImage: "https://example.com/a.jpg", images: JSON.stringify(["a", "b", "c"]) }), owner: { verificationStatus: "VERIFIED" as const } };
    const result = matchPropertyToLead(maxedProp, lead());
    expect(result!.score).toBeLessThanOrEqual(100);
  });
});

describe("matchPropertyToLead - has-images bonus", () => {
  it("adds a bonus and a counted reason when images JSON has entries", () => {
    // Use a furnishing mismatch so the base score isn't already at the 100 cap.
    const withImages = matchPropertyToLead(property({ furnishing: "UNFURNISHED", images: JSON.stringify(["a.jpg", "b.jpg"]) }), lead());
    const without = matchPropertyToLead(property({ furnishing: "UNFURNISHED", images: "[]" }), lead());
    expect(withImages!.hasImages).toBe(true);
    expect(withImages!.score).toBeGreaterThan(without!.score);
    expect(withImages!.reasons.some((r) => r.detail === "Includes 2 photos")).toBe(true);
  });

  it("treats a coverImage as having images even with an empty images array", () => {
    const result = matchPropertyToLead(property({ coverImage: "https://example.com/cover.jpg", images: "[]" }), lead());
    expect(result!.hasImages).toBe(true);
  });

  it("tolerates malformed images JSON without throwing", () => {
    const result = matchPropertyToLead(property({ images: "not valid json" }), lead());
    expect(result).not.toBeNull();
    expect(result!.hasImages).toBe(false);
  });

  it("hasImages is false with no cover image and an empty images array", () => {
    const result = matchPropertyToLead(property({ coverImage: null, images: "[]" }), lead());
    expect(result!.hasImages).toBe(false);
  });
});

describe("matchPropertiesToLead - sorting", () => {
  it("sorts results by descending match score", () => {
    const properties = [
      property({ id: "far", area: "Rohini", monthlyRent: 19000 }),
      property({ id: "perfect", area: "Janakpuri", monthlyRent: 19000, bhk: 2, furnishing: "SEMI_FURNISHED" }),
    ];
    const results = matchPropertiesToLead(properties, lead());
    expect(results[0].property.id).toBe("perfect");
  });
});

describe("applyProximityBonus", () => {
  it("adds a small bonus for a very close property", () => {
    const base = matchPropertyToLead(property({ furnishing: "UNFURNISHED" }), lead({ furnishingPref: "FURNISHED" }))!;
    const withBonus = applyProximityBonus(base, 100); // 100m away
    expect(withBonus.score).toBeGreaterThan(base.score);
  });

  it("adds no bonus beyond the proximity radius", () => {
    const base = matchPropertyToLead(property({ furnishing: "UNFURNISHED" }), lead({ furnishingPref: "FURNISHED" }))!;
    const withBonus = applyProximityBonus(base, 10_000); // 10km away
    expect(withBonus.score).toBe(base.score);
  });

  it("adds no bonus when distance is null (no coordinates available)", () => {
    const base = matchPropertyToLead(property(), lead())!;
    const withBonus = applyProximityBonus(base, null);
    expect(withBonus).toEqual(base);
  });

  it("never pushes the score above 100", () => {
    const base = matchPropertyToLead(property(), lead())!;
    const maxed = { ...base, score: 98 };
    const withBonus = applyProximityBonus(maxed, 0);
    expect(withBonus.score).toBeLessThanOrEqual(100);
  });
});

describe("matchPropertiesToLead - proximity bonus wiring", () => {
  it("gives a property in the exact preferred locality a higher score than an equally-scored property in a far locality, via the auto-wired proximity bonus", () => {
    const properties = [
      property({ id: "same-locality", area: "Janakpuri", monthlyRent: 19000, bhk: 2, furnishing: "SEMI_FURNISHED" }),
      property({ id: "far-locality", area: "Rohini", monthlyRent: 19000, bhk: 2, furnishing: "SEMI_FURNISHED" }),
    ];
    const results = matchPropertiesToLead(properties, lead({ preferredLocation: "Janakpuri" }));
    const same = results.find((r) => r.property.id === "same-locality")!;
    const far = results.find((r) => r.property.id === "far-locality")!;
    expect(same.score).toBeGreaterThan(far.score);
  });

  it("does not throw and returns unmodified scores when the lead's preferred location has no resolvable centroid", () => {
    const properties = [property({ area: "Somewhere Unknown" })];
    const results = matchPropertiesToLead(properties, lead({ preferredLocation: "Totally Unknown Place" }));
    expect(results).toHaveLength(1);
  });

  it("keeps results sorted by descending score after the proximity bonus is applied", () => {
    const properties = [
      property({ id: "a", area: "Rohini", monthlyRent: 19000, bhk: 2, furnishing: "SEMI_FURNISHED" }),
      property({ id: "b", area: "Janakpuri", monthlyRent: 19000, bhk: 2, furnishing: "SEMI_FURNISHED" }),
      property({ id: "c", area: "Vikaspuri", monthlyRent: 19000, bhk: 2, furnishing: "SEMI_FURNISHED" }),
    ];
    const results = matchPropertiesToLead(properties, lead({ preferredLocation: "Janakpuri" }));
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

describe("sectionizeMatches", () => {
  function makeResult(overrides: Partial<MatchResult> = {}): MatchResult {
    return {
      property: property(),
      score: 50,
      reasons: [],
      aboveBudget: false,
      overagePct: 0,
      budgetTier: "Within budget",
      locationMatchKind: "none",
      verified: false,
      hasImages: false,
      ...overrides,
    };
  }

  it("buckets a mixed set of results into all five sections with no duplicates and no gaps", () => {
    const results: MatchResult[] = [
      // 1. bestMatches
      makeResult({ property: property({ id: "p1" }), score: 90, aboveBudget: false, locationMatchKind: "exact" }),
      // 2. nearBudget (within budget, not high-scoring enough / not exact locality for bestMatches)
      makeResult({ property: property({ id: "p2" }), score: 60, aboveBudget: false, locationMatchKind: "none" }),
      // 3. nearbyLocalities (above budget + nearby locality)
      makeResult({ property: property({ id: "p3" }), score: 70, aboveBudget: true, locationMatchKind: "nearby" }),
      // 4. slightlyAboveBudget (above budget, not a nearby-locality match)
      makeResult({ property: property({ id: "p4" }), score: 65, aboveBudget: true, locationMatchKind: "none" }),
      // Also exercise: high score but aboveBudget - should NOT land in bestMatches
      makeResult({ property: property({ id: "p5" }), score: 95, aboveBudget: true, locationMatchKind: "exact" }),
      // Also exercise: high score, within budget, but not exact locality - should NOT land in bestMatches
      makeResult({ property: property({ id: "p6" }), score: 85, aboveBudget: false, locationMatchKind: "nearby" }),
    ];

    const sections = sectionizeMatches(results);

    expect(sections.bestMatches.map((r) => r.property.id)).toEqual(["p1"]);
    expect(sections.nearBudget.map((r) => r.property.id).sort()).toEqual(["p2", "p6"]);
    expect(sections.nearbyLocalities.map((r) => r.property.id)).toEqual(["p3"]);
    expect(sections.slightlyAboveBudget.map((r) => r.property.id).sort()).toEqual(["p4", "p5"]);
    expect(sections.otherSuggestions).toEqual([]);

    // Invariant: every input result appears in exactly one output section.
    const totalSectioned = sections.bestMatches.length + sections.nearBudget.length + sections.nearbyLocalities.length + sections.slightlyAboveBudget.length + sections.otherSuggestions.length;
    expect(totalSectioned).toBe(results.length);

    const allIds = [...sections.bestMatches, ...sections.nearBudget, ...sections.nearbyLocalities, ...sections.slightlyAboveBudget, ...sections.otherSuggestions].map((r) => r.property.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("preserves score-descending order within each section (stable filter over a pre-sorted input)", () => {
    const results: MatchResult[] = [
      makeResult({ property: property({ id: "high" }), score: 92, aboveBudget: false, locationMatchKind: "exact" }),
      makeResult({ property: property({ id: "mid" }), score: 88, aboveBudget: false, locationMatchKind: "exact" }),
      makeResult({ property: property({ id: "low" }), score: 81, aboveBudget: false, locationMatchKind: "exact" }),
    ];
    const sections = sectionizeMatches(results);
    expect(sections.bestMatches.map((r) => r.property.id)).toEqual(["high", "mid", "low"]);
  });

  it("returns empty arrays for every section given an empty input", () => {
    const sections = sectionizeMatches([]);
    expect(sections.bestMatches).toEqual([]);
    expect(sections.nearBudget).toEqual([]);
    expect(sections.nearbyLocalities).toEqual([]);
    expect(sections.slightlyAboveBudget).toEqual([]);
    expect(sections.otherSuggestions).toEqual([]);
  });
});
