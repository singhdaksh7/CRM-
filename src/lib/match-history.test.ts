import { describe, it, expect } from "vitest";
import { matchHistoryStatusFor, matchHistorySortRank, type MatchHistoryLookup } from "./match-history";

function lookup(overrides: Partial<Record<keyof MatchHistoryLookup, string[]>> = {}): MatchHistoryLookup {
  return {
    alreadySharedLeadIds: new Set(overrides.alreadySharedLeadIds ?? []),
    visitedLeadIds: new Set(overrides.visitedLeadIds ?? []),
    rejectedLeadIds: new Set(overrides.rejectedLeadIds ?? []),
    likedLeadIds: new Set(overrides.likedLeadIds ?? []),
  };
}

describe("matchHistoryStatusFor (Feature 2 - matching history/feedback intelligence)", () => {
  it("returns NEW for a lead with no history at all", () => {
    expect(matchHistoryStatusFor("lead1", lookup())).toBe("NEW");
  });

  it("returns NEW for a CONTACT-sourced candidate (leadId null) - no lead-keyed history applies", () => {
    expect(matchHistoryStatusFor(null, lookup({ rejectedLeadIds: ["lead1"] }))).toBe("NEW");
  });

  it("returns ALREADY_SHARED when the property was shared via a catalogue to this lead", () => {
    expect(matchHistoryStatusFor("lead1", lookup({ alreadySharedLeadIds: ["lead1"] }))).toBe("ALREADY_SHARED");
  });

  it("returns VISITED when the lead actually visited this property", () => {
    expect(matchHistoryStatusFor("lead1", lookup({ visitedLeadIds: ["lead1"] }))).toBe("VISITED");
  });

  it("returns LIKED when CataloguePropertyPreference recorded a LIKED preference", () => {
    expect(matchHistoryStatusFor("lead1", lookup({ likedLeadIds: ["lead1"] }))).toBe("LIKED");
  });

  it("returns REJECTED when CataloguePropertyPreference recorded NOT_INTERESTED", () => {
    expect(matchHistoryStatusFor("lead1", lookup({ rejectedLeadIds: ["lead1"] }))).toBe("REJECTED");
  });

  it("REJECTED takes precedence over VISITED and ALREADY_SHARED for the same lead+property", () => {
    const l = lookup({ rejectedLeadIds: ["lead1"], visitedLeadIds: ["lead1"], alreadySharedLeadIds: ["lead1"] });
    expect(matchHistoryStatusFor("lead1", l)).toBe("REJECTED");
  });

  it("VISITED takes precedence over ALREADY_SHARED (a lead who visited was, by definition, also shared it)", () => {
    const l = lookup({ visitedLeadIds: ["lead1"], alreadySharedLeadIds: ["lead1"] });
    expect(matchHistoryStatusFor("lead1", l)).toBe("VISITED");
  });

  it("never lets one lead's history leak onto another lead's status", () => {
    const l = lookup({ rejectedLeadIds: ["lead1"] });
    expect(matchHistoryStatusFor("lead2", l)).toBe("NEW");
  });
});

describe("matchHistorySortRank", () => {
  it("ranks LIKED and NEW ahead of ALREADY_SHARED/VISITED, and REJECTED last", () => {
    const ranks = ["REJECTED", "VISITED", "ALREADY_SHARED", "NEW", "LIKED"].map((s) => matchHistorySortRank(s as never));
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks.indexOf(Math.min(...sorted))).not.toBe(-1);
    expect(matchHistorySortRank("LIKED")).toBeLessThan(matchHistorySortRank("ALREADY_SHARED"));
    expect(matchHistorySortRank("NEW")).toBeLessThan(matchHistorySortRank("ALREADY_SHARED"));
    expect(matchHistorySortRank("ALREADY_SHARED")).toBeLessThan(matchHistorySortRank("REJECTED"));
    expect(matchHistorySortRank("VISITED")).toBeLessThan(matchHistorySortRank("REJECTED"));
  });
});
