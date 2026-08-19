import { normalizeIndianPhone } from "@/integrations/whatsapp/phone";

/**
 * Demand-pool WhatsApp message preparation. ZERO AUTO-SEND (rule 26): this
 * module only ever builds text and a wa.me click-to-chat URL for a human to
 * review/edit/open - it never calls a provider, never touches
 * WhatsAppMessage, and is never invoked from a background job. Matches the
 * "prepared message" convention already established for the Requirement
 * Network (see src/lib/demo-data/portals.ts comment: "the recommendation
 * remains an editable UI suggestion until a user acts").
 *
 * Reuses normalizeIndianPhone (the same phone-normalization the real
 * ClickToChatWhatsAppProvider uses) rather than re-implementing it, but
 * deliberately does not go through the provider abstraction at all here -
 * there is no "send" happening, only link construction for the UI to render
 * a [Copy Message] / [Open WhatsApp] pair.
 */

export interface RecommendationMessageInput {
  customerName: string;
  propertyTypeLabel: string; // e.g. "3 BHK" or "Commercial Office"
  locality: string;
  priceLabel: string; // e.g. "₹1 Cr" or "₹35,000/month" - formatted by the caller
  publicUrl: string;
}

/** The NEW_PROPERTY_MATCH template (rule 29) - variables kept in this exact order so a future Meta template submission can map {{1}}..{{5}} 1:1 without reshaping this function. Never submitted to Meta automatically. */
export const NEW_PROPERTY_MATCH_TEMPLATE_NAME = "NEW_PROPERTY_MATCH";
export const NEW_PROPERTY_MATCH_TEMPLATE_VARIABLES = ["customerName", "propertyTypeLabel", "locality", "priceLabel", "publicUrl"] as const;

export function buildRecommendationMessage(input: RecommendationMessageInput): string {
  return [
    `Hi ${input.customerName},`,
    ``,
    `We have just listed a property that may match your requirement.`,
    ``,
    input.propertyTypeLabel,
    input.locality,
    input.priceLabel,
    ``,
    `View photos and complete details:`,
    input.publicUrl,
    ``,
    `Reply if you'd like to arrange a visit.`,
  ].join("\n");
}

/** Builds a wa.me click-to-chat link, or null if the phone isn't a valid Indian mobile number - the caller decides how to surface that (e.g. disable the [Open WhatsApp] button). No network call, no credentials, matches ClickToChatWhatsAppProvider's own link format exactly. */
export function buildClickToChatLink(phone: string, message: string, defaultCountryCode = "91"): string | null {
  const normalized = normalizeIndianPhone(phone, defaultCountryCode);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
