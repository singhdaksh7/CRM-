import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetaWhatsAppProvider } from "./meta-whatsapp-provider";
import { WhatsAppProviderError } from "./whatsapp-errors";
import type { WhatsAppConfig } from "./whatsapp-config";

function baseConfig(overrides: Partial<WhatsAppConfig> = {}): WhatsAppConfig {
  return {
    provider: "META_CLOUD",
    phoneNumberId: "PHONE123",
    businessAccountId: "WABA123",
    accessToken: "test-access-token",
    verifyToken: "test-verify-token",
    appSecret: "test-app-secret",
    apiVersion: "v20.0",
    appUrl: "https://crm.example.com",
    defaultCountryCode: "91",
    webhookEnabled: true,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MetaWhatsAppProvider - sends", () => {
  it("sendTextMessage returns the real Meta message ID on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.ABC123" }] }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    const result = await provider.sendTextMessage({ to: "9876543210", body: "hello" });
    expect(result.providerMessageId).toBe("wamid.ABC123");
    expect(result.status).toBe("SENT");
    expect(result.provider).toBe("META_CLOUD");
  });

  it("includes a correlation id (biz_opaque_callback_data) in the request body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.1" }] }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    await provider.sendTextMessage({ to: "9876543210", body: "hi" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(typeof body.biz_opaque_callback_data).toBe("string");
    expect(body.biz_opaque_callback_data.length).toBeGreaterThan(0);
  });

  it("never includes the access token in the request body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.1" }] }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    await provider.sendTextMessage({ to: "9876543210", body: "hi" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body as string).not.toContain("test-access-token");
  });

  it("sends the access token only via the Authorization header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.1" }] }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    await provider.sendTextMessage({ to: "9876543210", body: "hi" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-access-token");
  });

  it("rejects an invalid phone number before ever calling fetch", async () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    await expect(provider.sendTextMessage({ to: "123", body: "hi" })).rejects.toThrow(WhatsAppProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws WhatsAppProviderError with the (safe) Meta error message on a 4xx response, without retrying", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: { message: "Recipient phone number not in allowed list" } }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    await expect(provider.sendTextMessage({ to: "9876543210", body: "hi" })).rejects.toThrow(/not in allowed list/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on a transient 500 and succeeds on the second attempt", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { message: "Internal error" } })).mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.retry" }] }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    const result = await provider.sendTextMessage({ to: "9876543210", body: "hi" });
    expect(result.providerMessageId).toBe("wamid.retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a 429 rate-limit response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: { message: "Too many requests" } })).mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.retry2" }] }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    const result = await provider.sendTextMessage({ to: "9876543210", body: "hi" });
    expect(result.providerMessageId).toBe("wamid.retry2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the transient failure repeats twice (max attempts)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: { message: "Internal error" } }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    await expect(provider.sendTextMessage({ to: "9876543210", body: "hi" })).rejects.toThrow(WhatsAppProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when Meta's response is 200 but omits a message ID", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    const provider = new MetaWhatsAppProvider(baseConfig());
    await expect(provider.sendTextMessage({ to: "9876543210", body: "hi" })).rejects.toThrow(/message ID/);
  });

  it("sendTemplateMessage builds a template payload with variables mapped to component parameters", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.tmpl" }] }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    await provider.sendTemplateMessage({ to: "9876543210", templateName: "visit_reminder", body: "ignored", variables: { name: "Rahul", time: "5 PM" } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.template.name).toBe("visit_reminder");
    expect(body.template.components[0].parameters).toEqual([{ type: "text", text: "Rahul" }, { type: "text", text: "5 PM" }]);
  });

  it("sendCatalogueMessage appends the catalogue URL as a plain text message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.cat" }] }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    await provider.sendCatalogueMessage({ to: "9876543210", body: "Here are your properties", catalogueUrl: "https://crm.example.com/p/abc" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text.body).toContain("https://crm.example.com/p/abc");
  });
});

describe("MetaWhatsAppProvider - markAsRead", () => {
  it("posts a status:read payload with the provider message id", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, messages: [{ id: "ignored" }] }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    await provider.markAsRead("wamid.XYZ");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.status).toBe("read");
    expect(body.message_id).toBe("wamid.XYZ");
  });
});

describe("MetaWhatsAppProvider - webhook verification", () => {
  it("returns the challenge when mode and token match", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    const query = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "test-verify-token", "hub.challenge": "12345" });
    expect(provider.verifyWebhook(query)).toBe("12345");
  });

  it("returns null when the token does not match", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    const query = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" });
    expect(provider.verifyWebhook(query)).toBeNull();
  });

  it("returns null when hub.challenge is missing even with a correct token", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    const query = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "test-verify-token" });
    expect(provider.verifyWebhook(query)).toBeNull();
  });
});

describe("MetaWhatsAppProvider - signature verification", () => {
  it("fails closed (rejects) when appSecret is not configured, even with a signature header present", () => {
    const provider = new MetaWhatsAppProvider(baseConfig({ appSecret: undefined }));
    expect(provider.verifyWebhookSignature("{}", "sha256=deadbeef")).toBe(false);
  });

  it("rejects a missing signature header when appSecret IS configured", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    expect(provider.verifyWebhookSignature("{}", null)).toBe(false);
  });
});

describe("MetaWhatsAppProvider - parseInboundWebhook", () => {
  function entryWith(value: Record<string, unknown>) {
    return { entry: [{ changes: [{ value }] }] };
  }

  it("parses a plain text message", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    const payload = entryWith({ messages: [{ id: "m1", from: "919876543210", type: "text", text: { body: "Hello" }, timestamp: "1700000000" }] });
    const { messages } = provider.parseInboundWebhook(payload);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ text: "Hello", kind: "text", from: "919876543210" });
  });

  it("parses a button reply with a safe placeholder", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    const payload = entryWith({ messages: [{ id: "m2", from: "919876543210", type: "button", button: { text: "Yes, confirm" }, timestamp: "1700000000" }] });
    const { messages } = provider.parseInboundWebhook(payload);
    expect(messages[0].kind).toBe("button_reply");
    expect(messages[0].text).toContain("Yes, confirm");
  });

  it("parses an interactive list/button reply", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    const payload = entryWith({ messages: [{ id: "m3", from: "919876543210", type: "interactive", interactive: { button_reply: { title: "Reschedule" } }, timestamp: "1700000000" }] });
    const { messages } = provider.parseInboundWebhook(payload);
    expect(messages[0].kind).toBe("interactive_reply");
    expect(messages[0].text).toContain("Reschedule");
  });

  it("parses private image metadata without fetching media", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    const payload = entryWith({ messages: [{ id: "m4", from: "919876543210", type: "image", image: { id: "media123", mime_type: "image/jpeg" }, timestamp: "1700000000" }] });
    const { messages } = provider.parseInboundWebhook(payload);
    expect(messages[0].kind).toBe("image");
    expect(messages[0].text).toBe("[Image]");
    expect(messages[0].media).toEqual({ id: "media123", mimeType: "image/jpeg" });
  });

  it("parses sent/delivered/read/failed status events", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    const payload = entryWith({
      statuses: [
        { id: "wamid.1", status: "delivered", timestamp: "1700000000" },
        { id: "wamid.2", status: "read", timestamp: "1700000001" },
      ],
    });
    const { statuses } = provider.parseInboundWebhook(payload);
    expect(statuses).toHaveLength(2);
    expect(statuses[0].status).toBe("DELIVERED");
    expect(statuses[1].status).toBe("READ");
  });

  it("ignores an unrecognized status string rather than throwing", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    const payload = entryWith({ statuses: [{ id: "wamid.3", status: "deleted", timestamp: "1700000000" }] });
    const { statuses } = provider.parseInboundWebhook(payload);
    expect(statuses).toHaveLength(0);
  });

  it("returns empty arrays (never throws) for a malformed payload", () => {
    const provider = new MetaWhatsAppProvider(baseConfig());
    const { messages, statuses } = provider.parseInboundWebhook({ garbage: true });
    expect(messages).toEqual([]);
    expect(statuses).toEqual([]);
  });
});

describe("MetaWhatsAppProvider - getDiagnostics", () => {
  it("reports ok with safe details on success, never leaking the token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { verified_name: "Delhi Broker", display_phone_number: "+91 98765 00000", quality_rating: "GREEN" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { name: "Delhi Broker WABA" }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    const result = await provider.getDiagnostics();
    expect(result.ok).toBe(true);
    expect(result.details.phoneNumberStatus).toBe("ok");
    expect(result.details.businessAccountStatus).toBe("ok");
    expect(JSON.stringify(result)).not.toContain("test-access-token");
  });

  it("reports not ok when the phone-number lookup fails, without throwing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { message: "Invalid OAuth access token" } }));
    const provider = new MetaWhatsAppProvider(baseConfig());
    const result = await provider.getDiagnostics();
    expect(result.ok).toBe(false);
    expect(result.details.error).toMatch(/Invalid OAuth/);
  });

  it("reports not ok immediately when access token or phone number ID is missing, without calling fetch", async () => {
    const provider = new MetaWhatsAppProvider(baseConfig({ accessToken: undefined }));
    const result = await provider.getDiagnostics();
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
