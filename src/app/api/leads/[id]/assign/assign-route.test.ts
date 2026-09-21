import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const userFindFirst = vi.fn();
const leadFindFirst = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();
const transaction = vi.fn(async (callback: (tx: { lead: { update: typeof leadUpdate }; activity: { create: typeof activityCreate } }) => unknown) => callback({
  lead: { update: leadUpdate },
  activity: { create: activityCreate },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: (...args: unknown[]) => userFindFirst(...args) },
    lead: { findFirst: (...args: unknown[]) => leadFindFirst(...args) },
    $transaction: transaction,
  },
}));

let sessionUser = { id: "admin-1", name: "Admin", role: "ADMIN" };
const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error { constructor(public status: number, message: string) { super(message); } }
  return { MockApiError };
});
vi.mock("@/lib/api-auth", () => ({
  ApiError: MockApiError,
  requireSession: (roles?: string[]) => {
    if (roles && !roles.includes(sessionUser.role)) throw new MockApiError(403, "Forbidden");
    return Promise.resolve({ user: sessionUser });
  },
  handleApiError: (error: unknown) => error instanceof MockApiError
    ? NextResponse.json({ error: error.message }, { status: error.status })
    : NextResponse.json({ error: "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org-a" }));
const createNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({ createNotification: (...args: unknown[]) => createNotification(...args) }));
const loggerError = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { error: (...args: unknown[]) => loggerError(...args) } }));

const { POST } = await import("./route");

function request(body: unknown) {
  return new NextRequest(new Request("https://crm.test/api/leads/lead-1/assign", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}
const context = { params: Promise.resolve({ id: "lead-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin-1", name: "Admin", role: "ADMIN" };
  userFindFirst.mockResolvedValue({ id: "fe-1", name: "Field Executive", role: "FIELD_EXECUTIVE" });
  leadFindFirst.mockResolvedValue({ id: "lead-1" });
  leadUpdate.mockResolvedValue({ id: "lead-1", leadCode: "L-1", clientName: "Client", assignedToId: "fe-1", assignedTo: { id: "fe-1", name: "Field Executive" } });
  activityCreate.mockResolvedValue({ id: "activity-1" });
  createNotification.mockResolvedValue({ id: "notification-1" });
});

describe("POST /api/leads/[id]/assign", () => {
  it("returns the UI contract after atomically updating the lead and timeline", async () => {
    const response = await POST(request({ assignedToId: "fe-1" }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, lead: { assignedToId: "fe-1", assignedTo: { id: "fe-1", name: "Field Executive" } } });
    expect(transaction).toHaveBeenCalledOnce();
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assignedToId: "fe-1" }) }));
    expect(activityCreate).toHaveBeenCalledOnce();
    expect(createNotification).toHaveBeenCalledOnce();
  });

  it("still reports success when the optional notification fails after the committed assignment", async () => {
    createNotification.mockRejectedValue(new Error("notification unavailable"));

    const response = await POST(request({ assignedToId: "fe-1" }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, lead: { assignedToId: "fe-1" } });
    expect(loggerError).toHaveBeenCalledWith("lead_assignment_notification_failed", expect.objectContaining({ leadId: "lead-1" }));
  });

  it("rejects a missing or invalid field executive before any assignment write", async () => {
    const missing = await POST(request({}), context);
    expect(missing.status).toBe(400);

    userFindFirst.mockResolvedValue(null);
    const invalid = await POST(request({ assignedToId: "other-org-user" }), context);
    expect(invalid.status).toBe(404);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a lead outside the manager's organization before any assignment write", async () => {
    leadFindFirst.mockResolvedValue(null);
    const response = await POST(request({ assignedToId: "fe-1" }), context);
    expect(response.status).toBe(404);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects non-manager roles", async () => {
    sessionUser = { id: "fe-2", name: "Other FE", role: "FIELD_EXECUTIVE" };
    const response = await POST(request({ assignedToId: "fe-1" }), context);
    expect(response.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });
});
