import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const getSystemConfig = vi.fn();
const updateSystemConfig = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireSession,
  handleApiError: (error: { status?: number; message: string; issues?: unknown }) => Response.json({ error: error.message }, { status: error.status ?? (error.issues ? 400 : 500) }),
}));
vi.mock("@/lib/organization", () => ({ getOrganizationId: (user: { organizationId: string }) => user.organizationId }));
vi.mock("@/lib/system-config", () => ({ getSystemConfig, updateSystemConfig }));
vi.mock("@/lib/audit", () => ({ recordAudit }));

const { GET, PATCH } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN", organizationId: "org-a" } });
  getSystemConfig.mockResolvedValue({ employeeDirectoryLabel: "Team" });
  updateSystemConfig.mockResolvedValue({ employeeDirectoryLabel: "Employees" });
});

describe("employee directory label API", () => {
  it("returns the current organization's label to any authenticated user", async () => {
    requireSession.mockResolvedValueOnce({ user: { id: "manager-1", role: "DATA_MANAGER", organizationId: "org-b" } });
    getSystemConfig.mockResolvedValueOnce({ employeeDirectoryLabel: "Sales Team" });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(requireSession).toHaveBeenCalledWith();
    expect(getSystemConfig).toHaveBeenCalledWith("org-b");
    await expect(response.json()).resolves.toEqual({ employeeDirectoryLabel: "Sales Team" });
  });

  it("allows an ADMIN to trim and save only their organization's label", async () => {
    const response = await PATCH(new Request("http://localhost/api/organization/employee-directory-label", {
      method: "PATCH", body: JSON.stringify({ employeeDirectoryLabel: "  Employees  " }),
    }) as never);

    expect(response.status).toBe(200);
    expect(requireSession).toHaveBeenCalledWith(["ADMIN"]);
    expect(updateSystemConfig).toHaveBeenCalledWith({ organizationId: "org-a", updatedById: "admin-1", patch: { employeeDirectoryLabel: "Employees" } });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a", newValues: { employeeDirectoryLabel: "Employees" } }));
  });

  it.each(["   ", "x".repeat(41)])("rejects an invalid label", async (employeeDirectoryLabel) => {
    const response = await PATCH(new Request("http://localhost/api/organization/employee-directory-label", {
      method: "PATCH", body: JSON.stringify({ employeeDirectoryLabel }),
    }) as never);

    expect(response.status).toBe(400);
    expect(updateSystemConfig).not.toHaveBeenCalled();
  });

  it("does not update when a non-admin is rejected", async () => {
    requireSession.mockRejectedValueOnce(Object.assign(new Error("Forbidden"), { status: 403 }));

    const response = await PATCH(new Request("http://localhost/api/organization/employee-directory-label", {
      method: "PATCH", body: JSON.stringify({ employeeDirectoryLabel: "Employees" }),
    }) as never);

    expect(response.status).toBe(403);
    expect(updateSystemConfig).not.toHaveBeenCalled();
  });
});
