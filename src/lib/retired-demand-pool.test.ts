import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRetiredDemandPoolApi } from "./retired-demand-pool";

describe("isRetiredDemandPoolApi", () => {
  it("retires the Demand Pool customer API tree", () => {
    expect(isRetiredDemandPoolApi("/api/customers")).toBe(true);
    expect(isRetiredDemandPoolApi("/api/customers/stats")).toBe(true);
    expect(isRetiredDemandPoolApi("/api/customers/analytics")).toBe(true);
    expect(isRetiredDemandPoolApi("/api/customers/import/preview")).toBe(true);
    expect(isRetiredDemandPoolApi("/api/customers/req-1")).toBe(true);
    expect(isRetiredDemandPoolApi("/api/customers/requirements/req-1/matches")).toBe(true);
    expect(isRetiredDemandPoolApi("/api/customers/requirements/req-1/convert-to-lead")).toBe(true);
  });

  it("does not retire property Best Matching Leads", () => {
    expect(isRetiredDemandPoolApi("/api/properties/prop_1/matches")).toBe(false);
    expect(isRetiredDemandPoolApi("/api/properties/ckprop/matches")).toBe(false);
  });

  it("does not retire the explicit recommendation lifecycle used by Best Matching Leads", () => {
    expect(isRetiredDemandPoolApi("/api/recommendations/rec_1/prepare")).toBe(false);
    expect(isRetiredDemandPoolApi("/api/recommendations/rec_1/mark-sent")).toBe(false);
    expect(isRetiredDemandPoolApi("/api/recommendations/rec_1/respond")).toBe(false);
  });

  it("is the rule proxy.ts actually applies, so property matches cannot be blanket-retired again", () => {
    const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
    expect(proxy).toContain("isRetiredDemandPoolApi(pathname)");
    expect(proxy).not.toContain('pathname.startsWith("/api/recommendations")');
    expect(proxy).not.toContain("/api/properties/");
  });

  it("does not treat a lookalike path as the customer workspace", () => {
    expect(isRetiredDemandPoolApi("/api/customers-export")).toBe(false);
    expect(isRetiredDemandPoolApi("/api/properties/prop_1")).toBe(false);
    expect(isRetiredDemandPoolApi("/api/leads/lead_1/requirements")).toBe(false);
  });
});
