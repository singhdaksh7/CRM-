import { describe, it, expect, vi, beforeEach } from "vitest";

const whatsAppMessageCreate = vi.fn();
const whatsAppMessageUpdate = vi.fn();
const whatsAppMessageFindUnique = vi.fn();
const whatsAppMessageFindFirst = vi.fn();
const leadUpdate = vi.fn();
const leadFindUnique = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    whatsAppMessage: {
      create: (...a: unknown[]) => whatsAppMessageCreate(...a),
      update: (...a: unknown[]) => whatsAppMessageUpdate(...a),
      findUnique: (...a: unknown[]) => whatsAppMessageFindUnique(...a),
      findFirst: (...a: unknown[]) => whatsAppMessageFindFirst(...a),
    },
    lead: {
      update: (...a: unknown[]) => leadUpdate(...a),
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
    },
  },
}));

vi.mock("./api-auth", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("./organization", () => ({ getOrganizationId: () => "org_default", resolveOrganizationIdForUser: async () => "org_default" }));
const logActivity = vi.fn();
vi.mock("./activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
const createNotification = vi.fn();
vi.mock("./notifications", () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
const recalculateLeadScore = vi.fn();
vi.mock("./scoring", () => ({ recalculateLeadScore: (...a: unknown[]) => recalculateLeadScore(...a) }));
const recordAudit = vi.fn();
vi.mock("./audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

const findOrCreateConversation = vi.fn();
const touchConversationTimestamps = vi.fn();
vi.mock("./whatsapp-conversations", () => ({
  findOrCreateConversation: (...a: unknown[]) => findOrCreateConversation(...a),
  touchConversationTimestamps: (...a: unknown[]) => touchConversationTimestamps(...a),
}));

const sendTextMessage = vi.fn();
const sendTemplateMessage = vi.fn();
const sendCatalogueMessage = vi.fn();
let providerName: "MOCK" | "META_CLOUD" = "META_CLOUD";
vi.mock("@/integrations/whatsapp", () => ({
  getWhatsAppProvider: () => ({
    get name() {
      return providerName;
    },
    sendTextMessage: (...a: unknown[]) => sendTextMessage(...a),
    sendTemplateMessage: (...a: unknown[]) => sendTemplateMessage(...a),
    sendCatalogueMessage: (...a: unknown[]) => sendCatalogueMessage(...a),
  }),
}));

const { sendOutboundMessage, retryMessage } = await import("./whatsapp-messages");
const { ApiError } = await import("./api-auth");

const NOW = new Date("2026-01-15T12:00:00.000Z");

beforeEach(() => {
  whatsAppMessageFindFirst.mockResolvedValue(null);
  vi.clearAllMocks();
  providerName = "META_CLOUD";
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

function conversation(overrides: Partial<{ lastInboundAt: Date | null }> = {}) {
  return { id: "conv1", leadId: "lead1", phoneNumber: "919876543210", lastInboundAt: null, ...overrides };
}

describe("sendOutboundMessage - customer-care window (META_CLOUD only)", () => {
  it("blocks a session TEXT message when the lead has no inbound history", async () => {
    findOrCreateConversation.mockResolvedValue(conversation({ lastInboundAt: null }));
    await expect(sendOutboundMessage({ leadId: "lead1", sentByUserId: "u1", content: "hi" })).rejects.toThrow(ApiError);
    expect(whatsAppMessageCreate).not.toHaveBeenCalled();
  });

  it("blocks a session TEXT message when the last inbound message was more than 24h ago", async () => {
    findOrCreateConversation.mockResolvedValue(conversation({ lastInboundAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000) }));
    await expect(sendOutboundMessage({ leadId: "lead1", sentByUserId: "u1", content: "hi" })).rejects.toThrow(/24 hours/);
  });

  it("allows a session TEXT message when the last inbound message was within 24h", async () => {
    findOrCreateConversation.mockResolvedValue(conversation({ lastInboundAt: new Date(NOW.getTime() - 60 * 60 * 1000) }));
    whatsAppMessageCreate.mockResolvedValue({ id: "msg1" });
    sendTextMessage.mockResolvedValue({ providerMessageId: "wamid.1", status: "SENT", provider: "META_CLOUD" });
    whatsAppMessageUpdate.mockResolvedValue({ id: "msg1", status: "SENT" });

    const result = await sendOutboundMessage({ leadId: "lead1", sentByUserId: "u1", content: "hi" });
    expect(result.message.status).toBe("SENT");
    expect(sendTextMessage).toHaveBeenCalled();
  });

  it("MOCK provider is exempt from the window check entirely", async () => {
    providerName = "MOCK";
    findOrCreateConversation.mockResolvedValue(conversation({ lastInboundAt: null }));
    whatsAppMessageCreate.mockResolvedValue({ id: "msg1" });
    sendTextMessage.mockResolvedValue({ providerMessageId: "mock_1", status: "SENT", provider: "MOCK" });
    whatsAppMessageUpdate.mockResolvedValue({ id: "msg1", status: "SENT" });

    await expect(sendOutboundMessage({ leadId: "lead1", sentByUserId: "u1", content: "hi" })).resolves.toBeTruthy();
  });

  it("records an audit event on successful send", async () => {
    findOrCreateConversation.mockResolvedValue(conversation({ lastInboundAt: new Date(NOW.getTime() - 60 * 60 * 1000) }));
    whatsAppMessageCreate.mockResolvedValue({ id: "msg1" });
    sendTextMessage.mockResolvedValue({ providerMessageId: "wamid.1", status: "SENT", provider: "META_CLOUD" });
    whatsAppMessageUpdate.mockResolvedValue({ id: "msg1", status: "SENT" });

    await sendOutboundMessage({ leadId: "lead1", sentByUserId: "u1", content: "hi" });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "whatsapp_message_sent" }) }));
  });

  it("records an audit event on failed send", async () => {
    findOrCreateConversation.mockResolvedValue(conversation({ lastInboundAt: new Date(NOW.getTime() - 60 * 60 * 1000) }));
    whatsAppMessageCreate.mockResolvedValue({ id: "msg1" });
    sendTextMessage.mockRejectedValue(new Error("boom"));
    whatsAppMessageUpdate.mockResolvedValue({ id: "msg1", status: "FAILED" });
    leadFindUnique.mockResolvedValue({ id: "lead1", clientName: "Rahul", assignedToId: null });

    await sendOutboundMessage({ leadId: "lead1", sentByUserId: "u1", content: "hi" });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ result: "FAILURE", newValues: expect.objectContaining({ event: "whatsapp_message_failed" }) }));
  });
});

describe("sendOutboundMessage - template approval (META_CLOUD only)", () => {
  it("blocks an unapproved/unregistered template before creating a message row", async () => {
    findOrCreateConversation.mockResolvedValue(conversation());
    await expect(
      sendOutboundMessage({ leadId: "lead1", sentByUserId: "u1", content: "Hi", messageType: "TEMPLATE", templateName: "totally_unregistered" })
    ).rejects.toThrow(ApiError);
    expect(whatsAppMessageCreate).not.toHaveBeenCalled();
  });

  it("requires a templateName for a TEMPLATE message", async () => {
    findOrCreateConversation.mockResolvedValue(conversation());
    await expect(sendOutboundMessage({ leadId: "lead1", sentByUserId: "u1", content: "Hi", messageType: "TEMPLATE" })).rejects.toThrow(/templateName/);
  });

  it("MOCK provider is exempt from template approval - sends even an unregistered template name", async () => {
    providerName = "MOCK";
    findOrCreateConversation.mockResolvedValue(conversation());
    whatsAppMessageCreate.mockResolvedValue({ id: "msg1" });
    sendTemplateMessage.mockResolvedValue({ providerMessageId: "mock_1", status: "SENT", provider: "MOCK" });
    whatsAppMessageUpdate.mockResolvedValue({ id: "msg1", status: "SENT" });

    await expect(
      sendOutboundMessage({ leadId: "lead1", sentByUserId: "u1", content: "Hi", messageType: "TEMPLATE", templateName: "anything" })
    ).resolves.toBeTruthy();
  });
});

describe("retryMessage", () => {
  it("only retries a FAILED message", async () => {
    whatsAppMessageFindUnique.mockResolvedValue({ id: "msg1", status: "SENT", conversation: conversation() });
    await expect(retryMessage("msg1", "u1")).rejects.toThrow(/Only failed messages/);
  });

  it("throws 404 for a nonexistent message", async () => {
    whatsAppMessageFindUnique.mockResolvedValue(null);
    await expect(retryMessage("missing", "u1")).rejects.toThrow(ApiError);
  });

  it("links the retry to the original message via metadata.retryOf and records an audit event", async () => {
    whatsAppMessageFindUnique.mockResolvedValue({
      id: "msg1",
      status: "FAILED",
      content: "hi",
      messageType: "TEXT",
      templateName: null,
      metadata: null,
      conversation: conversation({ lastInboundAt: new Date(NOW.getTime() - 60 * 60 * 1000) }),
    });
    findOrCreateConversation.mockResolvedValue(conversation({ lastInboundAt: new Date(NOW.getTime() - 60 * 60 * 1000) }));
    whatsAppMessageCreate.mockResolvedValue({ id: "msg2" });
    sendTextMessage.mockResolvedValue({ providerMessageId: "wamid.retry", status: "SENT", provider: "META_CLOUD" });
    whatsAppMessageUpdate.mockResolvedValue({ id: "msg2", status: "SENT" });

    await retryMessage("msg1", "u1");

    expect(whatsAppMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ metadata: JSON.stringify({ retryOf: "msg1" }) }) })
    );
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "whatsapp_message_retried", retryOf: "msg1" }) }));
  });
});
