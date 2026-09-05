import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main, parseArgs } from "./handover-reset";
import { FakeResetDb, type FakeRow } from "../src/lib/handover-reset/test-support/fake-reset-db";
import { HANDOVER_ADMIN_EMAIL, HANDOVER_ORGANIZATION_ID, REQUIRED_EXECUTE_CONFIRMATION } from "../src/lib/handover-reset/constants";
import { DELETION_PLAN } from "../src/lib/handover-reset/deletion-plan";
import type { ResetClient } from "../src/lib/handover-reset/reset";

const ORG = HANDOVER_ORGANIZATION_ID;

function seed(): Record<string, FakeRow[]> {
  const base: Record<string, FakeRow[]> = {
    organization: [{ id: ORG, name: "Delhi Broker CRM" }],
    user: [
      { id: "admin-1", email: HANDOVER_ADMIN_EMAIL, name: "Founder", role: "ADMIN", status: "ACTIVE", organizationId: ORG },
      { id: "emp-1", email: "demo.emp1@kpproperties.demo", name: "Demo", role: "DATA_MANAGER", status: "ACTIVE", organizationId: ORG },
    ],
    propertyPortalConnection: [],
    propertyImage: [],
    document: [],
  };
  for (const step of DELETION_PLAN) base[step.model] = base[step.model] ?? [{ id: `${step.model}-1`, organizationId: ORG }];
  return base;
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  vi.restoreAllMocks();
});

describe("parseArgs - fail closed", () => {
  it("no flags at all resolves to dry-run", () => {
    expect(parseArgs([])).toEqual({ mode: "dry-run" });
  });

  it("--execute alone (no --confirm) resolves to dry-run, not execute", () => {
    expect(parseArgs(["--execute"])).toEqual({ mode: "dry-run" });
  });

  it("--dry-run explicitly resolves to dry-run", () => {
    expect(parseArgs(["--dry-run"])).toEqual({ mode: "dry-run" });
  });

  it("--execute together with --dry-run (contradictory) resolves to dry-run", () => {
    expect(parseArgs(["--execute", "--dry-run", `--confirm=${REQUIRED_EXECUTE_CONFIRMATION}`])).toEqual({ mode: "dry-run" });
  });

  it("--execute plus an unrecognized extra flag resolves to dry-run", () => {
    expect(parseArgs(["--execute", `--confirm=${REQUIRED_EXECUTE_CONFIRMATION}`, "--force"])).toEqual({ mode: "dry-run" });
  });

  it("the one fully-correct combination resolves to execute", () => {
    expect(parseArgs(["--execute", `--confirm=${REQUIRED_EXECUTE_CONFIRMATION}`])).toEqual({ mode: "execute", confirm: REQUIRED_EXECUTE_CONFIRMATION });
  });
});

describe("main() - dry-run performs zero mutations", () => {
  it("with no argv at all", async () => {
    const db = new FakeResetDb(seed());
    await main(db.client as unknown as ResetClient, []);
    expect(db.rowCount("lead")).toBe(1);
    expect(db.hasRow("user", "emp-1")).toBe(true);
  });

  it("with --execute alone (falls back to dry-run)", async () => {
    const db = new FakeResetDb(seed());
    await main(db.client as unknown as ResetClient, ["--execute"]);
    expect(db.rowCount("lead")).toBe(1);
    expect(db.hasRow("user", "emp-1")).toBe(true);
  });
});

describe("main() - execute", () => {
  it("performs the reset when given the one fully-correct flag combination", async () => {
    const db = new FakeResetDb(seed());
    await main(db.client as unknown as ResetClient, ["--execute", `--confirm=${REQUIRED_EXECUTE_CONFIRMATION}`]);
    expect(db.hasRow("user", "admin-1")).toBe(true);
    expect(db.hasRow("user", "emp-1")).toBe(false);
    expect(db.rowCount("lead")).toBe(0);
  });

  it("sets a non-zero exit code and makes zero writes when execute is attempted with the wrong confirm", async () => {
    process.exitCode = undefined;
    const db = new FakeResetDb(seed());
    await main(db.client as unknown as ResetClient, ["--execute", "--confirm=WRONG"]);
    expect(process.exitCode).toBe(1);
    expect(db.rowCount("lead")).toBe(1);
    process.exitCode = undefined;
  });
});
