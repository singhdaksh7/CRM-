import { loadWhatsAppConfig } from "./whatsapp-config";
import { MockWhatsAppProvider } from "./mock-whatsapp-provider";
import { ClickToChatWhatsAppProvider } from "./click-to-chat-provider";
import { MetaWhatsAppProvider } from "./meta-whatsapp-provider";
import type { WhatsAppProviderClient } from "./whatsapp-types";

let cachedProvider: WhatsAppProviderClient | null = null;

/**
 * Resolves the single active provider from environment configuration.
 * Cached per process - the provider is stateless w.r.t. config, so there's
 * no need to re-read env vars on every call. Throws WhatsAppConfigError if
 * META_CLOUD is selected without complete credentials.
 */
export function getWhatsAppProvider(): WhatsAppProviderClient {
  if (cachedProvider) return cachedProvider;

  const config = loadWhatsAppConfig();
  switch (config.provider) {
    case "MOCK":
      cachedProvider = new MockWhatsAppProvider();
      break;
    case "CLICK_TO_CHAT":
      cachedProvider = new ClickToChatWhatsAppProvider();
      break;
    case "META_CLOUD":
      cachedProvider = new MetaWhatsAppProvider(config);
      break;
  }
  return cachedProvider;
}

/** Test-only: clears the cached provider so tests can re-resolve after changing env vars. */
export function resetWhatsAppProviderCache() {
  cachedProvider = null;
}

export * from "./whatsapp-types";
export * from "./whatsapp-config";
export * from "./whatsapp-errors";
export { normalizeIndianPhone, isValidIndianPhone } from "./phone";
export { renderCatalogueMessage } from "./whatsapp-template-renderer";
export { verifyMetaSignature } from "./whatsapp-signature";
