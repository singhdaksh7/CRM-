import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { canAccess } from "@/lib/permissions";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("PWA manifest content", () => {
  const m = manifest();

  it("is named and configured for a standalone install", () => {
    expect(m.name).toBe("KP Properties CRM");
    expect(m.short_name).toBe("KP CRM");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/dashboard");
    expect(m.scope).toBe("/");
    expect(m.theme_color).toBeTruthy();
    expect(m.background_color).toBeTruthy();
  });

  it("contains no credentials, tokens or user data", () => {
    expect(JSON.stringify(m)).not.toMatch(/token|password|secret|session|bearer|@/i);
  });
});

describe("authentication is still required", () => {
  const proxy = read("proxy.ts");

  it("keeps the install page behind the sign-in redirect (not in the public allow-list)", () => {
    expect(proxy).not.toMatch(/settings\/install/);
    expect(proxy).toMatch(/if \(!req\.auth\)[\s\S]*\/login/);
  });

  it("only exposes manifest, service worker, offline shell and icons publicly", () => {
    const pwaBlock = proxy.slice(proxy.indexOf("Phase 4 - PWA"));
    expect(pwaBlock).toContain("/manifest.webmanifest");
    expect(pwaBlock).toContain("/sw.js");
    expect(pwaBlock).toContain("/offline.html");
    expect(pwaBlock).toContain("/api/pwa/");
  });

  it("re-checks the session in the install page itself", () => {
    expect(read("app/(app)/settings/install/page.tsx")).toMatch(/if \(!session\) redirect\("\/login"\)/);
  });

  it("opens the install page to every role without opening the rest of /settings", () => {
    for (const role of ["ADMIN", "DATA_MANAGER", "FIELD_EXECUTIVE"] as const) {
      expect(canAccess(role, "/settings/install")).toBe(true);
    }
    expect(canAccess("FIELD_EXECUTIVE", "/settings")).toBe(false);
    expect(canAccess("DATA_MANAGER", "/settings/installer")).toBe(false);
  });
});

describe("offline cache configuration", () => {
  const sw = read("../public/sw.js");

  it("excludes /api from interception and never references sensitive data routes", () => {
    expect(sw).toMatch(/startsWith\("\/api\/"\)\) return;/);
    for (const route of ["leads", "properties", "customers", "whatsapp", "reports", "documents"]) {
      expect(sw).not.toContain(`/${route}`);
    }
  });

  it("keeps API responses no-store at the HTTP layer", () => {
    expect(read("../next.config.ts")).toMatch(/\/api\/:path\*[\s\S]*no-store/);
  });
});
