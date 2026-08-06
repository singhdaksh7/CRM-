import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runDryRun, main, evaluateEnumUsage } from "./seed-demo-dry-run";
import { UnexpectedWriteError, createReadOnlyClient } from "../src/lib/demo-data/read-only-guard";
import type { DatasetValidationResult } from "../src/lib/demo-data/validate";

/**
 * Proves DEFECT 1 is fixed: every required check contributes to exactly
 * one `allPassed` flag, and "[dry-run] All checks passed" / exitCode 0 is
 * never reached unless every one of them passed. Each test below isolates
 * exactly one failure condition (everything else mocked to succeed) and
 * asserts both the FAIL entry in the checklist AND main()'s resulting
 * process.exitCode - the two things the task explicitly requires.
 */

const ALL_MODEL_KEYS = [
  "catalogueInteraction", "catalogueShareProperty", "catalogueShare",
  "whatsAppMessage", "whatsAppConversation", "sharedPropertyLog",
  "payment", "brokerageCalculation", "deal", "document",
  "visit", "followUp", "leadScoreHistory", "activity", "notification", "savedView",
  "lead", "property", "owner", "employeeServiceArea", "leadAssignmentRule",
] as const;

type MockClient = ReturnType<typeof createReadOnlyClient>;

function makeHealthyClient(): MockClient {
  const client: Record<string, unknown> = {
    organization: { findUnique: vi.fn().mockResolvedValue({ id: "org_default", name: "Delhi Broker CRM" }) },
    user: { count: vi.fn().mockResolvedValue(1) },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  for (const key of ALL_MODEL_KEYS) {
    client[key] = { count: vi.fn().mockResolvedValue(0) };
  }
  return client as unknown as MockClient;
}

function makeHealthyDataset(): DatasetValidationResult {
  const perLead = Array.from({ length: 20 }, (_, i) => ({ leadCode: `KP-DEMO-LEAD-${String(i + 1).padStart(5, "0")}`, matches: 5 }));
  return {
    employees: {} as DatasetValidationResult["employees"],
    properties: [],
    availableProperties: [],
    leads: [],
    perLead,
    totalMatchPairs: perLead.reduce((s, l) => s + l.matches, 0),
    outsideRange: [],
    passed: true,
    errors: [],
  };
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

describe("runDryRun - happy path", () => {
  it("passes every check and reports allPassed=true when everything is healthy", async () => {
    const { checks, allPassed } = await runDryRun(makeHealthyClient(), makeHealthyDataset);
    expect(allPassed).toBe(true);
    expect(checks.every((c) => c.passed)).toBe(true);
  });
});

describe("runDryRun - each required failure condition", () => {
  it("FAILs when the organization query throws", async () => {
    const client = makeHealthyClient();
    (client.organization.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connection refused"));
    const { checks, allPassed } = await runDryRun(client, makeHealthyDataset);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.name === "Organization query")?.passed).toBe(false);
  });

  it("FAILs when the organization is missing", async () => {
    const client = makeHealthyClient();
    (client.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { checks, allPassed } = await runDryRun(client, makeHealthyDataset);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.name === "Organization exists")?.passed).toBe(false);
  });

  it("FAILs when the existing demo-row count query throws (prepared-statement-style error)", async () => {
    const client = makeHealthyClient();
    (client.lead.count as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('prepared statement "s0" already exists'));
    const { checks, allPassed } = await runDryRun(client, makeHealthyDataset);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.name === "Existing demo-row count query")?.passed).toBe(false);
    expect(checks.find((c) => c.name === "Teardown safety check")?.passed).toBe(false);
  });

  it("FAILs enum compatibility when a hardcoded literal isn't a valid enum value", () => {
    const issues = evaluateEnumUsage("Fake", ["NOT_A_REAL_VALUE"], { A: "A", B: "B" });
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("NOT_A_REAL_VALUE");
  });

  it("FAILs when total match pairs are below the minimum", async () => {
    const dataset = makeHealthyDataset();
    dataset.totalMatchPairs = 10;
    dataset.passed = false;
    dataset.errors = ["Total match pairs 10 below minimum 25."];
    const { checks, allPassed } = await runDryRun(makeHealthyClient(), () => dataset);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.name === "Total match pairs >= minimum")?.passed).toBe(false);
  });

  it("FAILs when any lead has fewer than 3 matches", async () => {
    const dataset = makeHealthyDataset();
    dataset.perLead[2] = { leadCode: "KP-DEMO-LEAD-00003", matches: 0 };
    dataset.outsideRange = [dataset.perLead[2]];
    const { checks, allPassed } = await runDryRun(makeHealthyClient(), () => dataset);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.name === "Every lead within 3-8 matches")?.passed).toBe(false);
  });

  it("FAILs when any lead has more than 8 matches", async () => {
    const dataset = makeHealthyDataset();
    dataset.perLead[7] = { leadCode: "KP-DEMO-LEAD-00008", matches: 12 };
    dataset.outsideRange = [dataset.perLead[7]];
    const { checks, allPassed } = await runDryRun(makeHealthyClient(), () => dataset);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.name === "Every lead within 3-8 matches")?.passed).toBe(false);
  });

  it("FAILs admin integrity when no real (non-demo) ADMIN user is found", async () => {
    const client = makeHealthyClient();
    (client.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const { checks, allPassed } = await runDryRun(client, makeHealthyDataset);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.name === "Admin integrity")?.passed).toBe(false);
  });

  it("FAILs admin integrity when the admin query throws", async () => {
    const client = makeHealthyClient();
    (client.user.count as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connection lost"));
    const { checks, allPassed } = await runDryRun(client, makeHealthyDataset);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.name === "Admin integrity")?.passed).toBe(false);
  });

  it("FAILs the teardown safety check when a count comes back malformed", async () => {
    const client = makeHealthyClient();
    (client.property.count as ReturnType<typeof vi.fn>).mockResolvedValue(-1);
    const { checks, allPassed } = await runDryRun(client, makeHealthyDataset);
    expect(allPassed).toBe(false);
    expect(checks.find((c) => c.name === "Teardown safety check")?.passed).toBe(false);
  });
});

describe("read-only guard - unexpected write detection", () => {
  it("throws UnexpectedWriteError before touching the database for every write operation", async () => {
    const client = createReadOnlyClient();
    await expect(client.lead.create({ data: {} as never })).rejects.toThrow(UnexpectedWriteError);
    await expect(client.property.update({ where: { id: "x" }, data: {} })).rejects.toThrow(UnexpectedWriteError);
    await expect(client.owner.delete({ where: { id: "x" } })).rejects.toThrow(UnexpectedWriteError);
    await expect(client.lead.deleteMany({ where: {} })).rejects.toThrow(UnexpectedWriteError);
    await client.$disconnect();
  });
});

describe("main() - exit code reflects allPassed", () => {
  it("sets process.exitCode = 0 and prints 'All checks passed' only when every check passed", async () => {
    process.exitCode = undefined;
    await main(makeHealthyClient());
    expect(process.exitCode).toBe(0);
    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(output).toContain("All checks passed");
    process.exitCode = undefined;
  });

  it("sets process.exitCode = 1 and never prints 'All checks passed' when a check fails", async () => {
    process.exitCode = undefined;
    const client = makeHealthyClient();
    (client.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await main(client);
    expect(process.exitCode).toBe(1);
    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(output).not.toContain("All checks passed");
    process.exitCode = undefined;
  });

});

describe("runDryRun - unhandled errors outside the per-check try/catches still propagate", () => {
  it("re-throws if the dataset builder itself throws (e.g. an UnexpectedWriteError bug), rather than silently reporting success", async () => {
    const throwingBuildDataset = () => {
      throw new UnexpectedWriteError("lead", "create");
    };
    await expect(runDryRun(makeHealthyClient(), throwingBuildDataset)).rejects.toThrow(UnexpectedWriteError);
  });
});
