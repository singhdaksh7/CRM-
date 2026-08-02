import { describe, it, expect } from "vitest";
import { redact } from "./audit";

describe("redact", () => {
  it("redacts a passwordHash field", () => {
    expect(redact({ name: "Kanchan", passwordHash: "$2a$10$abc" })).toEqual({ name: "Kanchan", passwordHash: "[REDACTED]" });
  });

  it("redacts known secret/token field names case-insensitively", () => {
    const result = redact({ WhatsAppAccessToken: "shh", verifyToken: "shh2", appSecret: "shh3" });
    expect(result).toEqual({ WhatsAppAccessToken: "shh", verifyToken: "[REDACTED]", appSecret: "[REDACTED]" });
  });

  it("leaves ordinary business fields untouched", () => {
    const values = { name: "Ramesh Gupta", phone: "9876543210", amount: 20000 };
    expect(redact(values)).toEqual(values);
  });

  it("passes through null/undefined unchanged", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });
});
