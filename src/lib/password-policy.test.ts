import { describe, expect, it } from "vitest";
import { accountSetupPasswordSchema, changePasswordSchema, forgotPasswordSchema, passwordResetSchema } from "./validators";

const pair = (password: string, confirmPassword = password) => ({ password, confirmPassword });

describe("password policy", () => {
  // The same policy must apply everywhere a password is chosen - a weaker
  // rule on any one of these would be the one an attacker targets.
  const schemas = [
    ["account setup", accountSetupPasswordSchema],
    ["password reset", passwordResetSchema],
  ] as const;

  it.each(schemas)("%s accepts an 8-character password", (_label, schema) => {
    expect(schema.safeParse(pair("12345678")).success).toBe(true);
  });

  it.each(schemas)("%s accepts a 128-character password", (_label, schema) => {
    expect(schema.safeParse(pair("x".repeat(128))).success).toBe(true);
  });

  it.each(schemas)("%s rejects 7 characters", (_label, schema) => {
    expect(schema.safeParse(pair("1234567")).success).toBe(false);
  });

  it.each(schemas)("%s rejects 129 characters", (_label, schema) => {
    expect(schema.safeParse(pair("x".repeat(129))).success).toBe(false);
  });

  it.each(schemas)("%s rejects a whitespace-only password that passes a naive length check", (_label, schema) => {
    expect(schema.safeParse(pair("          ")).success).toBe(false);
  });

  it.each(schemas)("%s rejects a mismatched confirmation and points at the right field", (_label, schema) => {
    const result = schema.safeParse(pair("brand-new-password", "something-else"));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
  });

  it("reset and setup share one schema object, so they cannot drift apart", () => {
    expect(passwordResetSchema).toBe(accountSetupPasswordSchema);
  });
});

describe("changePasswordSchema", () => {
  const valid = { currentPassword: "old-password", password: "brand-new-password", confirmPassword: "brand-new-password" };

  it("accepts a well-formed change", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("requires the current password", () => {
    expect(changePasswordSchema.safeParse({ ...valid, currentPassword: "" }).success).toBe(false);
  });

  it("applies the same minimum to the new password", () => {
    expect(changePasswordSchema.safeParse({ ...valid, password: "short1", confirmPassword: "short1" }).success).toBe(false);
  });

  it("applies the same whitespace rule to the new password", () => {
    expect(changePasswordSchema.safeParse({ ...valid, password: "        ", confirmPassword: "        " }).success).toBe(false);
  });

  it("requires the confirmation to match", () => {
    expect(changePasswordSchema.safeParse({ ...valid, confirmPassword: "different" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a normal email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "sagar@example.com" }).success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = forgotPasswordSchema.safeParse({ email: "  sagar@example.com  " });
    expect(result.success && result.data.email).toBe("sagar@example.com");
  });

  it("rejects an empty submission", () => {
    expect(forgotPasswordSchema.safeParse({ email: "   " }).success).toBe(false);
  });

  it("bounds the length so a huge body can't be used as an amplification vector", () => {
    expect(forgotPasswordSchema.safeParse({ email: "x".repeat(400) }).success).toBe(false);
  });
});
