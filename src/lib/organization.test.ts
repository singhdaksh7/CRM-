import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const findUnique = vi.fn();
vi.mock("./prisma", () => ({ prisma: { user: { findUnique } } }));

const { getOrganizationId, resolveOrganizationIdForUser, getSystemOrganizationId, DEFAULT_ORGANIZATION_ID } = await import("./organization");

describe("getOrganizationId - interactive, session-based resolution", () => {
  it("returns the session user's organizationId", () => {
    expect(getOrganizationId({ organizationId: "org_a" })).toBe("org_a");
  });

  it("fails closed (throws) for a null/undefined session user, never defaulting", () => {
    expect(() => getOrganizationId(null)).toThrow();
    expect(() => getOrganizationId(undefined)).toThrow();
  });

  it("fails closed (throws) for a session user with an empty organizationId", () => {
    expect(() => getOrganizationId({ organizationId: "" })).toThrow();
  });

  it("never returns DEFAULT_ORGANIZATION_ID as a fallback for a missing org", () => {
    try {
      getOrganizationId({ organizationId: null });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain(DEFAULT_ORGANIZATION_ID);
    }
  });
});

describe("resolveOrganizationIdForUser - internal bare-userId resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the user's real organizationId via one indexed lookup", async () => {
    findUnique.mockResolvedValue({ organizationId: "org_b" });
    await expect(resolveOrganizationIdForUser("u1")).resolves.toBe("org_b");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { organizationId: true } });
  });

  it("fails closed for an unknown user id, never defaulting to org_default", async () => {
    findUnique.mockResolvedValue(null);
    await expect(resolveOrganizationIdForUser("gone")).rejects.toThrow();
  });

  it("fails closed for a user row with no organization", async () => {
    findUnique.mockResolvedValue({ organizationId: "" });
    await expect(resolveOrganizationIdForUser("u1")).rejects.toThrow();
  });
});

describe("getSystemOrganizationId - trusted non-interactive system context", () => {
  const ORIGINAL_ENV = process.env.SYSTEM_ORGANIZATION_ID;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.SYSTEM_ORGANIZATION_ID;
    else process.env.SYSTEM_ORGANIZATION_ID = ORIGINAL_ENV;
  });

  it("uses SYSTEM_ORGANIZATION_ID when explicitly configured", () => {
    process.env.SYSTEM_ORGANIZATION_ID = "org_system_configured";
    expect(getSystemOrganizationId()).toBe("org_system_configured");
  });

  it("falls back to DEFAULT_ORGANIZATION_ID only when unset - documents the single-org-job invariant, not a general authorization fallback", () => {
    delete process.env.SYSTEM_ORGANIZATION_ID;
    expect(getSystemOrganizationId()).toBe(DEFAULT_ORGANIZATION_ID);
  });

  it("treats a blank/whitespace-only env value the same as unset", () => {
    process.env.SYSTEM_ORGANIZATION_ID = "   ";
    expect(getSystemOrganizationId()).toBe(DEFAULT_ORGANIZATION_ID);
  });
});
