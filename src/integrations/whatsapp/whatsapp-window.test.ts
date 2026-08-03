import { describe, it, expect } from "vitest";
import { isWithinCustomerCareWindow, CUSTOMER_CARE_WINDOW_MS } from "./whatsapp-window";

const NOW = new Date("2026-01-15T12:00:00.000Z");

describe("isWithinCustomerCareWindow", () => {
  it("is true when the last inbound message was just now", () => {
    expect(isWithinCustomerCareWindow(NOW, NOW)).toBe(true);
  });

  it("is true 1 hour after the last inbound message (inside window)", () => {
    const lastInboundAt = new Date(NOW.getTime() - 60 * 60 * 1000);
    expect(isWithinCustomerCareWindow(lastInboundAt, NOW)).toBe(true);
  });

  it("is true 23 hours 59 minutes after the last inbound message (just inside the boundary)", () => {
    const lastInboundAt = new Date(NOW.getTime() - (CUSTOMER_CARE_WINDOW_MS - 60_000));
    expect(isWithinCustomerCareWindow(lastInboundAt, NOW)).toBe(true);
  });

  it("is false exactly 24 hours after the last inbound message (boundary is exclusive)", () => {
    const lastInboundAt = new Date(NOW.getTime() - CUSTOMER_CARE_WINDOW_MS);
    expect(isWithinCustomerCareWindow(lastInboundAt, NOW)).toBe(false);
  });

  it("is false 24 hours 1 minute after the last inbound message (outside window)", () => {
    const lastInboundAt = new Date(NOW.getTime() - (CUSTOMER_CARE_WINDOW_MS + 60_000));
    expect(isWithinCustomerCareWindow(lastInboundAt, NOW)).toBe(false);
  });

  it("is false when there is no inbound history at all (null)", () => {
    expect(isWithinCustomerCareWindow(null, NOW)).toBe(false);
  });

  it("is false when there is no inbound history at all (undefined)", () => {
    expect(isWithinCustomerCareWindow(undefined, NOW)).toBe(false);
  });

  it("is false for a lastInboundAt in the future (clock skew / bad data) rather than throwing", () => {
    const future = new Date(NOW.getTime() + 60_000);
    expect(isWithinCustomerCareWindow(future, NOW)).toBe(false);
  });

  it("defaults `now` to the current time when not provided", () => {
    const justNow = new Date();
    expect(isWithinCustomerCareWindow(justNow)).toBe(true);
  });
});
