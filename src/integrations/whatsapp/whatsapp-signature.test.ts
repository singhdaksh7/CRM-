import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyMetaSignature } from "./whatsapp-signature";

const APP_SECRET = "test-app-secret";

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

describe("verifyMetaSignature", () => {
  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyMetaSignature(body, sign(body), APP_SECRET)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyMetaSignature(body, sign(body, "wrong-secret"), APP_SECRET)).toBe(false);
  });

  it("rejects a payload whose body was tampered with after signing", () => {
    const original = JSON.stringify({ amount: 100 });
    const signature = sign(original);
    const tampered = JSON.stringify({ amount: 100000 });
    expect(verifyMetaSignature(tampered, signature, APP_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyMetaSignature("body", null, APP_SECRET)).toBe(false);
  });

  it("rejects a malformed signature header (wrong scheme)", () => {
    expect(verifyMetaSignature("body", "md5=abc123", APP_SECRET)).toBe(false);
  });

  it("rejects a signature header with no value", () => {
    expect(verifyMetaSignature("body", "sha256=", APP_SECRET)).toBe(false);
  });
});
