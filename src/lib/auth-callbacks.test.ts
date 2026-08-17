import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Exercises the real Auth.js callbacks by capturing the config object that
 * src/lib/auth.ts hands to NextAuth, rather than asserting on a copy of the
 * logic. `getSessionAuthState` is stubbed so each case can describe exactly
 * what the database says about the user right now.
 */
type JwtCallback = (params: { token: Record<string, unknown>; user?: unknown }) => Promise<Record<string, unknown> | null>;
type SessionCallback = (params: { session: { user: Record<string, unknown> }; token: Record<string, unknown> }) => { user: Record<string, unknown> };
type AuthorizeCallback = (credentials: Record<string, unknown> | undefined, request?: Request) => Promise<unknown>;

let capturedConfig: {
  callbacks: { jwt: JwtCallback; session: SessionCallback };
  providers: { authorize: AuthorizeCallback }[];
};

vi.mock("next-auth", () => ({
  default: (config: typeof capturedConfig) => {
    capturedConfig = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (config: unknown) => config }));

const getSessionAuthState = vi.fn();
const verifyCredentials = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("./session-guard", async () => {
  // The pure predicate is the real one - only the database read is stubbed.
  const actual = await vi.importActual<typeof import("./session-guard")>("./session-guard");
  return { getSessionAuthState, isSessionStillValid: actual.isSessionStillValid };
});
vi.mock("./credential-auth", () => ({ verifyCredentials }));
vi.mock("./rate-limit", () => ({ checkRateLimit, clientIp: () => "203.0.113.5" }));

await import("./auth");

const activeState = { authVersion: 3, status: "ACTIVE", role: "ADMIN" };
const signedInUser = { id: "u1", name: "Sagar", email: "sagar@example.com", role: "FIELD_EXECUTIVE", authVersion: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionAuthState.mockResolvedValue(activeState);
  checkRateLimit.mockResolvedValue({ allowed: true });
  verifyCredentials.mockResolvedValue(signedInUser);
});

describe("jwt callback - sign-in", () => {
  it("stamps id, role and authVersion into a freshly issued token", async () => {
    const token = await capturedConfig.callbacks.jwt({ token: {}, user: signedInUser });
    expect(token).toMatchObject({ id: "u1", role: "FIELD_EXECUTIVE", authVersion: 3 });
  });

  it("does not re-read the database on the sign-in pass", async () => {
    await capturedConfig.callbacks.jwt({ token: {}, user: signedInUser });
    expect(getSessionAuthState).not.toHaveBeenCalled();
  });

  it("never copies a password hash into the token", async () => {
    const token = await capturedConfig.callbacks.jwt({ token: {}, user: { ...signedInUser, passwordHash: "bcrypt:secret" } });
    expect(JSON.stringify(token)).not.toContain("bcrypt:secret");
  });
});

describe("jwt callback - session revocation on subsequent requests", () => {
  it("keeps a token whose version still matches", async () => {
    const token = await capturedConfig.callbacks.jwt({ token: { id: "u1", role: "ADMIN", authVersion: 3 } });
    expect(token).toMatchObject({ id: "u1", authVersion: 3 });
  });

  it("invalidates a token issued before a password reset bumped the version", async () => {
    getSessionAuthState.mockResolvedValue({ ...activeState, authVersion: 4 });
    await expect(capturedConfig.callbacks.jwt({ token: { id: "u1", role: "ADMIN", authVersion: 3 } })).resolves.toBeNull();
  });

  it("invalidates a token issued before a self-service password change", async () => {
    getSessionAuthState.mockResolvedValue({ ...activeState, authVersion: 9 });
    await expect(capturedConfig.callbacks.jwt({ token: { id: "u1", role: "ADMIN", authVersion: 8 } })).resolves.toBeNull();
  });

  it("invalidates every token once an admin disables the account", async () => {
    getSessionAuthState.mockResolvedValue({ authVersion: 4, status: "INACTIVE", role: "ADMIN" });
    await expect(capturedConfig.callbacks.jwt({ token: { id: "u1", role: "ADMIN", authVersion: 4 } })).resolves.toBeNull();
  });

  it("invalidates a token for a deleted user", async () => {
    getSessionAuthState.mockResolvedValue(null);
    await expect(capturedConfig.callbacks.jwt({ token: { id: "gone", role: "ADMIN", authVersion: 3 } })).resolves.toBeNull();
  });

  it("invalidates a token that carries no id at all, without querying", async () => {
    await expect(capturedConfig.callbacks.jwt({ token: { role: "ADMIN", authVersion: 3 } })).resolves.toBeNull();
    expect(getSessionAuthState).not.toHaveBeenCalled();
  });

  it("invalidates a legacy token minted before authVersion existed", async () => {
    await expect(capturedConfig.callbacks.jwt({ token: { id: "u1", role: "ADMIN" } })).resolves.toBeNull();
  });

  it("refreshes the role from the database so an admin's role change takes effect", async () => {
    getSessionAuthState.mockResolvedValue({ ...activeState, role: "FIELD_EXECUTIVE" });
    const token = await capturedConfig.callbacks.jwt({ token: { id: "u1", role: "ADMIN", authVersion: 3 } });
    expect(token).toMatchObject({ role: "FIELD_EXECUTIVE" });
  });

  it("costs exactly one database read per request", async () => {
    await capturedConfig.callbacks.jwt({ token: { id: "u1", role: "ADMIN", authVersion: 3 } });
    expect(getSessionAuthState).toHaveBeenCalledTimes(1);
  });
});

describe("session callback", () => {
  it("exposes only id and role, never authVersion or any secret", () => {
    const session = capturedConfig.callbacks.session({
      session: { user: { name: "Sagar", email: "sagar@example.com" } },
      token: { id: "u1", role: "ADMIN", authVersion: 3 },
    });
    expect(session.user).toMatchObject({ id: "u1", role: "ADMIN" });
    expect(session.user.authVersion).toBeUndefined();
  });
});

describe("credentials authorize", () => {
  const authorize = () => capturedConfig.providers[0].authorize;

  it("rate limits per IP and email before verifying anything", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });
    await expect(authorize()({ email: "Sagar@Example.com", password: "pw" }, new Request("http://localhost"))).resolves.toBeNull();
    expect(checkRateLimit).toHaveBeenCalledWith("login", "203.0.113.5:sagar@example.com");
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("returns null without a lookup when a field is missing", async () => {
    await expect(authorize()({ email: "sagar@example.com" }, new Request("http://localhost"))).resolves.toBeNull();
    expect(verifyCredentials).not.toHaveBeenCalled();
  });

  it("passes through the verified user, authVersion included", async () => {
    await expect(authorize()({ email: "sagar@example.com", password: "pw" }, new Request("http://localhost")))
      .resolves.toMatchObject({ id: "u1", authVersion: 3 });
  });
});
