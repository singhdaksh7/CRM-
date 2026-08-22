import { describe, it, expect } from "vitest";
import { HUMAN_FOLLOWUP_TYPES, DEFAULT_FOLLOWUP_TYPE } from "./follow-up-types";

/**
 * simplified-role-workflow (targeted fix pass, Blocker D) - exactly 4
 * human-facing follow-up types, correctly mapped onto the Prisma enum, no
 * raw enum string as a label.
 */
describe("HUMAN_FOLLOWUP_TYPES", () => {
  it("has exactly 4 options", () => {
    expect(HUMAN_FOLLOWUP_TYPES).toHaveLength(4);
  });

  it("maps Call/WhatsApp/Customer Expected/General Follow-up onto the correct enum values", () => {
    const byLabel = Object.fromEntries(HUMAN_FOLLOWUP_TYPES.map((t) => [t.label, t.value]));
    expect(byLabel["Call"]).toBe("PHONE_CALL");
    expect(byLabel["WhatsApp"]).toBe("WHATSAPP");
    expect(byLabel["Customer Expected / Coming"]).toBe("VISIT_EXPECTED");
    expect(byLabel["General Follow-up"]).toBe("GENERAL_FOLLOW_UP");
  });

  it("never shows a raw SCREAMING_SNAKE_CASE enum string as a label", () => {
    for (const t of HUMAN_FOLLOWUP_TYPES) {
      expect(t.label).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("does not offer the legacy enum values not part of the simplified 4-option form", () => {
    const values = HUMAN_FOLLOWUP_TYPES.map((t) => t.value);
    for (const legacy of ["PROPERTY_SHARING", "VISIT_CONFIRMATION", "NEGOTIATION", "DOCUMENTATION", "PAYMENT_REMINDER"]) {
      expect(values).not.toContain(legacy);
    }
  });

  it("default type is a valid option", () => {
    expect(HUMAN_FOLLOWUP_TYPES.map((t) => t.value)).toContain(DEFAULT_FOLLOWUP_TYPE);
  });
});
