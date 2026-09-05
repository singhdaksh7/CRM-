import { describe, expect, it } from "vitest";
import { requireHandoverResetDirectUrl, getHandoverResetExecuteClientOptions } from "./direct-client";

describe("handover reset direct connection guard", () => {
  it("accepts only the supplied direct connection value", () => {
    const direct = "postgresql://reset-direct.example.test:5432/postgres";
    expect(requireHandoverResetDirectUrl(direct)).toBe(direct);
    expect(getHandoverResetExecuteClientOptions(direct)).toEqual({
      datasources: { db: { url: direct } },
    });
  });

  it("fails closed instead of falling back to DATABASE_URL", () => {
    expect(() => requireHandoverResetDirectUrl("")).toThrow("DIRECT_URL is required");
    expect(() => requireHandoverResetDirectUrl(undefined)).toThrow("DIRECT_URL is required");
  });
});
