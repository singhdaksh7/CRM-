import { randomUUID } from "crypto";
import type {
  WhatsAppProviderClient,
  SendTextParams,
  SendTemplateParams,
  SendMediaParams,
  SendCatalogueParams,
  WhatsAppSendResult,
  MessageStatusResult,
  ParsedWebhookPayload,
} from "./whatsapp-types";

/**
 * Fully functional demo provider - makes zero network calls. "Sending" a
 * message just mints a unique provider message ID and reports SENT
 * immediately; DELIVERED/READ/a simulated inbound reply/a simulated failure
 * are all driven explicitly by the demo controls in the UI (see
 * whatsapp-messages.ts `simulateStatus` / `simulateReply`), not by this
 * class, since there is no real WhatsApp network to asynchronously notify us.
 */
export class MockWhatsAppProvider implements WhatsAppProviderClient {
  readonly name = "MOCK" as const;

  private async send(): Promise<WhatsAppSendResult> {
    return {
      providerMessageId: `mock_${randomUUID()}`,
      status: "SENT",
      provider: this.name,
    };
  }

  async sendTextMessage(_params: SendTextParams): Promise<WhatsAppSendResult> {
    return this.send();
  }

  async sendTemplateMessage(_params: SendTemplateParams): Promise<WhatsAppSendResult> {
    return this.send();
  }

  async sendMediaMessage(_params: SendMediaParams): Promise<WhatsAppSendResult> {
    return this.send();
  }

  async sendCatalogueMessage(_params: SendCatalogueParams): Promise<WhatsAppSendResult> {
    return this.send();
  }

  async getMessageStatus(_providerMessageId: string): Promise<MessageStatusResult | null> {
    // The mock provider has no independent state store - status transitions
    // are driven by the explicit "Simulate Delivered/Read/Failed" demo
    // controls, which update the DB row directly. See whatsapp-messages.ts.
    return null;
  }

  verifyWebhook(_query: URLSearchParams): string | null {
    return null; // mock never receives real webhook verification requests
  }

  verifyWebhookSignature(_rawBody: string, _signatureHeader: string | null): boolean {
    return true; // no signature scheme in mock mode
  }

  parseInboundWebhook(_payload: unknown): ParsedWebhookPayload {
    return { messages: [], statuses: [] };
  }
}
