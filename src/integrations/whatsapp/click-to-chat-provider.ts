import { randomUUID } from "crypto";
import { normalizeIndianPhone } from "./phone";
import { WhatsAppProviderError } from "./whatsapp-errors";
import type {
  WhatsAppProviderClient,
  SendTextParams,
  SendTemplateParams,
  SendMediaParams,
  SendCatalogueParams,
  WhatsAppSendResult,
  MessageStatusResult,
  ParsedWebhookPayload,
  WhatsAppDiagnosticsResult,
} from "./whatsapp-types";

/**
 * No network calls, no credentials. Builds a wa.me click-to-chat URL and
 * hands it back to the caller to open.
 *
 * Status policy (important - do not change without updating the UI copy):
 * every send() here returns status "QUEUED". This provider can never
 * confirm a human actually sent the message, let alone that WhatsApp
 * delivered or read it - so the DB row stays QUEUED until the
 * application explicitly calls `whatsapp-messages.ts#markClickToChatOpened`
 * after the user opens the link, which then marks it SENT. It is never
 * auto-promoted to DELIVERED or READ.
 */
export class ClickToChatWhatsAppProvider implements WhatsAppProviderClient {
  readonly name = "CLICK_TO_CHAT" as const;

  constructor(private defaultCountryCode: string = "91") {}

  private buildLink(to: string, text: string): string {
    const normalized = normalizeIndianPhone(to, this.defaultCountryCode);
    if (!normalized) throw new WhatsAppProviderError(this.name, `Cannot build a click-to-chat link: "${to}" is not a valid Indian phone number.`);
    return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
  }

  async sendTextMessage(params: SendTextParams): Promise<WhatsAppSendResult> {
    return {
      providerMessageId: `ctc_${randomUUID()}`,
      status: "QUEUED",
      provider: this.name,
      clickToChatUrl: this.buildLink(params.to, params.body),
    };
  }

  async sendTemplateMessage(params: SendTemplateParams): Promise<WhatsAppSendResult> {
    return {
      providerMessageId: `ctc_${randomUUID()}`,
      status: "QUEUED",
      provider: this.name,
      clickToChatUrl: this.buildLink(params.to, params.body),
    };
  }

  async sendMediaMessage(params: SendMediaParams): Promise<WhatsAppSendResult> {
    const text = params.caption ? `${params.caption}\n${params.mediaUrl}` : params.mediaUrl;
    return {
      providerMessageId: `ctc_${randomUUID()}`,
      status: "QUEUED",
      provider: this.name,
      clickToChatUrl: this.buildLink(params.to, text),
    };
  }

  async sendCatalogueMessage(params: SendCatalogueParams): Promise<WhatsAppSendResult> {
    // Mirrors MetaWhatsAppProvider: the catalogue link is appended even if
    // the caller's rendered body already embeds it elsewhere, since callers
    // (e.g. a future template that doesn't include the link inline) should
    // not have to know this provider needs it appended - cheap idempotent
    // duplication is safer than a silently missing link.
    const text = params.body.includes(params.catalogueUrl) ? params.body : `${params.body}\n\n${params.catalogueUrl}`;
    return {
      providerMessageId: `ctc_${randomUUID()}`,
      status: "QUEUED",
      provider: this.name,
      clickToChatUrl: this.buildLink(params.to, text),
    };
  }

  async getMessageStatus(_providerMessageId: string): Promise<MessageStatusResult | null> {
    return null; // no delivery/read receipts are available from click-to-chat
  }

  verifyWebhook(_query: URLSearchParams): string | null {
    return null;
  }

  verifyWebhookSignature(_rawBody: string, _signatureHeader: string | null): boolean {
    return true;
  }

  parseInboundWebhook(_payload: unknown): ParsedWebhookPayload {
    return { messages: [], statuses: [] };
  }

  async markAsRead(_providerMessageId: string): Promise<void> {
    // No-op - click-to-chat has no API session to mark anything read on.
  }

  async getDiagnostics(): Promise<WhatsAppDiagnosticsResult> {
    return { ok: true, details: { provider: "CLICK_TO_CHAT", note: "wa.me links only - no external dependency to check" } };
  }
}
