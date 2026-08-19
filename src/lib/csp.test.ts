import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, resolveTrustedStorageCspOrigin } from "./csp";

const R2_ORIGIN = "https://4fd436c71901fb085c2c0e3d88cfc820.r2.cloudflarestorage.com";

describe("resolveTrustedStorageCspOrigin", () => {
  it("returns null when STORAGE_PROVIDER is not R2", () => {
    expect(resolveTrustedStorageCspOrigin({ STORAGE_PROVIDER: "DISABLED" })).toBeNull();
    expect(resolveTrustedStorageCspOrigin({ STORAGE_PROVIDER: "FIREBASE", R2_ENDPOINT: R2_ORIGIN })).toBeNull();
    expect(resolveTrustedStorageCspOrigin({})).toBeNull();
  });

  it("derives origin from R2_ENDPOINT when STORAGE_PROVIDER=R2", () => {
    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: R2_ORIGIN,
      })
    ).toBe(R2_ORIGIN);
  });

  it("derives origin from R2_ACCOUNT_ID when endpoint is unset", () => {
    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ACCOUNT_ID: "4fd436c71901fb085c2c0e3d88cfc820",
      })
    ).toBe(R2_ORIGIN);
  });

  it("prefers R2_ENDPOINT over account id", () => {
    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: R2_ORIGIN,
        R2_ACCOUNT_ID: "deadbeef",
      })
    ).toBe(R2_ORIGIN);
  });

  it("rejects malformed or injectable endpoint values", () => {
    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: "https://evil.example; script-src 'none'",
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: "https://attacker.example.com",
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: "http://4fd436c71901fb085c2c0e3d88cfc820.r2.cloudflarestorage.com",
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: "https://user:pass@4fd436c71901fb085c2c0e3d88cfc820.r2.cloudflarestorage.com",
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: `${R2_ORIGIN}/bucket?x=1`,
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ACCOUNT_ID: "not a valid id!!",
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: "not-a-url",
      })
    ).toBeNull();
  });
});

describe("buildContentSecurityPolicy", () => {
  it("includes R2 origin in connect-src and img-src, plus blob:", () => {
    const csp = buildContentSecurityPolicy({
      STORAGE_PROVIDER: "R2",
      R2_ENDPOINT: R2_ORIGIN,
    });

    expect(csp).toContain(`connect-src 'self' ${R2_ORIGIN}`);
    expect(csp).toContain(`img-src 'self' data: blob: https://images.unsplash.com ${R2_ORIGIN}`);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/connect-src[^;]*\*/);
    expect(csp).not.toContain("undefined");
    expect(csp).not.toContain("null");
  });

  it("keeps baseline policy when R2 is not configured", () => {
    const csp = buildContentSecurityPolicy({ STORAGE_PROVIDER: "DISABLED" });

    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("r2.cloudflarestorage.com");
    expect(csp).toContain("img-src 'self' data: blob: https://images.unsplash.com");
    expect(csp).not.toContain("undefined");
    expect(csp.split("; ").every((d) => d.length > 0 && !d.includes("undefined"))).toBe(true);
  });

  it("does not emit a broken directive when endpoint is malicious", () => {
    const csp = buildContentSecurityPolicy({
      STORAGE_PROVIDER: "R2",
      R2_ENDPOINT: "https://evil.example; script-src https://evil.example",
    });

    expect(csp).toBe(buildContentSecurityPolicy({ STORAGE_PROVIDER: "DISABLED" }));
    expect(csp).not.toContain("evil.example");
    expect(csp).not.toMatch(/script-src[^;]*https:\/\/evil/);
  });
});
