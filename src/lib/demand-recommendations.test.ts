import { describe, it, expect } from "vitest";
import { contactFrequencyWarnings } from "./demand-recommendations";

const baseContact = { doNotContact: false, whatsAppOptOut: false, lastContactedAt: null, lastPropertySentAt: null };

describe("contactFrequencyWarnings (rule 21)", () => {
  it("flags no warning for a fresh, opted-in, never-contacted candidate", () => {
    const warnings = contactFrequencyWarnings([{ candidateKey: "CONTACT:1", contact: baseContact, alreadySentThisProperty: false }], 7);
    expect(warnings).toEqual([]);
  });

  it("flags PROPERTY_ALREADY_SENT when this exact property was already sent (rule 22)", () => {
    const warnings = contactFrequencyWarnings([{ candidateKey: "CONTACT:1", contact: baseContact, alreadySentThisProperty: true }], 7);
    expect(warnings).toEqual([{ candidateKey: "CONTACT:1", reason: "PROPERTY_ALREADY_SENT" }]);
  });

  it("flags DO_NOT_CONTACT and never falls through to a weaker warning", () => {
    const warnings = contactFrequencyWarnings([{ candidateKey: "CONTACT:1", contact: { ...baseContact, doNotContact: true }, alreadySentThisProperty: false }], 7);
    expect(warnings).toEqual([{ candidateKey: "CONTACT:1", reason: "DO_NOT_CONTACT" }]);
  });

  it("flags OPTED_OUT for a WhatsApp opt-out contact", () => {
    const warnings = contactFrequencyWarnings([{ candidateKey: "CONTACT:1", contact: { ...baseContact, whatsAppOptOut: true }, alreadySentThisProperty: false }], 7);
    expect(warnings).toEqual([{ candidateKey: "CONTACT:1", reason: "OPTED_OUT" }]);
  });

  it("flags CONTACTED_RECENTLY when lastContactedAt is within the minimum-days window", () => {
    const recentlyContacted = { ...baseContact, lastContactedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) };
    const warnings = contactFrequencyWarnings([{ candidateKey: "CONTACT:1", contact: recentlyContacted, alreadySentThisProperty: false }], 7);
    expect(warnings).toEqual([{ candidateKey: "CONTACT:1", reason: "CONTACTED_RECENTLY" }]);
  });

  it("does not flag a contact last contacted before the minimum-days window", () => {
    const longAgoContacted = { ...baseContact, lastContactedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    const warnings = contactFrequencyWarnings([{ candidateKey: "CONTACT:1", contact: longAgoContacted, alreadySentThisProperty: false }], 7);
    expect(warnings).toEqual([]);
  });

  it("evaluates every candidate independently, never short-circuiting the whole batch", () => {
    const warnings = contactFrequencyWarnings(
      [
        { candidateKey: "CONTACT:1", contact: { ...baseContact, doNotContact: true }, alreadySentThisProperty: false },
        { candidateKey: "CONTACT:2", contact: baseContact, alreadySentThisProperty: false },
        { candidateKey: "LEAD:3", contact: null, alreadySentThisProperty: true },
      ],
      7
    );
    expect(warnings).toEqual([
      { candidateKey: "CONTACT:1", reason: "DO_NOT_CONTACT" },
      { candidateKey: "LEAD:3", reason: "PROPERTY_ALREADY_SENT" },
    ]);
  });

  it("never throws for a null contact (a Lead-sourced candidate has no CustomerContact)", () => {
    expect(() => contactFrequencyWarnings([{ candidateKey: "LEAD:1", contact: null, alreadySentThisProperty: false }], 7)).not.toThrow();
  });
});
