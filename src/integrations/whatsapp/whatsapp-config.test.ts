import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadWhatsAppConfig, getWhatsAppConfigStatus } from "./whatsapp-config";
import { WhatsAppConfigError } from "./whatsapp-errors";

const ENV_KEYS = [
  "WHATSAPP_PROVIDER",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_DEFAULT_COUNTRY_CODE",
  "WHATSAPP_WEBHOOK_ENABLED",
  "WHATSAPP_TEST_RECIPIENT",
] as const;

let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

describe("loadWhatsAppConfig - provider selection", () => {
  it("defaults to MOCK when WHATSAPP_PROVIDER is unset", () => {
    expect(loadWhatsAppConfig().provider).toBe("MOCK");
  });

  it("selects CLICK_TO_CHAT when configured", () => {
    process.env.WHATSAPP_PROVIDER = "CLICK_TO_CHAT";
    expect(loadWhatsAppConfig().provider).toBe("CLICK_TO_CHAT");
  });

  it("is case-insensitive", () => {
    process.env.WHATSAPP_PROVIDER = "click_to_chat";
    expect(loadWhatsAppConfig().provider).toBe("CLICK_TO_CHAT");
  });

  it("throws WhatsAppConfigError for an unknown provider name", () => {
    process.env.WHATSAPP_PROVIDER = "TWILIO";
    expect(() => loadWhatsAppConfig()).toThrow(WhatsAppConfigError);
  });

  it("throws WhatsAppConfigError when META_CLOUD is selected without credentials", () => {
    process.env.WHATSAPP_PROVIDER = "META_CLOUD";
    expect(() => loadWhatsAppConfig()).toThrow(WhatsAppConfigError);
  });

  it("throws WhatsAppConfigError when META_CLOUD is missing only one required credential", () => {
    process.env.WHATSAPP_PROVIDER = "META_CLOUD";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    // WHATSAPP_VERIFY_TOKEN still missing
    expect(() => loadWhatsAppConfig()).toThrow(/WHATSAPP_VERIFY_TOKEN/);
  });

  it("throws WhatsAppConfigError when META_CLOUD is missing only businessAccountId/appSecret", () => {
    process.env.WHATSAPP_PROVIDER = "META_CLOUD";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify";
    expect(() => loadWhatsAppConfig()).toThrow(/WHATSAPP_BUSINESS_ACCOUNT_ID/);
    expect(() => loadWhatsAppConfig()).toThrow(/WHATSAPP_APP_SECRET/);
  });

  it("succeeds when META_CLOUD has all required credentials", () => {
    process.env.WHATSAPP_PROVIDER = "META_CLOUD";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify";
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "waba123";
    process.env.WHATSAPP_APP_SECRET = "shh";
    const config = loadWhatsAppConfig();
    expect(config.provider).toBe("META_CLOUD");
    expect(config.phoneNumberId).toBe("123");
  });

  it("defaultCountryCode falls back to 91 and can be overridden", () => {
    expect(loadWhatsAppConfig().defaultCountryCode).toBe("91");
    process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = "1";
    expect(loadWhatsAppConfig().defaultCountryCode).toBe("1");
  });

  it("webhookEnabled defaults to true and is disabled only by the literal string \"false\"", () => {
    expect(loadWhatsAppConfig().webhookEnabled).toBe(true);
    process.env.WHATSAPP_WEBHOOK_ENABLED = "false";
    expect(loadWhatsAppConfig().webhookEnabled).toBe(false);
  });
});

describe("getWhatsAppConfigStatus", () => {
  it("never leaks actual secret values, only presence", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "super-secret-token";
    const status = getWhatsAppConfigStatus();
    expect(status.accessToken).toBe("configured");
    expect(JSON.stringify(status)).not.toContain("super-secret-token");
  });

  it("reports missing for unset credentials", () => {
    const status = getWhatsAppConfigStatus();
    expect(status.phoneNumberId).toBe("missing");
    expect(status.metaReady).toBe(false);
  });

  it("reports metaReady=false (not a thrown error) when META_CLOUD is selected but incomplete", () => {
    process.env.WHATSAPP_PROVIDER = "META_CLOUD"; // incomplete
    const status = getWhatsAppConfigStatus();
    expect(status.provider).toBe("META_CLOUD");
    expect(status.metaReady).toBe(false);
  });

  it("falls back to MOCK in the status snapshot for a completely unknown provider name, instead of throwing", () => {
    process.env.WHATSAPP_PROVIDER = "NOT_A_REAL_PROVIDER";
    const status = getWhatsAppConfigStatus();
    expect(status.provider).toBe("MOCK");
  });

  it("metaReady requires businessAccountId and appSecret too, not just the original three", () => {
    process.env.WHATSAPP_PROVIDER = "META_CLOUD";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify";
    expect(getWhatsAppConfigStatus().metaReady).toBe(false);
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "waba123";
    process.env.WHATSAPP_APP_SECRET = "shh";
    expect(getWhatsAppConfigStatus().metaReady).toBe(true);
  });

  it("never leaks the app secret value, only presence", () => {
    process.env.WHATSAPP_APP_SECRET = "super-secret-app-secret";
    const status = getWhatsAppConfigStatus();
    expect(status.appSecret).toBe("configured");
    expect(JSON.stringify(status)).not.toContain("super-secret-app-secret");
  });
});
