import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const findUnique = vi.fn();
const compare = vi.fn();
vi.mock("./prisma", () => ({ prisma: { user: { findUnique } } }));
vi.mock("bcryptjs", () => ({ default: { compare } }));
const { verifyCredentials } = await import("./credential-auth");

const user = { id: "u1", name: "Sagar", email: "sagar@example.com", role: "FIELD_EXECUTIVE", passwordHash: "hash", status: "ACTIVE" };
beforeEach(() => { vi.clearAllMocks(); findUnique.mockResolvedValue(user); compare.mockResolvedValue(true); });

describe("verifyCredentials", () => {
  it("allows an active account with a valid password", async () => expect(verifyCredentials("SAGAR@example.com", "valid")).resolves.toMatchObject({ id: "u1" }));
  it.each(["PENDING_SETUP", "INACTIVE"])("rejects %s before checking a password", async (status) => {
    findUnique.mockResolvedValueOnce({ ...user, status });
    await expect(verifyCredentials(user.email, "valid")).resolves.toBeNull();
    expect(compare).not.toHaveBeenCalled();
  });
  it("rejects an invalid password", async () => { compare.mockResolvedValueOnce(false); await expect(verifyCredentials(user.email, "bad")).resolves.toBeNull(); });
});
