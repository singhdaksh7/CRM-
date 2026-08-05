import { describe, it, expect } from "vitest";
import { computeLeadTimelineSummary } from "./lead-summary";

const NOW = new Date("2026-08-05T12:00:00Z");

describe("computeLeadTimelineSummary", () => {
  it("reports no activity for a freshly created lead with no follow-up", () => {
    const result = computeLeadTimelineSummary({ createdAt: NOW, activities: [], hasOverdueFollowUp: false, hasPendingFollowUp: false, now: NOW });
    expect(result.lines.find((l) => l.id === "age")!.text).toBe("Lead was created today.");
    expect(result.lines.find((l) => l.id === "followup")!.text).toBe("No follow-up is currently scheduled.");
    expect(result.lines.some((l) => l.id === "catalogue")).toBe(false);
  });

  it("reports catalogue shared and opened when both activities exist", () => {
    const result = computeLeadTimelineSummary({
      createdAt: new Date("2026-07-27T12:00:00Z"),
      activities: [{ type: "CATALOGUE_SENT" }, { type: "CATALOGUE_VIEWED" }],
      hasOverdueFollowUp: false,
      hasPendingFollowUp: true,
      now: NOW,
    });
    expect(result.lines.find((l) => l.id === "age")!.text).toBe("Lead has been active for 9 days.");
    expect(result.lines.find((l) => l.id === "catalogue")!.text).toBe("Catalogue shared and opened by the client.");
  });

  it("reports catalogue shared but not opened", () => {
    const result = computeLeadTimelineSummary({ createdAt: NOW, activities: [{ type: "CATALOGUE_SENT" }], hasOverdueFollowUp: false, hasPendingFollowUp: false, now: NOW });
    expect(result.lines.find((l) => l.id === "catalogue")!.text).toBe("Catalogue shared, not yet opened by the client.");
  });

  it("counts client interest", () => {
    const result = computeLeadTimelineSummary({
      createdAt: NOW,
      activities: [{ type: "PROPERTY_INTERESTED" }, { type: "PROPERTY_INTERESTED" }],
      hasOverdueFollowUp: false,
      hasPendingFollowUp: false,
      now: NOW,
    });
    expect(result.lines.find((l) => l.id === "interest")!.text).toBe("Client marked interest in 2 properties.");
  });

  it("reports a completed visit over a merely scheduled one", () => {
    const result = computeLeadTimelineSummary({
      createdAt: NOW,
      activities: [{ type: "VISIT_SCHEDULED" }, { type: "VISIT_COMPLETED" }],
      hasOverdueFollowUp: false,
      hasPendingFollowUp: false,
      now: NOW,
    });
    expect(result.lines.find((l) => l.id === "visits")!.text).toBe("Visited 1 property.");
  });

  it("reports a scheduled-only visit when none is completed", () => {
    const result = computeLeadTimelineSummary({ createdAt: NOW, activities: [{ type: "VISIT_SCHEDULED" }], hasOverdueFollowUp: false, hasPendingFollowUp: false, now: NOW });
    expect(result.lines.find((l) => l.id === "visits")!.text).toBe("A property visit is scheduled.");
  });

  it("flags an overdue follow-up", () => {
    const result = computeLeadTimelineSummary({ createdAt: NOW, activities: [], hasOverdueFollowUp: true, hasPendingFollowUp: false, now: NOW });
    expect(result.lines.find((l) => l.id === "followup")!.text).toMatch(/overdue/i);
  });

  it("reports a closed deal over follow-up status", () => {
    const result = computeLeadTimelineSummary({ createdAt: NOW, activities: [{ type: "DEAL_CLOSED" }], hasOverdueFollowUp: true, hasPendingFollowUp: false, now: NOW });
    expect(result.lines.find((l) => l.id === "deal")!.text).toBe("Deal closed.");
    expect(result.lines.some((l) => l.id === "followup")).toBe(false);
  });

  it("never claims an activity that isn't present in the data", () => {
    const result = computeLeadTimelineSummary({ createdAt: NOW, activities: [], hasOverdueFollowUp: false, hasPendingFollowUp: false, now: NOW });
    const allText = result.lines.map((l) => l.text).join(" ");
    expect(allText).not.toMatch(/catalogue|visit|interest|deal/i);
  });
});
