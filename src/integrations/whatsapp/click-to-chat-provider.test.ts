import { describe, it, expect } from "vitest";
import { ClickToChatWhatsAppProvider } from "./click-to-chat-provider";
import { WhatsAppProviderError } from "./whatsapp-errors";

describe("ClickToChatWhatsAppProvider", () => {
  const provider = new ClickToChatWhatsAppProvider();

  it("builds a correctly encoded wa.me URL with a normalized phone number", async () => {
    const result = await provider.sendTextMessage({ to: "+91 98765-43210", body: "Hello there!" });
    expect(result.clickToChatUrl).toBe("https://wa.me/919876543210?text=Hello%20there!");
  });

  it("never claims delivery - status is always QUEUED, never SENT/DELIVERED/READ", async () => {
    const result = await provider.sendTextMessage({ to: "9876543210", body: "hi" });
    expect(result.status).toBe("QUEUED");
  });

  it("throws for an invalid phone number rather than silently building a broken link", async () => {
    await expect(provider.sendTextMessage({ to: "123", body: "hi" })).rejects.toBeInstanceOf(WhatsAppProviderError);
  });

  it("getMessageStatus always returns null - no delivery receipts are available", async () => {
    expect(await provider.getMessageStatus("ctc_anything")).toBeNull();
  });

  it("builds a catalogue message link containing the catalogue URL as part of the encoded text", async () => {
    const result = await provider.sendCatalogueMessage({ to: "9876543210", body: "Check these out", catalogueUrl: "https://example.com/share/catalogue/abc123" });
    expect(result.clickToChatUrl).toContain(encodeURIComponent("https://example.com/share/catalogue/abc123"));
  });
});
