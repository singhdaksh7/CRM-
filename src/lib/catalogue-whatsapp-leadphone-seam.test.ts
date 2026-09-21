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

  it("opens the WhatsApp tab synchronously (no await before window.open) so browsers don't block it as a popup", () => {
    // Regression test: window.open() must run as a direct, synchronous result
    // of the click handler. Calling it after an awaited fetch/json() gets
    // silently popup-blocked by Chrome/Safari/Firefox - see proceed() in
    // catalogues-tab.tsx.
    const source = readFileSync(join(__dirname, "../components/catalogues/catalogues-tab.tsx"), "utf8");
    const proceedStart = source.indexOf("function proceed()");
    expect(proceedStart).toBeGreaterThan(-1);
    const openIndex = source.indexOf("window.open(", proceedStart);
    const firstAwaitIndex = source.indexOf("await ", proceedStart);
    expect(openIndex).toBeGreaterThan(-1);
    expect(firstAwaitIndex).toBeGreaterThan(-1);
    expect(openIndex).toBeLessThan(firstAwaitIndex);
  });
});
