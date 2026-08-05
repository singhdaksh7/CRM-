import { describe, it, expect } from "vitest";
import { parseSearchQuery } from "./parser";

describe("parseSearchQuery", () => {
  it("returns an empty parse for an empty query", () => {
    const result = parseSearchQuery("");
    expect(result.entity).toBeNull();
    expect(result.keywords).toEqual([]);
    expect(result.chips).toEqual([]);
  });

  it("parses a bare name into keywords with no entity", () => {
    const result = parseSearchQuery("Rahul");
    expect(result.keywords).toEqual(["Rahul"]);
    expect(result.entity).toBeNull();
  });

  it("parses a property code as a keyword", () => {
    const result = parseSearchQuery("PROP-102");
    expect(result.keywords).toEqual(["PROP-102"]);
  });

  it("recognizes a known locality", () => {
    const result = parseSearchQuery("2 bhk Rajouri Garden under 35000");
    expect(result.locality).toBe("Rajouri Garden");
    expect(result.bhk).toBe(2);
    expect(result.maxPrice).toBe(35000);
  });

  it("parses bhk", () => {
    expect(parseSearchQuery("2 bhk").bhk).toBe(2);
    expect(parseSearchQuery("3bhk flat").bhk).toBe(3);
  });

  it("parses price with k/lakh suffixes", () => {
    expect(parseSearchQuery("under 35000").maxPrice).toBe(35000);
    expect(parseSearchQuery("under 35k").maxPrice).toBe(35000);
    expect(parseSearchQuery("above 1.2l").minPrice).toBe(120000);
    expect(parseSearchQuery("above 20k").minPrice).toBe(20000);
  });

  it("parses a lead status word", () => {
    const result = parseSearchQuery("negotiation leads");
    expect(result.status).toBe("NEGOTIATION");
    expect(result.entity).toBe("LEAD");
  });

  it("parses a lead priority word", () => {
    expect(parseSearchQuery("hot leads").status).toBe("HOT");
  });

  it("parses a multi-word status phrase", () => {
    expect(parseSearchQuery("closed won leads").status).toBe("CLOSED_WON");
  });

  it("parses 'followups today' into entity + date filter", () => {
    const result = parseSearchQuery("followups today");
    expect(result.entity).toBe("FOLLOW_UP");
    expect(result.dateFilter).toBe("TODAY");
  });

  it("parses 'visits today'", () => {
    const result = parseSearchQuery("visits today");
    expect(result.entity).toBe("VISIT");
    expect(result.dateFilter).toBe("TODAY");
  });

  it("parses overdue follow-ups", () => {
    const result = parseSearchQuery("overdue follow-ups");
    expect(result.entity).toBe("FOLLOW_UP");
    expect(result.dateFilter).toBe("OVERDUE");
  });

  it("parses 'employee rohit'", () => {
    const result = parseSearchQuery("employee rohit");
    expect(result.entity).toBe("EMPLOYEE");
    expect(result.employeeName).toBe("rohit");
  });

  it("parses 'assigned to rohit'", () => {
    expect(parseSearchQuery("assigned to rohit").employeeName).toBe("rohit");
  });

  it("parses 'property without photos'", () => {
    const result = parseSearchQuery("property without photos");
    expect(result.entity).toBe("PROPERTY");
    expect(result.missingPhotos).toBe(true);
  });

  it("combines multiple filters into distinct chips", () => {
    const result = parseSearchQuery("2 bhk Rajouri Garden under 35000 available");
    const keys = result.chips.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["bhk", "locality", "maxPrice", "status"]));
  });

  it("treats SQL-injection-shaped input as inert keyword text, not a query fragment", () => {
    const result = parseSearchQuery("'; DROP TABLE leads; --");
    expect(result.entity).toBeNull();
    expect(result.status).toBeNull();
    expect(result.keywords.join(" ")).toContain("DROP");
  });

  it("handles whitespace-only input the same as empty", () => {
    const result = parseSearchQuery("   ");
    expect(result.keywords).toEqual([]);
    expect(result.chips).toEqual([]);
  });

  it("is case-insensitive for entity and status words", () => {
    const result = parseSearchQuery("HOT LEADS");
    expect(result.entity).toBe("LEAD");
    expect(result.status).toBe("HOT");
  });
});
