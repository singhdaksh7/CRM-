import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-level assertions on the authentication screens, in the same style as
 * login-production-hardening.test.ts. These files are plain .tsx with no test
 * renderer configured in this repo (vitest runs in a node environment and
 * only picks up .test.ts), so the properties worth locking down are the ones
 * that are visible statically: which controls exist, that no secret is ever
 * rendered, and that the mobile affordances are present.
 */
const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

const loginSource = read("./page.tsx");
const forgotPasswordSource = read("../../components/auth/forgot-password-form.tsx");
const resetPasswordSource = read("../../components/auth/password-reset-form.tsx");
const accountSetupSource = read("../../components/auth/account-setup-form.tsx");
const changePasswordSource = read("../../components/settings/change-password-form.tsx");
const accountControlsSource = read("../../components/employees/account-controls.tsx");
const passwordInputSource = read("../../components/ui/password-input.tsx");
const authCardSource = read("../../components/auth/auth-card.tsx");

const ALL_AUTH_SCREENS: [string, string][] = [
  ["login", loginSource],
  ["forgot password", forgotPasswordSource],
  ["reset password", resetPasswordSource],
  ["account setup", accountSetupSource],
  ["change password", changePasswordSource],
  ["account controls", accountControlsSource],
];

describe("login page", () => {
  it("keeps the standard email/password sign-in controls", () => {
    expect(loginSource).toContain('Field label="Email Address"');
    expect(loginSource).toContain('Field label="Password"');
    expect(loginSource).toContain("Sign In to CRM");
  });

  it("offers a show/hide password toggle", () => {
    expect(loginSource).toContain("PasswordInput");
  });

  it("links to the forgot-password flow", () => {
    expect(loginSource).toContain('href="/forgot-password"');
    expect(loginSource).toContain("Forgot Password?");
  });

  it("shows one generic failure message that cannot distinguish the cause", () => {
    expect(loginSource).toContain("Invalid email or password.");
    expect(loginSource).not.toMatch(/No account found|account is disabled|not yet set up|user does not exist/i);
  });

  it("supports both the setup-success and reset-success banners", () => {
    expect(loginSource).toContain("Password created successfully. You can now sign in.");
    expect(loginSource).toContain("Password updated successfully. Please sign in.");
  });

  it("disables the form while a sign-in is in flight", () => {
    expect(loginSource).toContain("loading={loading}");
    expect(loginSource).toContain("disabled={loading}");
  });

  it("preserves the role-based landing redirects", () => {
    expect(loginSource).toContain('"/executive-dashboard"');
    expect(loginSource).toContain('"/dashboard"');
    expect(loginSource).toContain("FIELD_EXECUTIVE");
  });

  it("still bundles no demo credentials or quick sign-in", () => {
    expect(loginSource).not.toContain("Quick Sign-In");
    expect(loginSource).not.toContain("DEMO_ACCOUNTS");
    for (const password of ["Admin@123", "Kanchan@123", "Sagar@123", "Welcome@123"]) {
      expect(loginSource).not.toContain(password);
    }
  });
});

describe("password visibility toggle", () => {
  it("renders a real password input by default and only reveals on demand", () => {
    expect(passwordInputSource).toContain('type={visible ? "text" : "password"}');
  });

  it("is labelled for screen readers and sized for a thumb", () => {
    expect(passwordInputSource).toContain("aria-label");
    expect(passwordInputSource).toContain("aria-pressed");
    expect(passwordInputSource).toContain("w-11");
  });
});

describe("mobile / PWA friendliness", () => {
  it.each([
    ["login", loginSource],
    ["forgot password", forgotPasswordSource],
  ])("%s uses an email keyboard without autocapitalise", (_label, source) => {
    expect(source).toContain('inputMode="email"');
    expect(source).toContain('autoCapitalize="none"');
  });

  // The forgot-password screen has no password field, so it is not in this list.
  it.each([
    ["login", loginSource],
    ["reset password", resetPasswordSource],
    ["account setup", accountSetupSource],
    ["change password", changePasswordSource],
  ])("%s sets an autoComplete hint so password managers work on a phone", (_label, source) => {
    expect(source).toMatch(/autoComplete="(current|new)-password"/);
  });

  it("signed-out screens share a responsive, phone-first card layout", () => {
    expect(authCardSource).toContain("min-h-screen");
    expect(authCardSource).toContain("max-w-md");
    expect(authCardSource).toContain("px-4");
    expect(authCardSource).toContain("sm:p-8");
  });

  it.each([
    ["forgot password", forgotPasswordSource],
    ["reset password", resetPasswordSource],
  ])("%s renders inside that shared shell", (_label, source) => {
    expect(source).toContain("AuthCard");
  });

  it("the security settings form stacks full width on a phone", () => {
    expect(changePasswordSource).toContain("w-full");
    expect(changePasswordSource).toContain("sm:w-auto");
  });
});

describe("forgot password screen", () => {
  it("shows the exact generic confirmation and nothing account-specific", () => {
    expect(forgotPasswordSource).toContain("If an account exists for this email, password reset instructions are available.");
    expect(forgotPasswordSource).not.toMatch(/we sent|check your inbox|no account/i);
  });

  it("shows the same confirmation even if the request fails", () => {
    expect(forgotPasswordSource).toContain("setSubmitted(true)");
    expect(forgotPasswordSource).toContain("catch");
  });
});

describe("reset password screen", () => {
  it("collects a new password and a confirmation with the 8-128 policy", () => {
    expect(resetPasswordSource).toContain('Field label="New Password"');
    expect(resetPasswordSource).toContain('Field label="Confirm Password"');
    expect(resetPasswordSource).toContain("minLength={8}");
    expect(resetPasswordSource).toContain("maxLength={128}");
  });

  it("redirects to the login page with the reset-success banner", () => {
    expect(resetPasswordSource).toContain("/login?reset=success");
  });

  it("falls back to one generic error for any invalid link", () => {
    expect(resetPasswordSource).toContain("This password reset link is invalid or has expired.");
  });
});

describe("change password screen", () => {
  it("collects current, new and confirmation passwords", () => {
    expect(changePasswordSource).toContain('Field label="Current Password"');
    expect(changePasswordSource).toContain('Field label="New Password"');
    expect(changePasswordSource).toContain('Field label="Confirm New Password"');
  });

  it("re-authenticates so the user is not signed out of their own change", () => {
    expect(changePasswordSource).toContain("signIn(");
  });

  it("clears the password fields from component state after submitting", () => {
    expect(changePasswordSource).toContain("reset()");
  });
});

describe("admin account controls", () => {
  it("offers a setup link only for a pending employee", () => {
    expect(accountControlsSource).toContain('status === "PENDING_SETUP"');
    expect(accountControlsSource).toContain("SetupLinkActions");
  });

  it("offers reset-link and disable only for an active employee", () => {
    expect(accountControlsSource).toContain('status === "ACTIVE"');
    expect(accountControlsSource).toContain("Generate Password Reset Link");
    expect(accountControlsSource).toContain("Disable Account");
  });

  it("offers enable for a disabled employee", () => {
    expect(accountControlsSource).toContain("Enable Account");
  });

  it("offers copy and WhatsApp for the freshly generated link only", () => {
    expect(accountControlsSource).toContain("Copy Reset Link");
    expect(accountControlsSource).toContain("Open WhatsApp");
    expect(accountControlsSource).toContain("resetUrl &&");
  });

  it("opens wa.me for the admin instead of sending anything automatically", () => {
    expect(accountControlsSource).toContain("https://wa.me/?text=");
    expect(accountControlsSource).toContain("Nothing is sent automatically.");
  });

  it("warns that the link cannot be retrieved later", () => {
    expect(accountControlsSource).toMatch(/can’t be retrieved later|cannot be retrieved later/);
  });
});

describe("no secret ever reaches a screen", () => {
  it.each(ALL_AUTH_SCREENS)("%s never renders a password hash or token hash", (_label, source) => {
    expect(source).not.toContain("passwordHash");
    expect(source).not.toContain("tokenHash");
  });

  it.each(ALL_AUTH_SCREENS)("%s never stores a credential in localStorage or a cookie", (_label, source) => {
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("document.cookie");
  });

  it.each(ALL_AUTH_SCREENS)("%s never logs to the console", (_label, source) => {
    expect(source).not.toContain("console.log");
  });
});
