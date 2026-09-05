import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgs } from "./handover-reset-r2-cleanup";
import { REQUIRED_R2_EXECUTE_CONFIRMATION } from "../src/lib/handover-reset/constants";

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  vi.restoreAllMocks();
});

describe("parseArgs - fail closed", () => {
  it("no flags resolves to dry-run", () => {
    expect(parseArgs([])).toEqual({ mode: "dry-run", keysFile: undefined });
  });

  it("--execute alone (no --confirm) resolves to dry-run", () => {
    expect(parseArgs(["--execute", "--keys-file=keys.json"])).toEqual({ mode: "dry-run", keysFile: "keys.json" });
  });

  it("the one fully-correct combination resolves to execute", () => {
    expect(parseArgs(["--execute", "--keys-file=keys.json", `--confirm=${REQUIRED_R2_EXECUTE_CONFIRMATION}`])).toEqual({
      mode: "execute",
      keysFile: "keys.json",
      confirm: REQUIRED_R2_EXECUTE_CONFIRMATION,
    });
  });
});
