import { describe, it, expect } from "vitest";
import { hashPayload } from "./webhook-events";

describe("hashPayload", () => {
  it("produces a stable hash for the same input", () => {
    const body = JSON.stringify({ a: 1, b: 2 });
    expect(hashPayload(body)).toBe(hashPayload(body));
  });

  it("produces different hashes for different input", () => {
    expect(hashPayload("a")).not.toBe(hashPayload("b"));
  });

  it("produces a 64-character hex sha256 digest", () => {
    expect(hashPayload("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
