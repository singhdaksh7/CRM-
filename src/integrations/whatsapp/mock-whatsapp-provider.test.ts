import { describe, it, expect } from "vitest";
import { MockWhatsAppProvider } from "./mock-whatsapp-provider";

describe("MockWhatsAppProvider", () => {
  const provider = new MockWhatsAppProvider();

  it("sends a text message and resolves to SENT with a unique provider message ID", async () => {
    const a = await provider.sendTextMessage({ to: "9876543210", body: "hello" });
    const b = await provider.sendTextMessage({ to: "9876543210", body: "hello again" });
    expect(a.status).toBe("SENT");
    expect(a.provider).toBe("MOCK");
    expect(a.providerMessageId).toMatch(/^mock_/);
    expect(a.providerMessageId).not.toBe(b.providerMessageId);
  });

  it("sends a catalogue message and resolves to SENT", async () => {
    const result = await provider.sendCatalogueMessage({ to: "9876543210", body: "catalogue", catalogueUrl: "https://example.com/c/abc" });
    expect(result.status).toBe("SENT");
  });

  it("sends a template message and resolves to SENT", async () => {
    const result = await provider.sendTemplateMessage({ to: "9876543210", templateName: "welcome", body: "Welcome!" });
    expect(result.status).toBe("SENT");
  });

  it("never makes a real network call (no clickToChatUrl, no rawResponse from an HTTP client)", async () => {
    const result = await provider.sendTextMessage({ to: "9876543210", body: "hi" });
    expect(result.clickToChatUrl).toBeUndefined();
  });

  it("getMessageStatus always returns null - status is driven by explicit simulate-status calls, not polling", async () => {
    expect(await provider.getMessageStatus("mock_anything")).toBeNull();
  });

  it("accepts webhook signature verification unconditionally (no real webhooks in mock mode)", () => {
    expect(provider.verifyWebhookSignature("body", null)).toBe(true);
  });

  it("never verifies a real webhook challenge", () => {
    expect(provider.verifyWebhook(new URLSearchParams())).toBeNull();
  });
});
