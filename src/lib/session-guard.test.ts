import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const findUnique = vi.fn();
vi.mock("./prisma", () => ({ prisma: { user: { findUnique } } }));

const { getSessionAuthState, isSessionStillValid } = await import("./session-guard");

const active = { authVersion: 3, status: "ACTIVE" as const, role: "ADMIN" as const };

beforeEach(() => vi.clearAllMocks());

describe("getSessionAuthState", () => {
  it("reads only the three columns the guard needs - never the password hash", async () => {
    findUnique.mockResolvedValue(active);
    await getSessionAuthState("u1");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { authVersion: true, status: true, role: true },
    });
  });

  it("returns null for a deleted user", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getSessionAuthState("gone")).resolves.toBeNull();
  });

  it("short-circuits an empty id without hitting the database", async () => {
    await expect(getSessionAuthState("")).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("isSessionStillValid", () => {
  it("accepts a token whose version matches an ACTIVE user", () => {
    expect(isSessionStillValid(active, 3)).toBe(true);
  });

  it("rejects a token issued before a password reset or change bumped the version", () => {
    expect(isSessionStillValid(active, 2)).toBe(false);
  });

  it("rejects a token whose version somehow ran ahead of the database", () => {
    expect(isSessionStillValid(active, 4)).toBe(false);
  });

  it.each(["PENDING_SETUP", "INACTIVE"] as const)("rejects a matching version when the account is %s", (status) => {
    expect(isSessionStillValid({ ...active, status }, 3)).toBe(false);
  });

  it("rejects a session for a user row that no longer exists", () => {
    expect(isSessionStillValid(null, 3)).toBe(false);
  });

  it.each([undefined, null, "3", NaN])("rejects a non-numeric token version (%s)", (version) => {
    expect(isSessionStillValid(active, version)).toBe(false);
  });
});
