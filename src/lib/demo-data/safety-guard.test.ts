import { describe, it, expect } from "vitest";
import { checkDemoSeedSafety, REQUIRED_DEMO_SEED_CONFIRMATION } from "./safety-guard";

/**
 * Proves the write gate itself (not just the seed script's import graph):
 * no combination of a missing/partial confirmation can result in
 * `allowed: true` against a production-looking host. checkDemoSeedSafety()
 * is pure and env-injectable, so this never touches process.env or a real
 * database - see scripts/seed-demo.import-safety.test.ts for the
 * end-to-end proof that this gate actually runs before any write when the
 * real script executes.
 */
const PRODUCTION_ENV = { DATABASE_URL: "postgresql://user:pass@my-project.supabase.co:6543/postgres", ALLOW_DEMO_SEED: "true" };
const LOCAL_ENV = { DATABASE_URL: "postgresql://postgres:postgres@localhost:5434/postgres", ALLOW_DEMO_SEED: "true" };

describe("checkDemoSeedSafety", () => {
  it("blocks when DATABASE_URL is not set", () => {
    const result = checkDemoSeedSafety({ ALLOW_DEMO_SEED: "true" } as unknown as NodeJS.ProcessEnv);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("DATABASE_URL is not set");
  });

  it("blocks when ALLOW_DEMO_SEED is not set, even against a local host", () => {
    const result = checkDemoSeedSafety({ DATABASE_URL: LOCAL_ENV.DATABASE_URL } as unknown as NodeJS.ProcessEnv);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("ALLOW_DEMO_SEED=true");
  });

  it("allows a local/docker host once ALLOW_DEMO_SEED=true is set", () => {
    const result = checkDemoSeedSafety(LOCAL_ENV as unknown as NodeJS.ProcessEnv);
    expect(result.allowed).toBe(true);
  });

  it("blocks a production-looking host with neither confirmation env var set", () => {
    const result = checkDemoSeedSafety(PRODUCTION_ENV as unknown as NodeJS.ProcessEnv);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("I_UNDERSTAND_THIS_WRITES_DEMO_DATA_TO_PRODUCTION=true");
    expect(result.reason).toContain(`DEMO_SEED_CONFIRMATION=${REQUIRED_DEMO_SEED_CONFIRMATION}`);
  });

  it("blocks a production-looking host with only ONE of the two required confirmation env vars set", () => {
    const onlyUnderstanding = checkDemoSeedSafety({ ...PRODUCTION_ENV, I_UNDERSTAND_THIS_WRITES_DEMO_DATA_TO_PRODUCTION: "true" } as unknown as NodeJS.ProcessEnv);
    expect(onlyUnderstanding.allowed).toBe(false);

    const onlyConfirmation = checkDemoSeedSafety({ ...PRODUCTION_ENV, DEMO_SEED_CONFIRMATION: REQUIRED_DEMO_SEED_CONFIRMATION } as unknown as NodeJS.ProcessEnv);
    expect(onlyConfirmation.allowed).toBe(false);
  });

  it("blocks a production-looking host when DEMO_SEED_CONFIRMATION doesn't match the exact required value", () => {
    const result = checkDemoSeedSafety({
      ...PRODUCTION_ENV,
      I_UNDERSTAND_THIS_WRITES_DEMO_DATA_TO_PRODUCTION: "true",
      DEMO_SEED_CONFIRMATION: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.allowed).toBe(false);
  });

  it("allows a production-looking host only once BOTH required confirmation env vars are set correctly", () => {
    const result = checkDemoSeedSafety({
      ...PRODUCTION_ENV,
      I_UNDERSTAND_THIS_WRITES_DEMO_DATA_TO_PRODUCTION: "true",
      DEMO_SEED_CONFIRMATION: REQUIRED_DEMO_SEED_CONFIRMATION,
    } as unknown as NodeJS.ProcessEnv);
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("PRODUCTION OVERRIDE ACKNOWLEDGED");
  });

  it("blocks an unrecognized remote host (neither local nor known-production) without DEMO_SEED_ALLOW_REMOTE=true", () => {
    const result = checkDemoSeedSafety({ DATABASE_URL: "postgresql://x@some-random-host.example.com:5432/db", ALLOW_DEMO_SEED: "true" } as unknown as NodeJS.ProcessEnv);
    expect(result.allowed).toBe(false);
  });
});
