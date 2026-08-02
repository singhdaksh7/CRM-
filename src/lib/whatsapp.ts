import type { Property } from "@prisma/client";
import { formatINR } from "./utils";

/**
 * WhatsApp integration adapter.
 *
 * MVP mode ("mock") builds a wa.me click-to-chat link with a prefilled
 * message - no API keys required. Swapping WHATSAPP_API_MODE=live later
 * routes `sendMessage()` through the official WhatsApp Business Cloud API
 * without touching any calling code, since callers only depend on this
 * adapter's interface, not on how the message is actually delivered.
 */

export interface WhatsAppAdapter {
  buildClickToChatLink(phone: string, message: string): string;
  sendMessage(phone: string, message: string): Promise<{ success: boolean; provider: string }>;
}

class MockWhatsAppAdapter implements WhatsAppAdapter {
  buildClickToChatLink(phone: string, message: string): string {
    const cleanPhone = phone.replace(/[^\d]/g, "");
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  async sendMessage() {
    // In mock mode we don't actually deliver anything server-side; the
    // click-to-chat link opens the user's own WhatsApp client instead.
    return { success: true, provider: "mock-click-to-chat" as const };
  }
}

class CloudApiWhatsAppAdapter implements WhatsAppAdapter {
  buildClickToChatLink(phone: string, message: string): string {
    const cleanPhone = phone.replace(/[^\d]/g, "");
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }

  async sendMessage(phone: string, message: string) {
    const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) {
      throw new Error("WhatsApp Cloud API credentials not configured");
    }
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/[^\d]/g, ""),
        type: "text",
        text: { body: message },
      }),
    });
    return { success: res.ok, provider: "whatsapp-cloud-api" as const };
  }
}

export function getWhatsAppAdapter(): WhatsAppAdapter {
  return process.env.WHATSAPP_API_MODE === "live" ? new CloudApiWhatsAppAdapter() : new MockWhatsAppAdapter();
}

export function buildPropertyShareMessage(params: {
  clientName: string;
  bhk?: number | null;
  location: string;
  budget: string;
  properties: Property[];
  brokerageCompanyName?: string;
  baseUrl: string;
}): string {
  const { clientName, bhk, location, budget, properties, baseUrl } = params;
  const brokerageCompanyName = params.brokerageCompanyName ?? "Delhi Broker CRM";

  const lines: string[] = [];
  lines.push(`Hello ${clientName},`);
  lines.push("");
  lines.push(
    `Based on your requirement for a ${bhk ? bhk + " BHK" : ""} property in ${location} within a budget of ${budget}, we have shortlisted the following options:`
  );
  lines.push("");
  properties.forEach((p, i) => {
    const price = p.listingType === "RENT" ? formatINR(p.monthlyRent, { suffix: "month" }) : formatINR(p.salePrice, { compact: true });
    lines.push(`${i + 1}. ${p.title}`);
    lines.push(`   Location: ${p.area}, Delhi`);
    lines.push(`   Rent/Price: ${price}`);
    lines.push(`   Furnishing: ${p.furnishing.replace("_", " ")}`);
    lines.push(`   Property Link: ${baseUrl}/p/${p.id}`);
    lines.push("");
  });
  lines.push("Please review these options and let us know which properties you would like to visit.");
  lines.push("");
  lines.push("Regards,");
  lines.push(brokerageCompanyName);
  return lines.join("\n");
}
