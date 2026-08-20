import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  cspDirectiveSources,
  resolveTrustedStorageCspOrigin,
  resolveTrustedStorageCspOrigins,
  resolveTrustedStorageVirtualHostCspOrigin,
} from "./csp";

const ACCOUNT_ID = "4fd436c71901fb085c2c0e3d88cfc820";
const BUCKET = "kp-crm-media-prod";
const R2_ENDPOINT_ORIGIN = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const R2_VIRTUAL_HOST_ORIGIN = `https://${BUCKET}.${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const PROD_ENV = {
  STORAGE_PROVIDER: "R2",
  R2_ENDPOINT: R2_ENDPOINT_ORIGIN,
  R2_ACCOUNT_ID: ACCOUNT_ID,
  R2_BUCKET_NAME: BUCKET,
};

describe("resolveTrustedStorageCspOrigin", () => {
  it("returns null when STORAGE_PROVIDER is not R2", () => {
    expect(resolveTrustedStorageCspOrigin({ STORAGE_PROVIDER: "DISABLED" })).toBeNull();
    expect(resolveTrustedStorageCspOrigin({ STORAGE_PROVIDER: "FIREBASE", R2_ENDPOINT: R2_ENDPOINT_ORIGIN })).toBeNull();
    expect(resolveTrustedStorageCspOrigin({})).toBeNull();
  });

  it("derives origin from R2_ENDPOINT when STORAGE_PROVIDER=R2", () => {
    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: R2_ENDPOINT_ORIGIN,
      })
    ).toBe(R2_ENDPOINT_ORIGIN);
  });

  it("derives origin from R2_ACCOUNT_ID when endpoint is unset", () => {
    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ACCOUNT_ID: ACCOUNT_ID,
      })
    ).toBe(R2_ENDPOINT_ORIGIN);
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
        R2_ENDPOINT: `http://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: `https://user:pass@${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: `${R2_ENDPOINT_ORIGIN}/bucket?x=1`,
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

describe("resolveTrustedStorageVirtualHostCspOrigin", () => {
  it("builds exact bucket virtual-host origin from account + bucket", () => {
    expect(resolveTrustedStorageVirtualHostCspOrigin(PROD_ENV)).toBe(R2_VIRTUAL_HOST_ORIGIN);
  });

  it("can derive account id from R2_ENDPOINT when R2_ACCOUNT_ID is absent", () => {
    expect(
      resolveTrustedStorageVirtualHostCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ENDPOINT: R2_ENDPOINT_ORIGIN,
        R2_BUCKET_NAME: BUCKET,
      })
    ).toBe(R2_VIRTUAL_HOST_ORIGIN);
  });

  it("rejects injectable/invalid bucket or account values", () => {
    expect(
      resolveTrustedStorageVirtualHostCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ACCOUNT_ID: ACCOUNT_ID,
        R2_BUCKET_NAME: "evil; script-src",
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageVirtualHostCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ACCOUNT_ID: ACCOUNT_ID,
        R2_BUCKET_NAME: "../etc",
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageVirtualHostCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ACCOUNT_ID: "not valid!!",
        R2_BUCKET_NAME: BUCKET,
      })
    ).toBeNull();

    expect(
      resolveTrustedStorageVirtualHostCspOrigin({
        STORAGE_PROVIDER: "R2",
        R2_ACCOUNT_ID: ACCOUNT_ID,
        R2_BUCKET_NAME: "UPPERCASE",
      })
    ).toBeNull();
  });
});

describe("buildContentSecurityPolicy", () => {
  it("includes endpoint + virtual-host origins in connect-src and img-src, plus blob:", () => {
    const csp = buildContentSecurityPolicy(PROD_ENV);
    const connect = cspDirectiveSources(csp, "connect-src");
    const img = cspDirectiveSources(csp, "img-src");

    expect(connect).toEqual(["'self'", R2_ENDPOINT_ORIGIN, R2_VIRTUAL_HOST_ORIGIN]);
    expect(img).toEqual(["'self'", "data:", "blob:", "https://images.unsplash.com", R2_ENDPOINT_ORIGIN, R2_VIRTUAL_HOST_ORIGIN]);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/connect-src[^;]*\*/);
    expect(csp).not.toContain("undefined");
    expect(csp).not.toContain("null");
    expect(resolveTrustedStorageCspOrigins(PROD_ENV)).toEqual([R2_ENDPOINT_ORIGIN, R2_VIRTUAL_HOST_ORIGIN]);
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
      R2_BUCKET_NAME: "evil;drop",
      R2_ACCOUNT_ID: "zzz",
    });

    expect(csp).toBe(buildContentSecurityPolicy({ STORAGE_PROVIDER: "DISABLED" }));
    expect(csp).not.toContain("evil.example");
    expect(csp).not.toMatch(/script-src[^;]*https:\/\/evil/);
  });
});
