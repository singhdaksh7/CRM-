import { describe, it, expect } from "vitest";
import { startOfIstDay, endOfIstDay, istMonthKey } from "./ist-date";

describe("startOfIstDay", () => {
  it("returns IST midnight for a time firmly within the IST day", () => {
    // 2026-08-06 10:00 UTC = 2026-08-06 15:30 IST
    const now = new Date("2026-08-06T10:00:00.000Z");
    const start = startOfIstDay(now);
    // 2026-08-06 00:00 IST = 2026-08-05 18:30 UTC
    expect(start.toISOString()).toBe("2026-08-05T18:30:00.000Z");
  });

  it("rolls over to the next IST day correctly near UTC midnight (the bug server-local boundaries get wrong)", () => {
    // 2026-08-06 19:00 UTC = 2026-08-07 00:30 IST - already the next IST day
    const now = new Date("2026-08-06T19:00:00.000Z");
    const start = startOfIstDay(now);
    // Expected: 2026-08-07 00:00 IST = 2026-08-06 18:30 UTC
    expect(start.toISOString()).toBe("2026-08-06T18:30:00.000Z");
  });
});

describe("endOfIstDay", () => {
  it("is the last millisecond before the next IST midnight", () => {
    const now = new Date("2026-08-06T10:00:00.000Z");
    const end = endOfIstDay(now);
    expect(end.toISOString()).toBe("2026-08-06T18:29:59.999Z");
  });
});

describe("istMonthKey", () => {
  it("keys by the IST calendar month even when UTC is a different month", () => {
    // 2026-07-31 19:00 UTC = 2026-08-01 00:30 IST
    const d = new Date("2026-07-31T19:00:00.000Z");
    expect(istMonthKey(d)).toBe("2026-08");
  });
});
