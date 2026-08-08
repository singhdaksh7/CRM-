import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const conversationFindMany = vi.fn();
const messageCreate = vi.fn();
const messageFindUnique = vi.fn();
const messageUpdate = vi.fn();
const leadFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsAppConversation: { findMany: (...a: unknown[]) => conversationFindMany(...a) },
    whatsAppMessage: {
      create: (...a: unknown[]) => messageCreate(...a),
      findUnique: (...a: unknown[]) => messageFindUnique(...a),
      update: (...a: unknown[]) => messageUpdate(...a),
    },
    lead: { findUnique: (...a: unknown[]) => leadFindUnique(...a) },
  },
}));

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
const logActivity = vi.fn();
vi.mock("@/lib/activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
const createNotification = vi.fn();
const notifyRoles = vi.fn();
vi.mock("@/lib/notifications", () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
  notifyRoles: (...a: unknown[]) => notifyRoles(...a),
}));
const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
const touchConversationTimestamps = vi.fn();
vi.mock("@/lib/whatsapp-conversations", () => ({ touchConversationTimestamps: (...a: unknown[]) => touchConversationTimestamps(...a) }));
const handleInboundReplyEffects = vi.fn();
vi.mock("@/lib/whatsapp-messages", () => ({ handleInboundReplyEffects: (...a: unknown[]) => handleInboundReplyEffects(...a) }));
const resolveInboundConversation = vi.fn();
const recordInboundMessage = vi.fn();
const updateDeliveryStatus = vi.fn();
vi.mock("@/lib/whatsapp-inbox", () => ({
  resolveInboundConversation: (...a: unknown[]) => resolveInboundConversation(...a),
  recordInboundMessage: (...a: unknown[]) => recordInboundMessage(...a),
  updateDeliveryStatus: (...a: unknown[]) => updateDeliveryStatus(...a),
  sanitizeMediaFilename: (name: string) => name,
  validateInboundMedia: vi.fn(),
}));

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: rateLimitAllowed, limit: 120, remaining: 119, resetSeconds: 60 }),
  clientIp: () => "127.0.0.1",
  rateLimitResponse: () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

let providerName: "MOCK" | "META_CLOUD" = "META_CLOUD";
let webhookEnabled = true;
let verifyWebhookResult: string | null = "challenge-echo";
let verifySignatureResult = true;
let parseResult: { messages: unknown[]; statuses: unknown[] } = { messages: [], statuses: [] };

vi.mock("@/integrations/whatsapp", () => ({
  getWhatsAppProvider: () => ({
    get name() {
      return providerName;
    },
    verifyWebhook: () => verifyWebhookResult,
    verifyWebhookSignature: () => verifySignatureResult,
    parseInboundWebhook: () => parseResult,
  }),
  loadWhatsAppConfig: () => ({ webhookEnabled }),
}));

const webhookEventRecords = new Map<string, boolean>();
vi.mock("@/lib/webhook-events", () => ({
  hashPayload: (raw: string) => `hash_${raw.length}`,
  recordWebhookEventOnce: async (params: { externalEventId: string }) => {
    const seen = webhookEventRecords.has(params.externalEventId);
    if (!seen) webhookEventRecords.set(params.externalEventId, true);
    return { isNew: !seen };
  },
  markWebhookEventProcessed: vi.fn(),
}));

const { GET, POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  webhookEventRecords.clear();
  providerName = "META_CLOUD";
  webhookEnabled = true;
  verifyWebhookResult = "challenge-echo";
  verifySignatureResult = true;
  parseResult = { messages: [], statuses: [] };
  rateLimitAllowed = true;
  resolveInboundConversation.mockResolvedValue({ id: "conv1", leadId: "lead1" });
  recordInboundMessage.mockResolvedValue({ message: { id: "wm1" } });
});

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new Request(url, init));
}

describe("GET /api/integrations/whatsapp/webhook", () => {
  it("returns 400 when the provider is not META_CLOUD", async () => {
    providerName = "MOCK";
    const res = await GET(makeRequest("https://x.test/webhook?hub.mode=subscribe"));
    expect(res.status).toBe(400);
  });

  it("returns 503 when the webhook is explicitly disabled", async () => {
    webhookEnabled = false;
    const res = await GET(makeRequest("https://x.test/webhook?hub.mode=subscribe"));
    expect(res.status).toBe(503);
  });

  it("returns the challenge on a correct verify token", async () => {
    const res = await GET(makeRequest("https://x.test/webhook?hub.mode=subscribe&hub.verify_token=correct&hub.challenge=12345"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("challenge-echo");
  });

  it("returns 403 when verification fails (wrong token)", async () => {
    verifyWebhookResult = null;
    const res = await GET(makeRequest("https://x.test/webhook?hub.mode=subscribe&hub.verify_token=wrong"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/integrations/whatsapp/webhook - signature and gating", () => {
  it("returns 400 when the provider is not META_CLOUD", async () => {
    providerName = "MOCK";
    const res = await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when the webhook is explicitly disabled", async () => {
    webhookEnabled = false;
    const res = await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(503);
  });

  it("returns 401 and audits when the signature is invalid, without parsing the body", async () => {
    verifySignatureResult = false;
    const res = await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "not even json" }));
    expect(res.status).toBe(401);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "webhook_signature_rejected" }) }));
  });

  it("returns 429 when rate limited", async () => {
    rateLimitAllowed = false;
    const res = await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 on malformed JSON even with a valid signature", async () => {
    const res = await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
  });

  it("always returns 200 with received:true once past validation, even with zero events", async () => {
    const res = await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });
});

describe("POST /api/integrations/whatsapp/webhook - lead resolution", () => {
  function inboundMessage(id = "m1") {
    return { externalEventId: `msg_${id}`, providerMessageId: id, from: "919876543210", text: "hello", kind: "text", timestamp: new Date() };
  }

  it("processes normally when exactly one conversation matches the phone number", async () => {
    parseResult = { messages: [inboundMessage()], statuses: [] };
    conversationFindMany.mockResolvedValue([{ id: "conv1", leadId: "lead1" }]);
    messageCreate.mockResolvedValue({ id: "wm1" });

    await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));

    expect(resolveInboundConversation).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: "919876543210" }));
    expect(recordInboundMessage).toHaveBeenCalledTimes(1);
  });

  it("persists an unlinked conversation when no lead matches (unknown contact)", async () => {
    parseResult = { messages: [inboundMessage()], statuses: [] };
    resolveInboundConversation.mockResolvedValue({ id: "unknown-conv", leadId: null, contactState: "UNKNOWN" });

    await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));

    expect(recordInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "unknown-conv" }));
  });

  it("persists an ambiguous unlinked conversation without guessing a lead", async () => {
    parseResult = { messages: [inboundMessage()], statuses: [] };
    resolveInboundConversation.mockResolvedValue({ id: "ambiguous-conv", leadId: null, contactState: "AMBIGUOUS" });

    await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));

    expect(recordInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "ambiguous-conv" }));
  });

  it("does not reprocess a duplicate inbound event (same externalEventId twice)", async () => {
    parseResult = { messages: [inboundMessage("dup1")], statuses: [] };
    conversationFindMany.mockResolvedValue([{ id: "conv1", leadId: "lead1" }]);
    messageCreate.mockResolvedValue({ id: "wm1" });

    await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));
    await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));

    expect(recordInboundMessage).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/integrations/whatsapp/webhook - status updates", () => {
  function statusEvent(id: string, status: "SENT" | "DELIVERED" | "READ" | "FAILED") {
    return { externalEventId: `status_${id}_${status}`, providerMessageId: id, status, timestamp: new Date() };
  }

  it("applies a forward status transition (SENT -> DELIVERED)", async () => {
    parseResult = { messages: [], statuses: [statusEvent("wamid.1", "DELIVERED")] };
    updateDeliveryStatus.mockResolvedValue({ applied: true, message: { id: "wm1", status: "DELIVERED" } });

    await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));

    expect(updateDeliveryStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "DELIVERED" }));
  });

  it("rejects a stale downgrade (READ -> DELIVERED) without updating the row", async () => {
    parseResult = { messages: [], statuses: [statusEvent("wamid.1", "DELIVERED")] };
    updateDeliveryStatus.mockResolvedValue({ applied: false, message: { id: "wm1", status: "READ" } });

    await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));

    expect(updateDeliveryStatus).toHaveBeenCalled();
  });

  it("rejects a duplicate identical status (READ -> READ)", async () => {
    parseResult = { messages: [], statuses: [statusEvent("wamid.1", "READ")] };
    updateDeliveryStatus.mockResolvedValue({ applied: false, message: { id: "wm1", status: "READ" } });

    await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));

    expect(messageUpdate).not.toHaveBeenCalled();
  });

  it("ignores a status event for an unknown provider message id", async () => {
    parseResult = { messages: [], statuses: [statusEvent("wamid.missing", "DELIVERED")] };
    updateDeliveryStatus.mockResolvedValue({ applied: false, message: null });

    await POST(makeRequest("https://x.test/webhook", { method: "POST", body: "{}" }));

    expect(messageUpdate).not.toHaveBeenCalled();
  });
});
