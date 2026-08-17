import { describe, expect, it } from "vitest";
import { formatLastLogin } from "./last-login";

// 17 Aug 2026, 15:30 IST (10:00 UTC).
const NOW = new Date("2026-08-17T10:00:00Z");

describe("formatLastLogin", () => {
  it.each([null, undefined, ""])("renders %s as Never", (value) => {
    expect(formatLastLogin(value as never, NOW)).toBe("Never");
  });

  it("renders an unparseable value as Never rather than Invalid Date", () => {
    expect(formatLastLogin("not-a-date", NOW)).toBe("Never");
  });

  it("prefixes a same-day sign-in with Today and a time", () => {
    // 05:12 UTC = 10:42 IST on the same calendar day.
    const result = formatLastLogin(new Date("2026-08-17T05:12:00Z"), NOW);
    expect(result).toMatch(/^Today /);
    expect(result).toContain("10:42");
  });

  it("prefixes the previous calendar day with Yesterday", () => {
    expect(formatLastLogin(new Date("2026-08-16T05:12:00Z"), NOW)).toMatch(/^Yesterday /);
  });

  it("falls back to a plain date further back", () => {
    const result = formatLastLogin(new Date("2026-08-12T05:12:00Z"), NOW);
    expect(result).toContain("Aug");
    expect(result).toContain("2026");
    expect(result).not.toMatch(/Today|Yesterday/);
  });

  it("uses the IST calendar day, not UTC, when deciding what Today means", () => {
    // 19:00 UTC on the 16th is already 00:30 IST on the 17th.
    expect(formatLastLogin(new Date("2026-08-16T19:00:00Z"), NOW)).toMatch(/^Today /);
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatLastLogin("2026-08-17T05:12:00Z", NOW)).toMatch(/^Today /);
  });

  it("never exposes IP or device metadata", () => {
    const result = formatLastLogin(new Date("2026-08-17T05:12:00Z"), NOW);
    expect(result).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(result.toLowerCase()).not.toContain("mozilla");
  });
});
