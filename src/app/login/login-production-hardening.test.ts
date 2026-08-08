import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loginSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const knownDemoPasswords = ["Admin@123", "Kanchan@123", "Sagar@123", "Welcome@123"];

describe("production login hardening", () => {
  it("renders only the standard sign-in controls, without quick sign-in", () => {
    expect(loginSource).toContain('Field label="Email Address"');
    expect(loginSource).toContain('Field label="Password"');
    expect(loginSource).toContain("Sign In to CRM");
    expect(loginSource).not.toContain("Quick Sign-In");
    expect(loginSource).not.toContain("DEMO_ACCOUNTS");
  });

  it.each(knownDemoPasswords)("does not bundle the known demo password %s", (password) => {
    expect(loginSource).not.toContain(password);
  });
});
