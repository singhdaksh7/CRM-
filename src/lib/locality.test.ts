import { describe, it, expect } from "vitest";
import { normalizeLocality, getLocalityCentroid, listKnownLocalities } from "./locality";

describe("normalizeLocality", () => {
  it("normalizes a common misspelling to its canonical name", () => {
    expect(normalizeLocality("Janak Puri")).toMatchObject({ canonical: "Janakpuri", matched: true });
  });

  it("normalizes an abbreviated sector reference", () => {
    expect(normalizeLocality("Dwarka Sec 12")).toMatchObject({ canonical: "Dwarka Sector 12", matched: true });
  });

  it("normalizes Vikas Puri to Vikaspuri", () => {
    expect(normalizeLocality("Vikas Puri")).toMatchObject({ canonical: "Vikaspuri", matched: true });
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(normalizeLocality("  RAJOURI   GARDEN  ")).toMatchObject({ canonical: "Rajouri Garden", matched: true });
  });

  it("passes through an already-canonical name unchanged", () => {
    expect(normalizeLocality("Rohini")).toMatchObject({ canonical: "Rohini", matched: true });
  });

  it("preserves the original entered string separately from the canonical form", () => {
    const result = normalizeLocality("janak puri");
    expect(result.original).toBe("janak puri");
    expect(result.canonical).toBe("Janakpuri");
  });

  it("never merges two genuinely different localities - an unmatched input passes through unchanged", () => {
    expect(normalizeLocality("Some Totally Unknown Colony")).toMatchObject({ canonical: "Some Totally Unknown Colony", matched: false });
  });

  it("does not confuse Vasant Kunj and Vasant Vihar", () => {
    expect(normalizeLocality("Vasant Kunj").canonical).toBe("Vasant Kunj");
    expect(normalizeLocality("Vasant Vihar").canonical).toBe("Vasant Vihar");
  });
});

describe("getLocalityCentroid", () => {
  it("returns a coordinate for a known locality", () => {
    const centroid = getLocalityCentroid("Janakpuri");
    expect(centroid).not.toBeNull();
    expect(centroid!.latitude).toBeGreaterThan(0);
  });

  it("resolves via alias too", () => {
    expect(getLocalityCentroid("Janak Puri")).toEqual(getLocalityCentroid("Janakpuri"));
  });

  it("returns null for an unknown locality rather than guessing", () => {
    expect(getLocalityCentroid("Nonexistent Colony")).toBeNull();
  });
});

describe("listKnownLocalities", () => {
  it("returns a non-empty list of canonical names", () => {
    const list = listKnownLocalities();
    expect(list.length).toBeGreaterThan(0);
    expect(list).toContain("Janakpuri");
  });
});
