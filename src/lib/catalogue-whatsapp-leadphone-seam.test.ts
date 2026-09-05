import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { prepareCatalogueWhatsAppFallback } from "./catalogue-whatsapp-fallback";

/**
 * Integration seam: LeadPhone picker selects a number, then this helper
 * prepares a wa.me link. Never calls Meta send.
 */
describe("LeadPhone → catalogue WhatsApp fallback seam", () => {
  it("accepts an explicitly selected LeadPhone number", () => {
    const prepared = prepareCatalogueWhatsAppFallback({
      recipientPhone: "9876543210", // selected from LeadPhonePicker
      clientFirstName: "Rahul",
      cataloguePublicUrl: "https://crm.example/share/catalogue/abc",
    });
    expect(prepared?.waMeUrl).toContain("https://wa.me/919876543210?text=");
    expect(prepared?.preparedState).toBe("PREPARED");
  });

  it("catalogues-tab wires Open WhatsApp & Send without provider send", () => {
    const source = readFileSync(join(__dirname, "../components/catalogues/catalogues-tab.tsx"), "utf8");
    expect(source).toContain("Open WhatsApp");
    expect(source).toContain("/whatsapp-link");
    expect(source).not.toContain('fetch("/api/catalogues/whatsapp-fallback"');
    expect(source).not.toMatch(/sendOutboundMessage|sendCatalogueMessage|META_CLOUD/);
  });
});
