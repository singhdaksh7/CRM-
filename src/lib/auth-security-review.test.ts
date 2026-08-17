import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTH_AUDIT_EVENTS, BCRYPT_COST } from "./auth-events";
import { RATE_LIMITS } from "./rate-limit";
import { redact } from "./audit";

/**
 * Repository-wide guards for the authentication/account lifecycle. These are
 * the invariants that are easy to break later from an unrelated change, and
 * that no single unit test would notice.
 */
const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

const passwordResetSource = read("./password-reset.ts");
const accountLifecycleSource = read("./account-lifecycle.ts");
const credentialAuthSource = read("./credential-auth.ts");
const sessionGuardSource = read("./session-guard.ts");
const importsSource = read("./imports.ts");
const employeesRouteSource = read("../app/api/employees/route.ts");
const employeeDetailRouteSource = read("../app/api/employees/[id]/route.ts");
const resetLinkRouteSource = read("../app/api/employees/[id]/reset-link/route.ts");
const accountStatusRouteSource = read("../app/api/employees/[id]/account-status/route.ts");
const forgotPasswordRouteSource = read("../app/api/forgot-password/route.ts");
const passwordResetRouteSource = read("../app/api/password-reset/[token]/route.ts");
const changePasswordRouteSource = read("../app/api/account/password/route.ts");
const proxySource = read("../proxy.ts");
const employeeListPageSource = read("../app/(app)/employees/page.tsx");
const employeeDetailPageSource = read("../app/(app)/employees/[id]/page.tsx");
const securityPageSource = read("../app/(app)/settings/security/page.tsx");

describe("audit events", () => {
  it("defines every event the lifecycle is required to record", () => {
    expect(Object.keys(AUTH_AUDIT_EVENTS).sort()).toEqual([
      "ACCOUNT_DISABLED",
      "ACCOUNT_ENABLED",
      "ACCOUNT_SETUP_COMPLETED",
      "LOGIN_SUCCESS",
      "PASSWORD_CHANGED",
      "PASSWORD_RESET_COMPLETED",
      "PASSWORD_RESET_LINK_GENERATED",
      "PASSWORD_RESET_REQUESTED",
      "SETUP_LINK_REGENERATED",
    ]);
  });

  it("matches the event strings the pre-existing account-setup flow already writes", () => {
    const accountSetupSource = read("./account-setup.ts");
    expect(accountSetupSource).toContain(AUTH_AUDIT_EVENTS.ACCOUNT_SETUP_COMPLETED);
    expect(accountSetupSource).toContain(AUTH_AUDIT_EVENTS.SETUP_LINK_REGENERATED);
  });

  it("keeps password and token fields on the audit redaction list", () => {
    const redacted = redact({ password: "pw", passwordHash: "bcrypt:x", token: "tok", secret: "s", event: "login_success" });
    expect(redacted).toEqual({
      password: "[REDACTED]",
      passwordHash: "[REDACTED]",
      token: "[REDACTED]",
      secret: "[REDACTED]",
      event: "login_success",
    });
  });

  it("does not audit individual failed logins - rate limiting covers that abuse", () => {
    expect(credentialAuthSource).not.toMatch(/action:\s*"LOGIN"[\s\S]*FAILURE/);
    // The audit write sits after both rejection paths have already returned.
    const auditIndex = credentialAuthSource.indexOf("auditLog.create");
    expect(credentialAuthSource.indexOf("return null", auditIndex)).toBe(-1);
  });
});

describe("bcrypt cost", () => {
  it("matches the cost the rest of the codebase already uses", () => {
    expect(BCRYPT_COST).toBe(10);
    expect(read("./account-setup.ts")).toContain("bcrypt.hash(password, 10)");
    expect(passwordResetSource).toContain("BCRYPT_COST");
  });
});

describe("rate limiting covers every credential surface", () => {
  it.each(["login", "accountSetup", "forgotPassword", "passwordReset", "passwordChange", "accountAdminAction"])(
    "defines a %s limit",
    (rule) => {
      expect(RATE_LIMITS[rule]).toBeDefined();
      expect(RATE_LIMITS[rule].limit).toBeGreaterThan(0);
      expect(RATE_LIMITS[rule].windowSeconds).toBeGreaterThan(0);
    }
  );

  it("keeps the public, unauthenticated forgot-password endpoint the tightest", () => {
    expect(RATE_LIMITS.forgotPassword.limit).toBeLessThanOrEqual(RATE_LIMITS.login.limit);
  });

  it.each([
    ["forgot password", forgotPasswordRouteSource],
    ["password reset", passwordResetRouteSource],
    ["change password", changePasswordRouteSource],
    ["admin reset link", resetLinkRouteSource],
    ["admin setup link", read("../app/api/employees/[id]/setup-link/route.ts")],
    ["admin account status", accountStatusRouteSource],
    ["account setup", read("../app/api/account-setup/[token]/route.ts")],
  ])("%s route calls the shared limiter", (_label, source) => {
    expect(source).toContain("checkRateLimit");
    expect(source).toContain("rateLimitResponse");
  });
});

describe("no secret is ever persisted, returned or logged", () => {
  it("stores only a SHA-256 hash of a reset token", () => {
    expect(passwordResetSource).toContain('createHash("sha256")');
    expect(passwordResetSource).toContain("tokenHash: secret.tokenHash");
    // The plaintext is only ever used to build the one-time URL.
    expect(passwordResetSource).not.toMatch(/data:\s*\{[^}]*token:\s*secret\.token/);
  });

  it.each([
    ["employees list", employeesRouteSource],
    ["employee detail", employeeDetailRouteSource],
    ["reset link", resetLinkRouteSource],
    ["account status", accountStatusRouteSource],
    ["forgot password", forgotPasswordRouteSource],
    ["password reset", passwordResetRouteSource],
    ["change password", changePasswordRouteSource],
  ])("%s route never selects or returns passwordHash", (_label, source) => {
    expect(source).not.toContain("passwordHash: true");
  });

  it.each([
    ["employee list page", employeeListPageSource],
    ["employee detail page", employeeDetailPageSource],
    ["security page", securityPageSource],
  ])("%s never renders a password hash or token hash", (_label, source) => {
    expect(source).not.toContain("passwordHash");
    expect(source).not.toContain("tokenHash");
  });

  it("the security page selects only non-secret columns of the signed-in user's own row", () => {
    expect(securityPageSource).toContain("select: { email: true, status: true, lastLoginAt: true }");
    expect(securityPageSource).toContain("where: { id: session.user.id }");
  });

  it("the session guard reads only the three scalars it needs", () => {
    expect(sessionGuardSource).toContain("select: { authVersion: true, status: true, role: true }");
    expect(sessionGuardSource).not.toContain("passwordHash");
  });

  it.each([
    ["password reset", passwordResetSource],
    ["account lifecycle", accountLifecycleSource],
    ["credential auth", credentialAuthSource],
    ["session guard", sessionGuardSource],
  ])("%s never writes a secret to a log", (_label, source) => {
    expect(source).not.toMatch(/console\.(log|info|warn|error)/);
    expect(source).not.toMatch(/logger\.\w+\([^)]*(password|token)/i);
  });
});

describe("session revocation is wired to all three triggers", () => {
  it("password reset bumps authVersion", () => {
    expect(passwordResetSource).toMatch(/completePasswordReset[\s\S]*authVersion: \{ increment: 1 \}/);
  });

  it("self-service password change bumps authVersion", () => {
    expect(passwordResetSource).toMatch(/changeOwnPassword[\s\S]*authVersion: \{ increment: 1 \}/);
  });

  it("admin disable bumps authVersion", () => {
    expect(accountLifecycleSource).toMatch(/disableEmployeeAccount[\s\S]*authVersion: \{ increment: 1 \}/);
  });

  it("enable does not bump it - restoring access is not a revocation", () => {
    const enableBlock = accountLifecycleSource.slice(accountLifecycleSource.indexOf("export async function enableEmployeeAccount"));
    expect(enableBlock).not.toContain("authVersion");
  });
});

describe("public routes are reachable while signed out", () => {
  it.each(["/forgot-password", "/api/forgot-password", "/reset-password/", "/api/password-reset/"])(
    "%s is on the proxy public list",
    (path) => {
      expect(proxySource).toContain(`"${path}"`);
    }
  );

  it("does not accidentally make an authenticated surface public", () => {
    expect(proxySource).not.toContain('"/api/account/password"');
    expect(proxySource).not.toContain('"/api/employees');
  });
});

describe("imported employees carry no shared default password", () => {
  it("hashes a fresh random value per imported employee", () => {
    const employeeBranch = importsSource.slice(importsSource.indexOf('case "EMPLOYEES": {'));
    expect(employeeBranch).toContain("bcrypt.hash(randomUUID()");
    expect(employeeBranch).toContain('status: "PENDING_SETUP"');
  });

  it("uses the same per-user placeholder approach for manual creation", () => {
    expect(employeesRouteSource).toContain("bcrypt.hash(randomUUID()");
    expect(employeesRouteSource).toContain('status: "PENDING_SETUP"');
  });

  it("bundles no hard-coded default password anywhere in the import or creation paths", () => {
    for (const source of [importsSource, employeesRouteSource]) {
      expect(source).not.toMatch(/Welcome@123|Password@123|changeme|default_password/i);
    }
  });

  it("does not auto-issue a setup link on import - an admin generates one later", () => {
    const employeeBranch = importsSource.slice(importsSource.indexOf('case "EMPLOYEES": {'));
    expect(employeeBranch).not.toContain("accountSetupToken");
  });
});
