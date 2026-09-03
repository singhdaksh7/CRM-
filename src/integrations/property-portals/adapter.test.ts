import { describe, expect, it } from "vitest";
import { getPortalAdapter } from "./adapter";

describe("portal adapter registry", () => {
  it.each(["OLX", "MAGICBRICKS", "NINETY_NINE_ACRES", "META", "OTHER"] as const)("registers %s without an unauthorized network operation", (provider) => {
    const adapter = getPortalAdapter(provider);
    expect(adapter?.provider).toBe(provider);
    expect(adapter?.fetchLeads).toBeUndefined();
    expect(adapter?.testConnection).toBeUndefined();
  });
});
