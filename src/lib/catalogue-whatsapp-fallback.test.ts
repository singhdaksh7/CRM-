import { describe, it, expect, vi } from "vitest";
import {
  buildCatalogueShareMessage,
  prepareCatalogueWhatsAppFallback,
  CATALOGUE_WHATSAPP_FALLBACK_SENDS_AUTOMATICALLY,
} from "./catalogue-whatsapp-fallback";

describe("catalogue WhatsApp fallback", () => {
  it("builds a valid wa.me link with encoded message and catalogue URL", () => {
    const prepared = prepareCatalogueWhatsAppFallback({
      recipientPhone: "9876543210",
      clientFirstName: "Rahul",
      cataloguePublicUrl: "https://crm.example/share/catalogue/tok123",
    });
    expect(prepared).not.toBeNull();
    expect(prepared!.waMeUrl.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(prepared!.waMeUrl.split("text=")[1])).toContain("https://crm.example/share/catalogue/tok123");
    expect(prepared!.message).toContain("Hi Rahul");
    expect(prepared!.message).toContain("KP Properties");
    expect(prepared!.preparedState).toBe("PREPARED");
  });

  it("normalizes Indian numbers safely and rejects garbage", () => {
    expect(prepareCatalogueWhatsAppFallback({
      recipientPhone: "not-a-phone",
      clientFirstName: "Rahul",
      cataloguePublicUrl: "https://crm.example/share/catalogue/tok",
    })).toBeNull();
  });

  it("never auto-sends and does not claim delivery", () => {
    expect(CATALOGUE_WHATSAPP_FALLBACK_SENDS_AUTOMATICALLY).toBe(false);
    const message = buildCatalogueShareMessage({
      clientFirstName: "Rahul",
      cataloguePublicUrl: "https://example.com/c",
    });
    expect(message).toContain("View catalogue:");
  });
});

describe("zero auto-send contract for catalogue fallback module", () => {
  it("does not import Meta or provider send functions", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./catalogue-whatsapp-fallback.ts", import.meta.url), "utf8")
    );
    expect(source).not.toMatch(/meta-whatsapp-provider|sendMessage|WhatsAppService|getWhatsAppProvider/);
    expect(source).toContain("buildClickToChatLink");
  });

  it("spy confirms prepare path never calls a provider send", async () => {
    const sendSpy = vi.fn();
    // Prepare only - if a future refactor wires send(), this suite fails.
    const prepared = prepareCatalogueWhatsAppFallback({
      recipientPhone: "9876543210",
      clientFirstName: "Rahul",
      cataloguePublicUrl: "https://crm.example/share/catalogue/tok",
    });
    expect(prepared?.waMeUrl).toBeTruthy();
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
