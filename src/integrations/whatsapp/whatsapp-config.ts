import { WhatsAppConfigError } from "./whatsapp-errors";
import type { WhatsAppProviderName } from "@prisma/client";

/**
 * Server-only. Never import this module from a "use client" component -
 * `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_APP_SECRET` must never reach the
 * browser bundle. Nothing here is exported with a `NEXT_PUBLIC_` prefix.
 */

export interface WhatsAppConfig {
  provider: WhatsAppProviderName;
  phoneNumberId?: string;
  businessAccountId?: string;
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string;
  apiVersion: string;
  appUrl: string;
  /** Prefix applied to a bare local mobile number by phone.ts - see WHATSAPP_DEFAULT_COUNTRY_CODE. */
  defaultCountryCode: string;
  /** Escape hatch to take the webhook endpoint offline (503) even while META_CLOUD is selected. */
  webhookEnabled: boolean;
  /** Only used by the explicit Admin test-send diagnostic action - never for automatic sends. */
  testRecipient?: string;
}

function resolveProviderName(): WhatsAppProviderName {
  const raw = (process.env.WHATSAPP_PROVIDER ?? "MOCK").toUpperCase();
  if (raw === "MOCK" || raw === "CLICK_TO_CHAT" || raw === "META_CLOUD") return raw;
  throw new WhatsAppConfigError(`Unknown WHATSAPP_PROVIDER "${raw}". Expected MOCK, CLICK_TO_CHAT, or META_CLOUD.`);
}

/** Reads env vars and validates them. Throws WhatsAppConfigError with a clear message if META_CLOUD is selected but incomplete. */
export function loadWhatsAppConfig(): WhatsAppConfig {
  const provider = resolveProviderName();
  const config: WhatsAppConfig = {
    provider,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v20.0",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91",
    webhookEnabled: process.env.WHATSAPP_WEBHOOK_ENABLED !== "false",
    testRecipient: process.env.WHATSAPP_TEST_RECIPIENT,
  };

  if (provider === "META_CLOUD") {
    const missing = (["phoneNumberId", "accessToken", "verifyToken", "businessAccountId", "appSecret"] as const).filter((k) => !config[k]);
    if (missing.length > 0) {
      throw new WhatsAppConfigError(
        `WHATSAPP_PROVIDER=META_CLOUD requires ${missing.map((k) => envVarNameFor(k)).join(", ")}. Set these in your environment, or switch WHATSAPP_PROVIDER to MOCK or CLICK_TO_CHAT for local development.`
      );
    }
  }

  return config;
}

function envVarNameFor(key: keyof WhatsAppConfig): string {
  const map: Partial<Record<keyof WhatsAppConfig, string>> = {
    phoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
    businessAccountId: "WHATSAPP_BUSINESS_ACCOUNT_ID",
    accessToken: "WHATSAPP_ACCESS_TOKEN",
    verifyToken: "WHATSAPP_VERIFY_TOKEN",
    appSecret: "WHATSAPP_APP_SECRET",
  };
  return map[key] ?? String(key);
}

/** Non-secret status snapshot for the Settings UI - never includes actual secret values. */
export function getWhatsAppConfigStatus() {
  const provider = (() => {
    try {
      return resolveProviderName();
    } catch {
      return "MOCK" as const;
    }
  })();

  const presence = (v: string | undefined): "configured" | "missing" => (v ? "configured" : "missing");

  return {
    provider,
    phoneNumberId: presence(process.env.WHATSAPP_PHONE_NUMBER_ID),
    businessAccountId: presence(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    accessToken: presence(process.env.WHATSAPP_ACCESS_TOKEN),
    verifyToken: presence(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecret: presence(process.env.WHATSAPP_APP_SECRET),
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v20.0",
    defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91",
    webhookEnabled: process.env.WHATSAPP_WEBHOOK_ENABLED !== "false",
    testRecipientConfigured: presence(process.env.WHATSAPP_TEST_RECIPIENT),
    metaReady:
      provider === "META_CLOUD" &&
      Boolean(
        process.env.WHATSAPP_PHONE_NUMBER_ID &&
          process.env.WHATSAPP_ACCESS_TOKEN &&
          process.env.WHATSAPP_VERIFY_TOKEN &&
          process.env.WHATSAPP_BUSINESS_ACCOUNT_ID &&
          process.env.WHATSAPP_APP_SECRET
      ),
  };
}
