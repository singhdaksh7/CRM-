import type { WhatsAppMessageStatus, WhatsAppProviderName } from "@prisma/client";

/** Normalized, provider-agnostic result every `sendXxx()` call resolves to. */
export interface WhatsAppSendResult {
  providerMessageId: string;
  status: Extract<WhatsAppMessageStatus, "QUEUED" | "SENT">;
  provider: WhatsAppProviderName;
  /** Only set by the click-to-chat provider - the wa.me URL the UI should open. */
  clickToChatUrl?: string;
  rawResponse?: unknown;
}

export interface SendTextParams {
  to: string;
  body: string;
}

export interface SendTemplateParams {
  to: string;
  templateName: string;
  body: string; // pre-rendered body (this MVP doesn't manage Meta template approval, so the rendered text is sent as the payload placeholder)
  variables?: Record<string, string>;
}

export interface SendMediaParams {
  to: string;
  mediaUrl: string;
  caption?: string;
}

export interface SendCatalogueParams {
  to: string;
  body: string;
  catalogueUrl: string;
}

export interface MessageStatusResult {
  providerMessageId: string;
  status: WhatsAppMessageStatus;
}

export interface InboundWebhookMessage {
  externalEventId: string;
  providerMessageId: string;
  from: string;
  text: string;
  timestamp: Date;
}

export interface StatusWebhookEvent {
  externalEventId: string;
  providerMessageId: string;
  status: WhatsAppMessageStatus;
  timestamp: Date;
}

export interface ParsedWebhookPayload {
  messages: InboundWebhookMessage[];
  statuses: StatusWebhookEvent[];
}

/**
 * Provider-agnostic WhatsApp interface. Every provider (Mock, Click-to-Chat,
 * Meta Cloud) implements this same shape so calling code (whatsapp-service.ts,
 * the message/conversation services) never branches on which provider is
 * active - only whatsapp-config.ts decides that, once, at startup.
 */
export interface WhatsAppProviderClient {
  readonly name: WhatsAppProviderName;
  sendTextMessage(params: SendTextParams): Promise<WhatsAppSendResult>;
  sendTemplateMessage(params: SendTemplateParams): Promise<WhatsAppSendResult>;
  sendMediaMessage(params: SendMediaParams): Promise<WhatsAppSendResult>;
  sendCatalogueMessage(params: SendCatalogueParams): Promise<WhatsAppSendResult>;
  getMessageStatus(providerMessageId: string): Promise<MessageStatusResult | null>;
  /** GET webhook verification (Meta hub.challenge handshake). Non-Meta providers never receive calls to this. */
  verifyWebhook(query: URLSearchParams): string | null;
  /** Validates the raw request signature before any parsing happens. Providers without signatures return true. */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
  parseInboundWebhook(payload: unknown): ParsedWebhookPayload;
}
