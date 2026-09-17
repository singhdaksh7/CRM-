import { describe, it, expect } from "vitest";
import {
  CALL_OUTCOMES,
  CALL_OUTCOME_LABELS,
  NO_ANSWER_OUTCOMES,
  SPOKE_OUTCOMES,
  outcomeRequiresCallback,
  outcomeRequiresVisitExpected,
  outcomeRequiresLostReason,
  outcomeRequiresNote,
} from "./dm-call-outcomes";

describe("dm-call-outcomes", () => {
  it("every outcome has a human label and belongs to exactly one of NO_ANSWER / SPOKE", () => {
    for (const outcome of CALL_OUTCOMES) {
      expect(CALL_OUTCOME_LABELS[outcome]).toBeTruthy();
      const inNoAnswer = (NO_ANSWER_OUTCOMES as string[]).includes(outcome);
      const inSpoke = (SPOKE_OUTCOMES as string[]).includes(outcome);
      expect(inNoAnswer !== inSpoke).toBe(true);
    }
  });

  it("only the no-answer/retry outcomes and Needs Time require a callback", () => {
    for (const outcome of CALL_OUTCOMES) {
      const expected = ["DIDNT_ANSWER", "BUSY", "SWITCHED_OFF", "CALL_AGAIN_LATER", "NEEDS_TIME"].includes(outcome);
      expect(outcomeRequiresCallback(outcome)).toBe(expected);
    }
  });

  it("only Will Visit/Come requires a visit-expected date+time", () => {
    for (const outcome of CALL_OUTCOMES) {
      expect(outcomeRequiresVisitExpected(outcome)).toBe(outcome === "WILL_VISIT_COME");
    }
  });

  it("Wrong Number does not require a callback (a bad number should not get a retry date)", () => {
    expect(outcomeRequiresCallback("WRONG_NUMBER")).toBe(false);
    expect(outcomeRequiresVisitExpected("WRONG_NUMBER")).toBe(false);
  });

  it("only Not Interested requires a lost reason", () => {
    for (const outcome of CALL_OUTCOMES) {
      expect(outcomeRequiresLostReason(outcome)).toBe(outcome === "NOT_INTERESTED");
    }
  });

  it("only Other requires a free-text note", () => {
    for (const outcome of CALL_OUTCOMES) {
      expect(outcomeRequiresNote(outcome)).toBe(outcome === "OTHER");
    }
  });
});
