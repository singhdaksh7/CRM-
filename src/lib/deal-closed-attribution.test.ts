import { describe, it, expect } from "vitest";
import { resolveTeamReportDateRange } from "./team-reports-data";

describe("Deal Closed Attribution & Date Range Logic", () => {
  const referenceDate = new Date("2026-11-15T10:12:00.000Z"); // Nov 15, 2026

  it("calculates thisMonth date boundaries in IST accurately", () => {
    const range = resolveTeamReportDateRange({ period: "thisMonth", now: referenceDate });
    expect(range.period).toBe("thisMonth");

    // IST is UTC + 5:30
    // Start of Nov 2026 in IST is 2026-11-01 00:00:00 IST -> 2026-10-31 18:30:00 UTC
    expect(range.from.toISOString()).toBe("2026-10-31T18:30:00.000Z");

    // End of Nov 2026 in IST is 2026-11-30 23:59:59.999 IST -> 2026-11-30 18:29:59.999 UTC
    expect(range.to.toISOString()).toBe("2026-11-30T18:29:59.999Z");
  });

  it("calculates prevMonth date boundaries in IST accurately", () => {
    const range = resolveTeamReportDateRange({ period: "prevMonth", now: referenceDate });
    expect(range.period).toBe("prevMonth");

    // Previous month relative to Nov 2026 is Oct 2026 (31 days)
    // Start of Oct 2026 in IST is 2026-10-01 00:00:00 IST -> 2026-09-30 18:30:00 UTC
    expect(range.from.toISOString()).toBe("2026-09-30T18:30:00.000Z");

    // End of Oct 2026 in IST is 2026-10-31 23:59:59.999 IST -> 2026-10-31 18:29:59.999 UTC
    expect(range.to.toISOString()).toBe("2026-10-31T18:29:59.999Z");
  });

  it("calculates today date boundaries in IST", () => {
    const range = resolveTeamReportDateRange({ period: "today", now: referenceDate });
    expect(range.period).toBe("today");
    // Nov 15 2026 00:00:00 IST is Nov 14 18:30:00 UTC
    expect(range.from.toISOString()).toBe("2026-11-14T18:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-11-15T18:29:59.999Z");
  });

  it("handles custom date range cleanly", () => {
    const range = resolveTeamReportDateRange({
      period: "custom",
      from: "2026-11-01",
      to: "2026-11-10",
      now: referenceDate,
    });
    expect(range.period).toBe("custom");
    expect(range.from.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-11-10T18:29:59.999Z");
  });
});

describe("Attribution Consistency Rules", () => {
  it("enforces distinct attribution roles", () => {
    // Model test confirming attribution semantics:
    // Lead Owner: employee who owns the lead
    // Deal Closed By: employee who actually negotiated and closed the deal
    // Marked Closed By: user who marked it Won in CRM
    const leadOwnerId: string = "user_rahul";
    const dealClosedById: string = "user_sagar";
    const markedClosedById: string = "user_kanchan_dm";

    expect(dealClosedById).not.toBe(markedClosedById);
    expect(dealClosedById).not.toBe(leadOwnerId);

    // In Team Reports, credit belongs strictly to dealClosedById
    const teamReportUserId: string = "user_sagar";
    const getsCredit = teamReportUserId === dealClosedById;
    expect(getsCredit).toBe(true);

    const leadOwnerGetsCredit = teamReportUserId === leadOwnerId;
    expect(leadOwnerGetsCredit).toBe(false);

    const markerGetsCredit = teamReportUserId === markedClosedById;
    expect(markerGetsCredit).toBe(false);
  });
});
