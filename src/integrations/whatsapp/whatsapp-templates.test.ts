import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listWhatsAppTemplates, getWhatsAppTemplate, findWhatsAppTemplateByName, assertTemplateApproved } from "./whatsapp-templates";
import { WhatsAppConfigError } from "./whatsapp-errors";

const ENV_KEYS = ["WHATSAPP_APPROVED_TEMPLATE_NAMES", "WHATSAPP_TEMPLATE_NAME_VISIT_CONFIRMATION"] as const;
let saved: Partial<Record<(typeof ENV_KEYS)[number], string>>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("listWhatsAppTemplates", () => {
  it("lists all 6 use cases, none approved by default (no live Meta credentials)", () => {
    const templates = listWhatsAppTemplates();
    expect(templates).toHaveLength(6);
    expect(templates.every((t) => t.approved === false)).toBe(true);
  });

  it("marks a template approved once its name is in WHATSAPP_APPROVED_TEMPLATE_NAMES", () => {
    process.env.WHATSAPP_APPROVED_TEMPLATE_NAMES = "visit_confirmation, follow_up_reminder";
    const templates = listWhatsAppTemplates();
    expect(templates.find((t) => t.useCase === "VISIT_CONFIRMATION")?.approved).toBe(true);
    expect(templates.find((t) => t.useCase === "FOLLOW_UP_REMINDER")?.approved).toBe(true);
    expect(templates.find((t) => t.useCase === "PRICE_UPDATED")?.approved).toBe(false);
  });

  it("supports overriding a template's real Meta name per use case", () => {
    process.env.WHATSAPP_TEMPLATE_NAME_VISIT_CONFIRMATION = "visit_confirmation_v2";
    process.env.WHATSAPP_APPROVED_TEMPLATE_NAMES = "visit_confirmation_v2";
    const template = getWhatsAppTemplate("VISIT_CONFIRMATION");
    expect(template.name).toBe("visit_confirmation_v2");
    expect(template.approved).toBe(true);
  });
});

describe("getWhatsAppTemplate", () => {
  it("throws for an unknown use case", () => {
    // @ts-expect-error - intentionally invalid use case for the error-path test
    expect(() => getWhatsAppTemplate("NOT_A_USE_CASE")).toThrow(WhatsAppConfigError);
  });
});

describe("findWhatsAppTemplateByName", () => {
  it("finds a template by its exact Meta name", () => {
    expect(findWhatsAppTemplateByName("visit_reminder")?.useCase).toBe("VISIT_REMINDER");
  });

  it("returns undefined for a name not in the registry", () => {
    expect(findWhatsAppTemplateByName("totally_made_up")).toBeUndefined();
  });
});

describe("assertTemplateApproved", () => {
  it("blocks an unregistered template name", () => {
    expect(() => assertTemplateApproved("some_random_template")).toThrow(WhatsAppConfigError);
  });

  it("blocks a registered but unapproved template", () => {
    expect(() => assertTemplateApproved("visit_reminder")).toThrow(/not been confirmed approved/);
  });

  it("allows a registered and approved template", () => {
    process.env.WHATSAPP_APPROVED_TEMPLATE_NAMES = "visit_reminder";
    expect(() => assertTemplateApproved("visit_reminder")).not.toThrow();
  });

  it("never silently falls back - always throws WhatsAppConfigError, never returns a degraded/default value on failure", () => {
    try {
      assertTemplateApproved("unknown_template");
      throw new Error("expected assertTemplateApproved to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(WhatsAppConfigError);
    }
  });
});
