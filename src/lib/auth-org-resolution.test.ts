import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Two-organization authentication test (org-resolution root-cause fix).
//
// Exercises the REAL Auth.js callbacks (src/lib/auth.ts, captured the same
// way auth-callbacks.test.ts does) end-to-end for two independent
// organizations, proving:
//   1. USER_A's session resolves organizationId = ORG_A.
//   2. USER_B's session resolves organizationId = ORG_B.
//   3. Neither session ever resolves to the other's org, or to the literal
//      "org_default" stub value that predates this fix.
//   4. getOrganizationId() (src/lib/organization.ts) only ever reads
//      session.user.organizationId - it cannot be overridden by any other
//      field a caller might smuggle onto the object (simulating a client
//      trying to inject organizationId via a body/query param that got
//      merged onto something resembling a session object).
//   5. An authenticated user whose own account has no organization
//      association is denied (fails closed), never falls back to a
//      default tenant.
//   6. An authenticated user whose account was moved to a DIFFERENT
//      organization since their token was issued picks up the new org on
//      the very next request (the per-request DB re-check), rather than
//      keeping stale access to the old one.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

type JwtCallback = (params: { token: Record<string, unknown>; user?: unknown }) => Promise<Record<string, unknown> | null>;
type SessionCallback = (params: { session: { user: Record<string, unknown> }; token: Record<string, unknown> }) => { user: Record<string, unknown> };

let capturedConfig: { callbacks: { jwt: JwtCallback; session: SessionCallback } };

vi.mock("next-auth", () => ({
  default: (config: typeof capturedConfig) => {
    capturedConfig = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (config: unknown) => config }));

const getSessionAuthState = vi.fn();
vi.mock("./session-guard", async () => {
  const actual = await vi.importActual<typeof import("./session-guard")>("./session-guard");
  return { getSessionAuthState, isSessionStillValid: actual.isSessionStillValid };
});
vi.mock("./credential-auth", () => ({ verifyCredentials: vi.fn() }));
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn(), clientIp: () => "203.0.113.5" }));

await import("./auth");
const { getOrganizationId } = await import("./organization");

const ORG_A = "org_a";
const ORG_B = "org_b";

const USER_A = { authVersion: 1, status: "ACTIVE" as const, role: "ADMIN" as const, organizationId: ORG_A };
const USER_B = { authVersion: 1, status: "ACTIVE" as const, role: "FIELD_EXECUTIVE" as const, organizationId: ORG_B };

async function resolveSessionFor(userId: string, dbState: { authVersion: number; status: "ACTIVE"; role: string; organizationId: string }) {
  getSessionAuthState.mockResolvedValueOnce(dbState);
  const token = await capturedConfig.callbacks.jwt({ token: { id: userId, authVersion: dbState.authVersion } });
  expect(token).not.toBeNull();
  return capturedConfig.callbacks.session({
    session: { user: { name: "x", email: "x@example.com" } },
    token: token as Record<string, unknown>,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("two-organization authentication", () => {
  it("USER_A's session resolves ORG_A and USER_B's session resolves ORG_B, never crossed or defaulted", async () => {
    const sessionA = await resolveSessionFor("user-a", USER_A);
    const sessionB = await resolveSessionFor("user-b", USER_B);

    expect(getOrganizationId(sessionA.user)).toBe(ORG_A);
    expect(getOrganizationId(sessionB.user)).toBe(ORG_B);
    expect(getOrganizationId(sessionA.user)).not.toBe(ORG_B);
    expect(getOrganizationId(sessionB.user)).not.toBe(ORG_A);
    expect(getOrganizationId(sessionA.user)).not.toBe("org_default");
    expect(getOrganizationId(sessionB.user)).not.toBe("org_default");
  });

  it("getOrganizationId reads ONLY session.user.organizationId - a client-controlled field with the same name elsewhere on the object cannot override it", async () => {
    const sessionA = await resolveSessionFor("user-a", USER_A);
    // Simulates a request handler that spreads untrusted query/body data
    // onto an object before this call - organizationId here must still
    // come from the trusted session field, not from smuggled input.
    const tampered: { organizationId?: string | null; queryParams: { organizationId: string } } = {
      organizationId: sessionA.user.organizationId as string,
      queryParams: { organizationId: ORG_B },
    };
    expect(getOrganizationId(tampered)).toBe(ORG_A);
  });

  it("fails closed: an authenticated user whose account has no organization is denied, never defaulted to org_default", async () => {
    const orphanUser = { authVersion: 1, status: "ACTIVE" as const, role: "ADMIN" as const, organizationId: "" };
    getSessionAuthState.mockResolvedValueOnce(orphanUser);
    const token = await capturedConfig.callbacks.jwt({ token: { id: "user-orphan", authVersion: 1 } });
    // isSessionStillValid() fails closed on empty organizationId - jwt
    // callback returns null, which Auth.js treats as an invalidated session.
    expect(token).toBeNull();
  });

  it("fails closed: an unknown/deleted user id never resolves to any organization", async () => {
    getSessionAuthState.mockResolvedValueOnce(null);
    const token = await capturedConfig.callbacks.jwt({ token: { id: "user-gone", authVersion: 1 } });
    expect(token).toBeNull();
  });

  it("picks up an organization change on the very next request rather than keeping stale access", async () => {
    const sessionBefore = await resolveSessionFor("user-a", USER_A);
    expect(getOrganizationId(sessionBefore.user)).toBe(ORG_A);

    // Admin moves this user to a different organization between requests -
    // the per-request DB re-check (not a cached/long-lived claim) must
    // reflect that immediately.
    const movedUser = { ...USER_A, organizationId: ORG_B };
    const sessionAfter = await resolveSessionFor("user-a", movedUser);
    expect(getOrganizationId(sessionAfter.user)).toBe(ORG_B);
  });
});
