import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const auth = vi.fn();
vi.mock("./auth", () => ({ auth }));

describe("getRscSession", () => {
  it("is a zero-argument React cache wrapper over Auth.js, with no TTL or global user store", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./request-auth.ts", import.meta.url), "utf8"));
    expect(source).toContain('import { cache } from "react"');
    expect(source).toContain("cache(async () => auth())");
    expect(source).not.toMatch(/Map|TTL|setTimeout|unstable_cache|cached\(/);
  });
});
