import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const swSource = fs.readFileSync(path.resolve(__dirname, "../../../public/sw.js"), "utf8");

type Listener = (event: unknown) => void;

/** Runs public/sw.js in a sandbox with a fake cache, reporting what it intercepted and stored. */
function loadWorker() {
  const listeners: Record<string, Listener> = {};
  const cached: string[] = [];
  const cache = {
    addAll: async (urls: string[]) => void cached.push(...urls),
    match: async () => undefined,
    put: async (req: { url: string }) => void cached.push(req.url),
  };
  const sandbox = {
    self: {
      location: { origin: "https://crm.example.test" },
      addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined },
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    URL,
    Response: { error: () => ({}) },
  };
  vm.runInNewContext(swSource, sandbox);

  async function fetchEvent(url: string, init: { method?: string; mode?: string } = {}) {
    let intercepted = false;
    let pending: Promise<unknown> = Promise.resolve();
    listeners.fetch({
      request: { url, method: init.method ?? "GET", mode: init.mode ?? "cors" },
      respondWith: (p: Promise<unknown>) => {
        intercepted = true;
        pending = p;
      },
    });
    await pending.catch(() => {});
    return intercepted;
  }
  return { fetchEvent, cached };
}

const ORIGIN = "https://crm.example.test";

describe("service worker caching safety", () => {
  it("never intercepts API routes, so authenticated JSON is never cached", async () => {
    const sw = loadWorker();
    for (const route of ["/api/leads", "/api/properties?q=1", "/api/whatsapp/send", "/api/auth/session", "/api/reports/export", "/api/customers/1"]) {
      expect(await sw.fetchEvent(`${ORIGIN}${route}`)).toBe(false);
    }
    expect(sw.cached.filter((u) => u.includes("/api/"))).toEqual([]);
  });

  it("never intercepts non-GET requests", async () => {
    const sw = loadWorker();
    expect(await sw.fetchEvent(`${ORIGIN}/api/leads`, { method: "POST" })).toBe(false);
    expect(await sw.fetchEvent(`${ORIGIN}/_next/static/a.js`, { method: "POST" })).toBe(false);
  });

  it("never intercepts cross-origin requests", async () => {
    const sw = loadWorker();
    expect(await sw.fetchEvent("https://other.example/_next/static/a.js")).toBe(false);
  });

  it("does not store HTML page navigations (they carry customer data)", async () => {
    const sw = loadWorker();
    await sw.fetchEvent(`${ORIGIN}/leads`, { mode: "navigate" });
    await sw.fetchEvent(`${ORIGIN}/dashboard`, { mode: "navigate" });
    expect(sw.cached.filter((u) => /\/leads|\/dashboard/.test(u))).toEqual([]);
  });

  it("caches only content-hashed static assets", async () => {
    const sw = loadWorker();
    expect(await sw.fetchEvent(`${ORIGIN}/_next/static/chunks/app.js`)).toBe(true);
    expect(sw.cached).toContain(`${ORIGIN}/_next/static/chunks/app.js`);
  });

  it("precaches only the offline shell and manifest", () => {
    const shell = swSource.match(/SHELL_URLS = (\[[^\]]*\])/);
    expect(shell).not.toBeNull();
    expect(JSON.parse(shell![1])).toEqual(["/offline.html", "/manifest.webmanifest"]);
  });

  it("contains no credential or token handling", () => {
    expect(swSource).not.toMatch(/token|password|secret|authorization|cookie/i);
  });
});
