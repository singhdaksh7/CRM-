import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const compose = readFileSync(join(root, "docker-compose.prod.yml"), "utf8");
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");

/** Slice of the compose file for one service (up to the next 2-space-indented key or top-level key). */
function serviceBlock(name: string): string {
  const start = compose.indexOf(`\n  ${name}:\n`);
  expect(start).toBeGreaterThan(-1);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n(  [a-z]+:\n|[a-z]+:\n)/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("upload persistence across kp-crm container recreation (by configuration)", () => {
  it("the crm container writes no uploads to local disk: no volumes/bind mounts, media lives in R2", () => {
    const crm = serviceBlock("crm");
    expect(crm).not.toMatch(/^\s{4}volumes:/m);
    expect(crm).toMatch(/STORAGE_PROVIDER/); // build arg so the CSP knows the R2 origins
    expect(dockerfile).not.toMatch(/public\/uploads|VOLUME\s/);
  });

  it("stateful services keep named volumes that survive recreation", () => {
    expect(serviceBlock("postgres")).toMatch(/pgdata:\/var\/lib\/postgresql\/data/);
    expect(compose).toMatch(/volumes:\n\s+pgdata:\n\s+name: kp_pgdata/);
  });

  it("no route handler writes uploads to the local filesystem", () => {
    const hits = execSync(`grep -rlE "writeFile|createWriteStream|public/uploads" src/app --include=*.ts || true`, { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !f.endsWith(".test.ts"));
    expect(hits).toEqual([]);
  });
});
