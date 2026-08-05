import { describe, it, expect } from "vitest";
import { detectFollowUpTrigger, recommendFollowUpTiming } from "./followup-recommendations";

describe("detectFollowUpTrigger", () => {
  it("returns null when nothing matches", () => {
    expect(
      detectFollowUpTrigger({
        visitCompletedRecently: false,
        visitMissedRecently: false,
        catalogueOpenedNoInterest: false,
        daysSinceLastContact: 1,
        negotiationJustStarted: false,
        paymentPartial: false,
      })
    ).toBeNull();
  });

  it("prioritizes a missed visit over every other signal", () => {
    const trigger = detectFollowUpTrigger({
      visitCompletedRecently: true,
      visitMissedRecently: true,
      catalogueOpenedNoInterest: true,
      daysSinceLastContact: 10,
      negotiationJustStarted: true,
      paymentPartial: true,
    });
    expect(trigger).toBe("VISIT_MISSED");
  });

  it("picks up a completed visit when nothing higher-priority applies", () => {
    expect(
      detectFollowUpTrigger({
        visitCompletedRecently: true,
        visitMissedRecently: false,
        catalogueOpenedNoInterest: false,
        daysSinceLastContact: null,
        negotiationJustStarted: false,
        paymentPartial: false,
      })
    ).toBe("VISIT_COMPLETED");
  });

  it("falls back to 5-day silence only when no stronger trigger applies", () => {
    expect(
      detectFollowUpTrigger({
        visitCompletedRecently: false,
        visitMissedRecently: false,
        catalogueOpenedNoInterest: false,
        daysSinceLastContact: 5,
        negotiationJustStarted: false,
        paymentPartial: false,
      })
    ).toBe("NO_RESPONSE_5_DAYS");
  });

  it("does not fire the 5-day trigger below the threshold", () => {
    expect(
      detectFollowUpTrigger({
        visitCompletedRecently: false,
        visitMissedRecently: false,
        catalogueOpenedNoInterest: false,
        daysSinceLastContact: 4,
        negotiationJustStarted: false,
        paymentPartial: false,
      })
    ).toBeNull();
  });
});

describe("recommendFollowUpTiming", () => {
  it("recommends calling tomorrow after a completed visit", () => {
    const now = new Date("2026-08-05T12:00:00Z");
    const rec = recommendFollowUpTiming("VISIT_COMPLETED", now);
    expect(rec.label).toBe("Call tomorrow");
    expect(rec.suggestedDate.toISOString().slice(0, 10)).toBe("2026-08-06");
  });

  it("recommends calling today after a missed visit", () => {
    const now = new Date("2026-08-05T12:00:00Z");
    const rec = recommendFollowUpTiming("VISIT_MISSED", now);
    expect(rec.label).toBe("Call today");
    expect(rec.suggestedDate.toISOString().slice(0, 10)).toBe("2026-08-05");
  });

  it("recommends sharing more options after 5 days of silence", () => {
    expect(recommendFollowUpTiming("NO_RESPONSE_5_DAYS").label).toBe("Share more options");
  });
});
