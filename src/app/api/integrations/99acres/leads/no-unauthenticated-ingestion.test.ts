import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

/**
 * Regression guard: a missing/blank environment variable must never turn a
 * 99acres lead-ingestion endpoint into an unauthenticated one.
 */

const prismaTouch = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: new Proxy({}, { get: () => new Proxy({}, { get: () => (...a: unknown[]) => { prismaTouch(...a); return null; } }) }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, limit: 1, remaining: 1, resetSeconds: 1 }), clientIp: () => "203.0.113.9", rateLimitResponse: () => new Response("", { status: 429 }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { POST } = await import("./route");

const apiRoot = join(__dirname, "..", "..", "..");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === "route.ts" ? [full] : [];
  });
}

const call = (headers: Record<string, string>) => POST(new NextRequest(new Request("https://crm.kpproperties.co.in/api/integrations/99acres/leads", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ name: "X", phone: "9811122233" }) })));

describe("no 99acres ingestion endpoint can be unauthenticated", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { delete process.env.ACRES_99_WEBHOOK_SECRET; });

  it.each([["unset", undefined], ["empty", ""], ["whitespace", "   "]])("canonical endpoint refuses everything (503) when ACRES_99_WEBHOOK_SECRET is %s", async (_n, value) => {
    if (value === undefined) delete process.env.ACRES_99_WEBHOOK_SECRET; else process.env.ACRES_99_WEBHOOK_SECRET = value;
    for (const headers of [{}, { authorization: "Bearer " }, { authorization: "Bearer undefined" }, { authorization: "Bearer null" }, { authorization: "Bearer " + value }, { "x-api-key": "" }] as Array<Record<string, string>>) {
      const res = await call(headers);
      expect(res.status).toBe(503);
    }
    expect(prismaTouch).not.toHaveBeenCalled();
  });

  it("the legacy mock route no longer exists", () => {
    expect(existsSync(join(apiRoot, "integrations", "leads", "99acres"))).toBe(false);
  });

  it("every route under api/integrations that mentions 99acres is guarded by the webhook secret", () => {
    const offenders = routeFiles(join(apiRoot, "integrations")).filter((file) => {
      const source = readFileSync(file, "utf8");
      const is99 = /99acres|ACRES_99|NINETY_NINE_ACRES/i.test(file.split("\\").join("/") + source);
      return is99 && !/getAcres99WebhookSecret/.test(source) && !/\.test\.ts$/.test(file);
    });
    expect(offenders.map((f) => f.slice(apiRoot.length))).toEqual([]);
  });

  it("no ingestion route calls the shared lead pipeline without an auth guard", () => {
    const offenders = routeFiles(join(apiRoot, "integrations", "leads")).filter((file) => /ingestWebhookLead/.test(readFileSync(file, "utf8")) && !/requireWebhookApiKey/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
