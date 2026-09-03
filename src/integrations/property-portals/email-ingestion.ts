import "server-only";
import { createHash } from "crypto";
import type { PropertyPortalProviderId } from "./registry";

export type AuthorizedPortalEmail = {
  messageId: string;
  from: string;
  subject: string;
  receivedAt: Date;
  text: string;
};

export type EmailParserReadiness = "AWAITING_SAMPLE" | "READY";
export const portalEmailParserReadiness: Record<"HOUSING" | "OLX" | "MAGICBRICKS" | "NINETY_NINE_ACRES", EmailParserReadiness> = {
  HOUSING: "AWAITING_SAMPLE", OLX: "AWAITING_SAMPLE", MAGICBRICKS: "AWAITING_SAMPLE", NINETY_NINE_ACRES: "AWAITING_SAMPLE",
};

/** Sender matching is configuration-driven: a display name alone never authorizes ingestion. */
export function identifyAuthorizedEmailProvider(email: AuthorizedPortalEmail, rules: Partial<Record<PropertyPortalProviderId, string[]>>): PropertyPortalProviderId | null {
  const from = email.from.trim().toLowerCase();
  for (const [provider, senders] of Object.entries(rules) as Array<[PropertyPortalProviderId, string[] | undefined]>) {
    if (senders?.some((sender) => from === sender.trim().toLowerCase() || from.endsWith(`@${sender.trim().toLowerCase().replace(/^@/, "")}`))) return provider;
  }
  return null;
}

/** Stable mailbox idempotency key. The gateway must provide a provider-issued message id. */
export function portalEmailEventId(email: AuthorizedPortalEmail) {
  return `email:${createHash("sha256").update(email.messageId.trim()).digest("hex")}`;
}
