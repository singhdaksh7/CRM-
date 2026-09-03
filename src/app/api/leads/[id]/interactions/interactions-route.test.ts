import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const activityCreate = vi.fn();
const assertLeadAccessible = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: { activity: { create: (...args: unknown[]) => activityCreate(...args) } } }));
vi.mock("@/lib/lead-access", () => ({ assertLeadAccessible: (...args: unknown[]) => assertLeadAccessible(...args) }));
vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireSession: async () => ({ user: { id: "fe_1", organizationId: "org_a", role: "FIELD_EXECUTIVE" } }),
    handleApiError: () => NextResponse.json({ error: "Request failed" }, { status: 400 }),
  };
});

const { POST } = await import("./route");

function request(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/leads/lead_1/interactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  assertLeadAccessible.mockResolvedValue({ id: "lead_1", organizationId: "org_a" });
  activityCreate.mockResolvedValue({ id: "activity_1" });
});

describe("POST /api/leads/[id]/interactions", () => {
  it("records an internal call with organization, actor, outcome, and notes", async () => {
    const res = await POST(request({ type: "CALL", outcome: "Interested", notes: "Asked for a Friday visit" }), { params: Promise.resolve({ id: "lead_1" }) });
    expect(res.status).toBe(201);
    expect(activityCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      organizationId: "org_a", leadId: "lead_1", actorId: "fe_1", type: "PHONE_CALL_MADE",
      description: expect.stringContaining("Outcome: Interested"),
    }) });
  });

  it("does not claim a WhatsApp message was sent externally", async () => {
    const res = await POST(request({ type: "WHATSAPP", notes: "Customer reported they will reply later" }), { params: Promise.resolve({ id: "lead_1" }) });
    expect(res.status).toBe(201);
    expect(activityCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ description: expect.stringContaining("Internal whatsapp logged") }) });
  });

  it("rejects an unsupported interaction type", async () => {
    const res = await POST(request({ type: "AUTO_SEND" }), { params: Promise.resolve({ id: "lead_1" }) });
    expect(res.status).toBe(400);
    expect(activityCreate).not.toHaveBeenCalled();
  });
});
