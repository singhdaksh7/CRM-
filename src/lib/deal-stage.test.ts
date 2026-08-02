import { describe, it, expect } from "vitest";
import { terminalStatusFor, isDealOpenForTransition, validateStageTransition } from "./deal-stage";

describe("terminalStatusFor", () => {
  it("maps CLOSED_WON to WON", () => {
    expect(terminalStatusFor("CLOSED_WON")).toBe("WON");
  });

  it("maps CLOSED_LOST to LOST", () => {
    expect(terminalStatusFor("CLOSED_LOST")).toBe("LOST");
  });

  it("returns null for a non-terminal stage", () => {
    expect(terminalStatusFor("NEGOTIATION")).toBeNull();
  });
});

describe("isDealOpenForTransition", () => {
  it("is true only for OPEN", () => {
    expect(isDealOpenForTransition("OPEN")).toBe(true);
    expect(isDealOpenForTransition("WON")).toBe(false);
    expect(isDealOpenForTransition("LOST")).toBe(false);
    expect(isDealOpenForTransition("CANCELLED")).toBe(false);
  });
});

describe("validateStageTransition", () => {
  it("allows a normal forward transition on an open deal", () => {
    const result = validateStageTransition({ currentStatus: "OPEN", nextStage: "NEGOTIATION" });
    expect(result.allowed).toBe(true);
  });

  it("allows CLOSED_WON without a lostReason", () => {
    const result = validateStageTransition({ currentStatus: "OPEN", nextStage: "CLOSED_WON" });
    expect(result.allowed).toBe(true);
  });

  it("rejects CLOSED_LOST without a lostReason", () => {
    const result = validateStageTransition({ currentStatus: "OPEN", nextStage: "CLOSED_LOST" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/lostReason/);
  });

  it("allows CLOSED_LOST when a lostReason is provided", () => {
    const result = validateStageTransition({ currentStatus: "OPEN", nextStage: "CLOSED_LOST", lostReason: "Client backed out" });
    expect(result.allowed).toBe(true);
  });

  it("rejects any stage change once the deal is already WON", () => {
    const result = validateStageTransition({ currentStatus: "WON", nextStage: "DOCUMENTATION" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already won/);
  });

  it("rejects any stage change once the deal is already LOST", () => {
    const result = validateStageTransition({ currentStatus: "LOST", nextStage: "NEGOTIATION" });
    expect(result.allowed).toBe(false);
  });

  it("rejects any stage change once the deal is CANCELLED", () => {
    const result = validateStageTransition({ currentStatus: "CANCELLED", nextStage: "NEGOTIATION" });
    expect(result.allowed).toBe(false);
  });
});
