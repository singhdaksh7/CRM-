import type { Lead, User } from "@prisma/client";
import { prisma } from "../prisma";
import { DEMO_ORGANIZATION_ID, demoId } from "./constants";

/** Deterministic, MOCK-only inbox stories. This function persists rows and never calls a provider. */
export async function createDemoPhase8Inbox(leads: Lead[], employees: User[]) {
  const now = new Date();
  const conversations = [
    { id: demoId("wa", 1), leadId: leads[0].id, assignedToId: employees[1].id, phoneNumber: leads[0].phone, displayName: leads[0].clientName, contactState: "LINKED" as const, unreadCount: 2 },
    { id: demoId("wa", 2), leadId: null, assignedToId: null, phoneNumber: "+919900000001", displayName: "Unknown Contact", contactState: "UNKNOWN" as const, unreadCount: 1 },
    { id: demoId("wa", 3), leadId: leads[1].id, assignedToId: employees[2].id, phoneNumber: leads[1].phone, displayName: leads[1].clientName, contactState: "LINKED" as const, unreadCount: 0 },
    { id: demoId("wa", 4), leadId: leads[2].id, assignedToId: null, phoneNumber: leads[2].phone, displayName: leads[2].clientName, contactState: "LINKED" as const, unreadCount: 0 },
  ];
  for (const c of conversations) await prisma.whatsAppConversation.upsert({ where: { id: c.id }, update: c, create: { ...c, organizationId: DEMO_ORGANIZATION_ID, provider: "MOCK", lastMessageAt: now, lastInboundAt: now } });
  const statuses = ["RECEIVED", "SENT", "DELIVERED", "READ", "FAILED", "RECEIVED", "SENT", "DELIVERED", "READ", "RECEIVED"] as const;
  const kinds = ["TEXT", "TEXT", "CATALOGUE", "TEXT", "TEXT", "IMAGE", "TEXT", "TEXT", "TEXT", "DOCUMENT"] as const;
  for (let i = 0; i < 10; i++) {
    const outbound = statuses[i] !== "RECEIVED";
    await prisma.whatsAppMessage.upsert({
      where: { id: demoId("wa-msg", i + 1) }, update: {},
      create: { id: demoId("wa-msg", i + 1), organizationId: DEMO_ORGANIZATION_ID, conversationId: conversations[i % conversations.length].id, direction: outbound ? "OUTBOUND" : "INBOUND", messageType: kinds[i], provider: "MOCK", providerMessageId: `mock_phase8_${i + 1}`, content: kinds[i] === "CATALOGUE" ? "Your client-safe catalogue: https://example.invalid/share/catalogue/demo" : kinds[i] === "IMAGE" ? "[Image]" : kinds[i] === "DOCUMENT" ? "[Document: requirements.pdf]" : `Deterministic Phase 8 message ${i + 1}`, mediaMimeType: kinds[i] === "IMAGE" ? "image/jpeg" : kinds[i] === "DOCUMENT" ? "application/pdf" : null, mediaFilename: kinds[i] === "DOCUMENT" ? "requirements.pdf" : null, status: statuses[i], sentByUserId: outbound ? employees[0].id : null, errorMessage: statuses[i] === "FAILED" ? "Simulated safe failure" : null, sentAt: outbound ? now : null, deliveredAt: statuses[i] === "DELIVERED" || statuses[i] === "READ" ? now : null, readAt: statuses[i] === "READ" ? now : null, failedAt: statuses[i] === "FAILED" ? now : null },
    });
  }
  return { conversations: conversations.length, messages: statuses.length };
}
