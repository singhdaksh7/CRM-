import { normalizeIndianPhone } from "@/integrations/whatsapp/phone";
import { buildClickToChatLink } from "@/lib/demand-whatsapp";

/**
 * Manual WhatsApp catalogue-share fallback (Meta Cloud API may be down).
 *
 * ZERO AUTO-SEND:
 * - Only prepares a wa.me URL + message text for a human to open and press Send.
 * - Never calls Meta / MOCK / any WhatsApp provider send path.
 * - Never records DELIVERED / SENT merely because a link was prepared or opened.
 *
 * Integration seam for feature/simplified-role-workflow LeadPhone picker:
 * pass the already-authorized selected recipient number as `recipientPhone`.
 * This module does not invent or persist a LeadPhone model.
 */

export interface CatalogueWhatsAppFallbackInput {
  /** Explicit recipient phone after UI/authorization selection (LeadPhone seam). */
  recipientPhone: string;
  clientFirstName: string;
  cataloguePublicUrl: string;
  brokerageSignOff?: string;
  defaultCountryCode?: string;
}

export interface CatalogueWhatsAppFallbackResult {
  recipientPhoneNormalized: string;
  message: string;
  waMeUrl: string;
  /** Tracking-safe prep state only - never SENT/DELIVERED. */
  preparedState: "PREPARED";
}

export function buildCatalogueShareMessage(input: {
  clientFirstName: string;
  cataloguePublicUrl: string;
  brokerageSignOff?: string;
}): string {
  const signOff = input.brokerageSignOff?.trim() || "KP Properties";
  return [
    `Hi ${input.clientFirstName},`,
    ``,
    `Sharing the property options we discussed.`,
    ``,
    `View catalogue:`,
    input.cataloguePublicUrl,
    ``,
    `Please mark the properties you like so we can plan your visit.`,
    ``,
    `- ${signOff}`,
  ].join("\n");
}

/**
 * Builds a click-to-chat link. Returns null when the phone cannot be normalized.
 * Does not perform network I/O and must never be wired to a provider send().
 */
export function prepareCatalogueWhatsAppFallback(input: CatalogueWhatsAppFallbackInput): CatalogueWhatsAppFallbackResult | null {
  const normalized = normalizeIndianPhone(input.recipientPhone, input.defaultCountryCode ?? "91");
  if (!normalized) return null;

  const message = buildCatalogueShareMessage({
    clientFirstName: input.clientFirstName,
    cataloguePublicUrl: input.cataloguePublicUrl,
    brokerageSignOff: input.brokerageSignOff,
  });

  const waMeUrl = buildClickToChatLink(input.recipientPhone, message, input.defaultCountryCode ?? "91");
  if (!waMeUrl) return null;

  return {
    recipientPhoneNormalized: normalized,
    message,
    waMeUrl,
    preparedState: "PREPARED",
  };
}

/** Explicit contract for tests: this helper must not reference provider send APIs. */
export const CATALOGUE_WHATSAPP_FALLBACK_SENDS_AUTOMATICALLY = false;
