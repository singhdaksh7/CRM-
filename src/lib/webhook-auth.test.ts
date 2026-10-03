import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("./api-auth", () => ({ ApiError: class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } } }));

const { requireWebhookApiKey } = await import("./webhook-auth");

const req = (key?: string) => new Request("https://x.test/hook", { method: "POST", headers: key === undefined ? {} : { "x-api-key": key } });

afterEach(() => { delete process.env.TEST_HOOK_KEY; });

describe("requireWebhookApiKey fails closed", () => {
  it.each([["unset", undefined], ["empty", ""], ["whitespace", "   "]])("refuses every request (503) when the key env var is %s", (_n, value) => {
    if (value !== undefined) process.env.TEST_HOOK_KEY = value;
    for (const header of [undefined, "", "undefined", "null", "anything"]) {
      expect(() => requireWebhookApiKey(req(header), "TEST_HOOK_KEY")).toThrowError(expect.objectContaining({ status: 503 }));
    }
  });

  it("accepts only the exact key when configured", () => {
    process.env.TEST_HOOK_KEY = "s3cret-value";
    expect(() => requireWebhookApiKey(req("s3cret-value"), "TEST_HOOK_KEY")).not.toThrow();
    for (const bad of [undefined, "", "s3cret-valuE", "s3cret-value "+"x"]) {
      expect(() => requireWebhookApiKey(req(bad), "TEST_HOOK_KEY")).toThrowError(expect.objectContaining({ status: 401 }));
    }
  });
});
