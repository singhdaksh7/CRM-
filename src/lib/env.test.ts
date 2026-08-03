import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv } from "./env";

const MANAGED_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "R2_SIGNED_URL_EXPIRY_SECONDS",
  "R2_PUBLIC_BASE_URL",
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_STORAGE_BUCKET",
] as const;

const saved: Partial<Record<(typeof MANAGED_KEYS)[number], string>> = {};

beforeEach(() => {
  for (const key of MANAGED_KEYS) saved[key] = process.env[key];
  for (const key of MANAGED_KEYS) delete process.env[key];
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.AUTH_SECRET = "a-sufficiently-long-random-secret-value";
  process.env.NEXTAUTH_URL = "https://example.com";
  process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("validateEnv - STORAGE_PROVIDER=R2", () => {
  function setFullR2() {
    process.env.STORAGE_PROVIDER = "R2";
    process.env.R2_ACCOUNT_ID = "acct123";
    process.env.R2_ACCESS_KEY_ID = "key123";
    process.env.R2_SECRET_ACCESS_KEY = "secret123";
    process.env.R2_BUCKET_NAME = "test-bucket";
  }

  it("passes with a full R2 config via R2_ACCOUNT_ID", () => {
    setFullR2();
    expect(() => validateEnv()).not.toThrow();
  });

  it("passes with a full R2 config via R2_ENDPOINT instead of R2_ACCOUNT_ID", () => {
    setFullR2();
    delete process.env.R2_ACCOUNT_ID;
    process.env.R2_ENDPOINT = "https://custom.example.com";
    expect(() => validateEnv()).not.toThrow();
  });

  it("rejects R2 with no R2_ACCOUNT_ID and no R2_ENDPOINT", () => {
    setFullR2();
    delete process.env.R2_ACCOUNT_ID;
    expect(() => validateEnv()).toThrow(/R2_ACCOUNT_ID/);
  });

  it("rejects R2 missing R2_ACCESS_KEY_ID", () => {
    setFullR2();
    delete process.env.R2_ACCESS_KEY_ID;
    expect(() => validateEnv()).toThrow(/R2_ACCESS_KEY_ID/);
  });

  it("rejects R2 missing R2_SECRET_ACCESS_KEY", () => {
    setFullR2();
    delete process.env.R2_SECRET_ACCESS_KEY;
    expect(() => validateEnv()).toThrow(/R2_SECRET_ACCESS_KEY/);
  });

  it("rejects R2 missing R2_BUCKET_NAME", () => {
    setFullR2();
    delete process.env.R2_BUCKET_NAME;
    expect(() => validateEnv()).toThrow(/R2_BUCKET_NAME/);
  });

  it("rejects an invalid R2_ENDPOINT URL", () => {
    setFullR2();
    process.env.R2_ENDPOINT = "not-a-url";
    expect(() => validateEnv()).toThrow(/R2_ENDPOINT/);
  });

  it("rejects a non-numeric R2_SIGNED_URL_EXPIRY_SECONDS", () => {
    setFullR2();
    process.env.R2_SIGNED_URL_EXPIRY_SECONDS = "not-a-number";
    expect(() => validateEnv()).toThrow(/R2_SIGNED_URL_EXPIRY_SECONDS/);
  });

  it("accepts a numeric R2_SIGNED_URL_EXPIRY_SECONDS", () => {
    setFullR2();
    process.env.R2_SIGNED_URL_EXPIRY_SECONDS = "900";
    expect(() => validateEnv()).not.toThrow();
  });

  it("rejects a half-set R2 config even when STORAGE_PROVIDER is not R2", () => {
    process.env.STORAGE_PROVIDER = "DISABLED";
    process.env.R2_ACCESS_KEY_ID = "key123";
    // R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME intentionally left unset
    expect(() => validateEnv()).toThrow(/R2_BUCKET_NAME/);
  });

  it("never surfaces the actual secret value in a thrown validation error", () => {
    setFullR2();
    delete process.env.R2_BUCKET_NAME;
    process.env.R2_SECRET_ACCESS_KEY = "super-secret-should-not-leak";
    try {
      validateEnv();
      throw new Error("expected validateEnv to throw");
    } catch (err) {
      expect((err as Error).message).not.toContain("super-secret-should-not-leak");
    }
  });
});

describe("validateEnv - STORAGE_PROVIDER=DISABLED (default)", () => {
  it("passes with no storage variables set at all", () => {
    expect(() => validateEnv()).not.toThrow();
  });
});
