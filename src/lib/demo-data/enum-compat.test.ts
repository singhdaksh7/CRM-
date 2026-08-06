import { describe, it, expect, vi } from "vitest";
import { checkNotificationTypeEnumInProduction, NOTIFICATION_TYPES_USED_BY_DEMO_DATA } from "./enum-compat";

function makeClient(enumlabels: string[]) {
  return { $queryRawUnsafe: vi.fn().mockResolvedValue(enumlabels.map((enumlabel) => ({ enumlabel }))) };
}

const ALL_PRESENT = [...NOTIFICATION_TYPES_USED_BY_DEMO_DATA, "NEW_LEAD", "DEAL_WON"]; // production has extra values too - only the used ones matter

describe("checkNotificationTypeEnumInProduction", () => {
  it("passes with ok=true and no missing values when every value demo data uses is present in production", async () => {
    const result = await checkNotificationTypeEnumInProduction(makeClient(ALL_PRESENT));
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("fails and reports exactly one missing value", async () => {
    const values = ALL_PRESENT.filter((v) => v !== "PROPERTY_UNAVAILABLE_AFTER_SHARE");
    const result = await checkNotificationTypeEnumInProduction(makeClient(values));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["PROPERTY_UNAVAILABLE_AFTER_SHARE"]);
  });

  it("fails and reports every missing value when several are absent at once", async () => {
    const values = ALL_PRESENT.filter(
      (v) => !["HOT_LEAD_NO_FOLLOWUP", "PAYMENT_PENDING", "FOLLOW_UP_DUE"].includes(v)
    );
    const result = await checkNotificationTypeEnumInProduction(makeClient(values));
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["HOT_LEAD_NO_FOLLOWUP", "PAYMENT_PENDING", "FOLLOW_UP_DUE"]);
  });
});
