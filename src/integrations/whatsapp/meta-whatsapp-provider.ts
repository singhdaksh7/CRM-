import { randomUUID } from "crypto";
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
  InboundMessageKind,
  StatusWebhookEvent,
  WhatsAppDiagnosticsResult,
} from "./whatsapp-types";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_SEND_ATTEMPTS = 2; // 1 retry, only for safe/transient failures - never for validation (4xx) errors

const META_STATUS_MAP: Record<string, "SENT" | "DELIVERED" | "READ" | "FAILED"> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

/** HTTP statuses worth a single retry - network hiccups and Meta's own rate limiting, never a client-error (validation) response. */
function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Real WhatsApp Business Cloud API client. Structurally complete (request
 * construction, timeouts, error parsing, webhook verification/parsing,
 * signature validation, one bounded retry for transient failures, a
 * correlation ID on every outbound send) but has NOT been exercised against
 * the live Meta API in this environment - no Meta credentials were
 * available. Wiring this up for a real business account only requires
 * setting the WHATSAPP_* environment variables; no code changes are needed.
 */
export class MetaWhatsAppProvider implements WhatsAppProviderClient {
  readonly name = "META_CLOUD" as const;

  constructor(private config: WhatsAppConfig) {}

  private endpoint(path: string): string {
    return `https://graph.facebook.com/${this.config.apiVersion}/${path}`;
  }

  /** GET helper for read-only diagnostics (health check) - never sends a message, never retries (a single quick check is enough to know if the token/ID is valid). */
  private async get(path: string): Promise<{ ok: boolean; json: unknown; status: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(this.endpoint(path), {
        method: "GET",
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      return { ok: res.ok, json, status: res.status };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async post(body: Record<string, unknown>, correlationId: string, attempt = 1): Promise<{ id: string }> {
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
        // biz_opaque_callback_data is echoed back verbatim on the status
        // webhook for this message - a free correlation mechanism from Meta,
        // used only for log correlation (matching to our own message row
        // still happens via the returned message ID, not this field).
        body: JSON.stringify({ messaging_product: "whatsapp", biz_opaque_callback_data: correlationId, ...body }),
        signal: controller.signal,
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        // Never log the access token or full request body - only the safe bits.
        const errorMessage = (json as { error?: { message?: string } })?.error?.message ?? `Meta API returned HTTP ${res.status}`;
        console.error(`[whatsapp:meta] send failed: correlationId=${correlationId} status=${res.status} attempt=${attempt} message=${errorMessage}`);

        if (isTransientStatus(res.status) && attempt < MAX_SEND_ATTEMPTS) {
          return this.post(body, correlationId, attempt + 1);
        }
        throw new WhatsAppProviderError(this.name, errorMessage, { status: res.status });
      }

      const messageId = (json as { messages?: { id?: string }[] })?.messages?.[0]?.id;
      if (!messageId) {
        throw new WhatsAppProviderError(this.name, "Meta API response did not include a message ID.");
      }
      return { id: messageId };
    } catch (err) {
      if (err instanceof WhatsAppProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        // A timeout is itself a transient failure worth one retry.
        if (attempt < MAX_SEND_ATTEMPTS) return this.post(body, correlationId, attempt + 1);
        throw new WhatsAppProviderError(this.name, `Request to Meta API timed out after ${REQUEST_TIMEOUT_MS}ms`, err);
      }
      throw new WhatsAppProviderError(this.name, "Unexpected error calling Meta API", err);
    } finally {
      clearTimeout(timeout);
    }
  }

  private toE164(phone: string): string {
    const normalized = normalizeIndianPhone(phone, this.config.defaultCountryCode);
    if (!normalized) throw new WhatsAppProviderError(this.name, `"${phone}" is not a valid phone number for the Meta Cloud API.`);
    return normalized;
  }

  async sendTextMessage(params: SendTextParams): Promise<WhatsAppSendResult> {
    const { id } = await this.post(
      {
        to: this.toE164(params.to),
        type: "text",
        text: { body: params.body, preview_url: false },
      },
      randomUUID()
    );
    return { providerMessageId: id, status: "SENT", provider: this.name };
  }

  async sendTemplateMessage(params: SendTemplateParams): Promise<WhatsAppSendResult> {
    // Meta requires pre-approved template components; since no template has
    // been submitted/approved for this demo account, we send the rendered
    // text as the payload shape a real approved template call would take.
    // Template approval itself is gated upstream by
    // whatsapp-templates.ts#assertTemplateApproved before this is ever called.
    const { id } = await this.post(
      {
        to: this.toE164(params.to),
        type: "template",
        template: {
          name: params.templateName,
          language: { code: "en" },
          components: params.variables
            ? [{ type: "body", parameters: Object.values(params.variables).map((text) => ({ type: "text", text })) }]
            : undefined,
        },
      },
      randomUUID()
    );
    return { providerMessageId: id, status: "SENT", provider: this.name };
  }

  async sendMediaMessage(params: SendMediaParams): Promise<WhatsAppSendResult> {
    const { id } = await this.post(
      {
        to: this.toE164(params.to),
        type: "image",
        image: { link: params.mediaUrl, caption: params.caption },
      },
      randomUUID()
    );
    return { providerMessageId: id, status: "SENT", provider: this.name };
  }

  async sendCatalogueMessage(params: SendCatalogueParams): Promise<WhatsAppSendResult> {
    // The Cloud API's native catalogue-message type requires a linked Meta
    // Commerce catalogue, which is out of scope for this MVP; we send the
    // rendered text (including the public catalogue link) as a plain text
    // message instead, which is the documented fallback.
    const { id } = await this.post(
      {
        to: this.toE164(params.to),
        type: "text",
        text: { body: `${params.body}\n\n${params.catalogueUrl}`, preview_url: true },
      },
      randomUUID()
    );
    return { providerMessageId: id, status: "SENT", provider: this.name };
  }

  async getMessageStatus(): Promise<MessageStatusResult | null> {
    // The Cloud API does not expose a "GET message status" endpoint - status
    // updates only arrive via the status webhook, handled in parseInboundWebhook.
    return null;
  }

  async markAsRead(providerMessageId: string): Promise<void> {
    if (!this.config.accessToken || !this.config.phoneNumberId) {
      throw new WhatsAppProviderError(this.name, "Meta Cloud provider is not configured (missing access token or phone number ID).");
    }
    await this.post({ status: "read", message_id: providerMessageId }, randomUUID());
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

  /**
   * Fails CLOSED: if WHATSAPP_APP_SECRET isn't configured, every webhook is
   * rejected rather than silently accepted. env.ts requires WHATSAPP_APP_SECRET
   * whenever WHATSAPP_PROVIDER=META_CLOUD, so this branch should only ever
   * be reachable via a misconfigured deployment that bypassed startup
   * validation - defense in depth, not the primary guard.
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!this.config.appSecret) return false;
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
          const metadata = value?.metadata as { phone_number_id?: string } | undefined;
          const contacts = (value?.contacts as Array<{ wa_id?: string; profile?: { name?: string } }>) ?? [];

          for (const m of (value?.messages as Record<string, unknown>[]) ?? []) {
            const { text, kind, media } = extractInboundText(m);
            const contact = contacts.find((candidate) => candidate.wa_id === String(m.from));
            messages.push({
              externalEventId: `msg_${m.id}`,
              providerMessageId: String(m.id),
              from: String(m.from),
              text,
              kind,
              timestamp: new Date(Number(m.timestamp) * 1000),
              displayName: contact?.profile?.name,
              providerPhoneNumberId: metadata?.phone_number_id,
              media,
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
              errorCode: String(((s.errors as Array<{ code?: number }>)?.[0]?.code) ?? "") || undefined,
              errorMessage: String(((s.errors as Array<{ title?: string }>)?.[0]?.title) ?? "") || undefined,
            });
          }
        }
      }
    } catch (err) {
      console.error("[whatsapp:meta] failed to parse webhook payload", err);
    }

    return { messages, statuses };
  }

  /** Read-only connectivity check - confirms the token/phone-number-id/business-account-id are valid without sending any message. */
  async getDiagnostics(): Promise<WhatsAppDiagnosticsResult> {
    const details: Record<string, string> = { provider: "META_CLOUD", apiVersion: this.config.apiVersion };

    if (!this.config.accessToken || !this.config.phoneNumberId) {
      return { ok: false, details: { ...details, error: "Access token or phone number ID is not configured" } };
    }

    try {
      const phoneRes = await this.get(`${this.config.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`);
      if (!phoneRes.ok) {
        const message = (phoneRes.json as { error?: { message?: string } })?.error?.message ?? `HTTP ${phoneRes.status}`;
        return { ok: false, details: { ...details, phoneNumberStatus: "error", error: message } };
      }
      const phoneJson = phoneRes.json as { verified_name?: string; display_phone_number?: string; quality_rating?: string };
      details.phoneNumberStatus = "ok";
      if (phoneJson.display_phone_number) details.displayPhoneNumber = phoneJson.display_phone_number;
      if (phoneJson.quality_rating) details.qualityRating = phoneJson.quality_rating;
    } catch (err) {
      return { ok: false, details: { ...details, phoneNumberStatus: "error", error: err instanceof Error ? err.message : "Request failed" } };
    }

    if (this.config.businessAccountId) {
      try {
        const wabaRes = await this.get(`${this.config.businessAccountId}?fields=name`);
        details.businessAccountStatus = wabaRes.ok ? "ok" : "error";
      } catch {
        details.businessAccountStatus = "error";
      }
    }

    return { ok: true, details };
  }
}

function extractInboundText(m: Record<string, unknown>): { text: string; kind: InboundMessageKind; media?: InboundWebhookMessage["media"] } {
  const type = String(m.type ?? "text");

  if (type === "text") {
    return { text: String((m.text as { body?: string })?.body ?? ""), kind: "text" };
  }
  if (type === "button") {
    const label = (m.button as { text?: string })?.text;
    return { text: label ? `[Button reply: ${label}]` : "[Button reply]", kind: "button_reply" };
  }
  if (type === "interactive") {
    const interactive = m.interactive as { button_reply?: { title?: string }; list_reply?: { title?: string } } | undefined;
    const label = interactive?.button_reply?.title ?? interactive?.list_reply?.title;
    return { text: label ? `[Reply: ${label}]` : "[Interactive reply]", kind: "interactive_reply" };
  }
  if (type === "image") {
    const media = m.image as { id?: string; mime_type?: string; caption?: string } | undefined;
    return { text: media?.caption ?? "[Image]", kind: "image", media: media?.id ? { id: media.id, mimeType: media.mime_type, caption: media.caption } : undefined };
  }
  if (type === "document") {
    const media = m.document as { id?: string; mime_type?: string; filename?: string; caption?: string } | undefined;
    return { text: media?.caption ?? `[Document${media?.filename ? `: ${media.filename}` : ""}]`, kind: "document", media: media?.id ? { id: media.id, mimeType: media.mime_type, filename: media.filename, caption: media.caption } : undefined };
  }
  // image, video, audio, document, sticker, location, contacts, unknown, etc.
  // - never attempt to fetch/store media while storage remains disabled.
  return { text: `[Unsupported message: ${type}]`, kind: "unsupported" };
}
