import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const requireSession = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const invalidateCache = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst, update },
    employeeServiceArea: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock("@/lib/api-auth", () => ({
  requireSession,
  ApiError,
  handleApiError: (error: { status?: number; message: string }) =>
    error instanceof ApiError
      ? Response.json({ error: error.message }, { status: error.status })
      : Response.json({ error: "Validation failed" }, { status: 400 }),
}));
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org1" }));
vi.mock("@/lib/cache", () => ({ invalidateCache }));

const { PATCH } = await import("./route");

const params = () => ({ params: Promise.resolve({ id: "u1" }) });
const request = (body: unknown) =>
  new Request("http://localhost/api/employees/u1", { method: "PATCH", body: JSON.stringify(body) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
  findFirst.mockResolvedValue({ id: "u1", organizationId: "org1", status: "ACTIVE" });
  update.mockResolvedValue({ id: "u1", name: "Updated", status: "ACTIVE" });
});

describe("PATCH /api/employees/[id] - account status is not a plain field", () => {
  it("refuses to disable an employee through the generic profile update", async () => {
    const response = await PATCH(request({ status: "INACTIVE" }), params());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Use the account status controls to enable or disable an employee" });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses to activate a PENDING_SETUP employee whose password was never chosen", async () => {
    findFirst.mockResolvedValueOnce({ id: "u1", organizationId: "org1", status: "PENDING_SETUP" });
    const response = await PATCH(request({ status: "ACTIVE" }), params());
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("allows an ordinary profile update and never writes a status field", async () => {
    const response = await PATCH(request({ name: "Updated Name" }), params());
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("tolerates a no-op status echo that matches the current value", async () => {
    const response = await PATCH(request({ name: "Updated Name", status: "ACTIVE" }), params());
    expect(response.status).toBe(200);
    expect(update.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("still requires ADMIN and stays organization-scoped", async () => {
    await PATCH(request({ name: "Updated Name" }), params());
    expect(requireSession).toHaveBeenCalledWith(["ADMIN"]);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "u1", organizationId: "org1" } });
  });

  it("returns 404 for an employee in another organization", async () => {
    findFirst.mockResolvedValueOnce(null);
    expect((await PATCH(request({ name: "X" }), params())).status).toBe(404);
  });

  it("never returns a password hash", async () => {
    const response = await PATCH(request({ name: "Updated Name" }), params());
    expect(await response.text()).not.toContain("passwordHash");
  });
});
