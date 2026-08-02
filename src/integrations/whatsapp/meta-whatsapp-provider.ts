import { normalizeIndianPhone } from "./phone";
import { verifyMetaSignature } from "./whatsapp-signature";
import { WhatsAppProviderError } from "./whatsapp-errors";
import type { WhatsAppConfig } from "./whatsapp-config";
import type {
  WhatsAppProviderClient,
  SendTextParams,
  SendTemplateParams,
  SendMediaParams,
  SendCatalogueParams,
  WhatsAppSendResult,
  MessageStatusResult,
  ParsedWebhookPayload,
  InboundWebhookMessage,
  StatusWebhookEvent,
} from "./whatsapp-types";

const REQUEST_TIMEOUT_MS = 10_000;

const META_STATUS_MAP: Record<string, "SENT" | "DELIVERED" | "READ" | "FAILED"> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

/**
 * Real WhatsApp Business Cloud API client. Structurally complete (request
 * construction, timeouts, error parsing, webhook verification/parsing,
 * signature validation) but has NOT been exercised against the live Meta
 * API in this environment - no Meta credentials were available. Wiring this
 * up for a real business account only requires setting the six
 * WHATSAPP_* environment variables; no code changes are needed.
 */
export class MetaWhatsAppProvider implements WhatsAppProviderClient {
  readonly name = "META_CLOUD" as const;

  constructor(private config: WhatsAppConfig) {}

  private endpoint(path: string): string {
    return `https://graph.facebook.com/${this.config.apiVersion}/${path}`;
  }

  private async post(body: Record<string, unknown>): Promise<{ id: string }> {
    if (!this.config.accessToken || !this.config.phoneNumberId) {
      throw new WhatsAppProviderError(this.name, "Meta Cloud provider is not configured (missing access token or phone number ID).");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(this.endpoint(`${this.config.phoneNumberId}/messages`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
        signal: controller.signal,
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        // Never log the access token or full request body - only the safe bits.
        const errorMessage = json?.error?.message ?? `Meta API returned HTTP ${res.status}`;
        console.error(`[whatsapp:meta] send failed: status=${res.status} message=${errorMessage}`);
        throw new WhatsAppProviderError(this.name, errorMessage, { status: res.status });
      }

      const messageId = json?.messages?.[0]?.id;
      if (!messageId) {
        throw new WhatsAppProviderError(this.name, "Meta API response did not include a message ID.");
      }
      return { id: messageId };
    } catch (err) {
      if (err instanceof WhatsAppProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new WhatsAppProviderError(this.name, `Request to Meta API timed out after ${REQUEST_TIMEOUT_MS}ms`, err);
      }
      throw new WhatsAppProviderError(this.name, "Unexpected error calling Meta API", err);
    } finally {
      clearTimeout(timeout);
    }
  }

  private toE164(phone: string): string {
    const normalized = normalizeIndianPhone(phone);
    if (!normalized) throw new WhatsAppProviderError(this.name, `"${phone}" is not a valid phone number for the Meta Cloud API.`);
    return normalized;
  }

  async sendTextMessage(params: SendTextParams): Promise<WhatsAppSendResult> {
    const { id } = await this.post({
      to: this.toE164(params.to),
      type: "text",
      text: { body: params.body, preview_url: false },
    });
    return { providerMessageId: id, status: "SENT", provider: this.name };
  }

  async sendTemplateMessage(params: SendTemplateParams): Promise<WhatsAppSendResult> {
    // Meta requires pre-approved template components; since no template has
    // been submitted/approved for this demo account, we send the rendered
    // text as the payload shape a real approved template call would take.
    const { id } = await this.post({
      to: this.toE164(params.to),
      type: "template",
      template: {
        name: params.templateName,
        language: { code: "en" },
        components: params.variables
          ? [{ type: "body", parameters: Object.values(params.variables).map((text) => ({ type: "text", text })) }]
          : undefined,
      },
    });
    return { providerMessageId: id, status: "SENT", provider: this.name };
  }

  async sendMediaMessage(params: SendMediaParams): Promise<WhatsAppSendResult> {
    const { id } = await this.post({
      to: this.toE164(params.to),
      type: "image",
      image: { link: params.mediaUrl, caption: params.caption },
    });
    return { providerMessageId: id, status: "SENT", provider: this.name };
  }

  async sendCatalogueMessage(params: SendCatalogueParams): Promise<WhatsAppSendResult> {
    // The Cloud API's native catalogue-message type requires a linked Meta
    // Commerce catalogue, which is out of scope for this MVP; we send the
    // rendered text (including the public catalogue link) as a plain text
    // message instead, which is the documented fallback.
    const { id } = await this.post({
      to: this.toE164(params.to),
      type: "text",
      text: { body: `${params.body}\n\n${params.catalogueUrl}`, preview_url: true },
    });
    return { providerMessageId: id, status: "SENT", provider: this.name };
  }

  async getMessageStatus(): Promise<MessageStatusResult | null> {
    // The Cloud API does not expose a "GET message status" endpoint - status
    // updates only arrive via the status webhook, handled in parseInboundWebhook.
    return null;
  }

  verifyWebhook(query: URLSearchParams): string | null {
    const mode = query.get("hub.mode");
    const token = query.get("hub.verify_token");
    const challenge = query.get("hub.challenge");
    if (mode === "subscribe" && token && this.config.verifyToken && token === this.config.verifyToken) {
      return challenge;
    }
    return null;
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!this.config.appSecret) return true; // no secret configured - signature checking is opt-in
    return verifyMetaSignature(rawBody, signatureHeader, this.config.appSecret);
  }

  parseInboundWebhook(payload: unknown): ParsedWebhookPayload {
    const messages: InboundWebhookMessage[] = [];
    const statuses: StatusWebhookEvent[] = [];

    try {
      const entries = (payload as { entry?: unknown[] })?.entry ?? [];
      for (const entry of entries as Record<string, unknown>[]) {
        const changes = (entry.changes as Record<string, unknown>[]) ?? [];
        for (const change of changes) {
          const value = change.value as Record<string, unknown>;

          for (const m of (value?.messages as Record<string, unknown>[]) ?? []) {
            messages.push({
              externalEventId: `msg_${m.id}`,
              providerMessageId: String(m.id),
              from: String(m.from),
              text: String((m.text as { body?: string })?.body ?? ""),
              timestamp: new Date(Number(m.timestamp) * 1000),
            });
          }

          for (const s of (value?.statuses as Record<string, unknown>[]) ?? []) {
            const mapped = META_STATUS_MAP[String(s.status)];
            if (!mapped) continue;
            statuses.push({
              externalEventId: `status_${s.id}_${s.status}`,
              providerMessageId: String(s.id),
              status: mapped,
              timestamp: new Date(Number(s.timestamp) * 1000),
            });
          }
        }
      }
    } catch (err) {
      console.error("[whatsapp:meta] failed to parse webhook payload", err);
    }

    return { messages, statuses };
  }
}
