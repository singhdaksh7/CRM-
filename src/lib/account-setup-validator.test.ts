import { describe, expect, it } from "vitest";
import { accountSetupPasswordSchema } from "./validators";

describe("accountSetupPasswordSchema", () => {
  it("accepts matching passwords of 8-128 characters", () => expect(accountSetupPasswordSchema.safeParse({ password: "abcdefgh", confirmPassword: "abcdefgh" }).success).toBe(true));
  it("rejects mismatch", () => expect(accountSetupPasswordSchema.safeParse({ password: "abcdefgh", confirmPassword: "abcdefgi" }).success).toBe(false));
  it("rejects short, blank, and overlong passwords", () => {
    for (const password of ["short", "        ", "x".repeat(129)]) expect(accountSetupPasswordSchema.safeParse({ password, confirmPassword: password }).success).toBe(false);
  });
});
