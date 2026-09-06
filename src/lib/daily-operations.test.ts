import { describe, expect, it } from "vitest";
import { needsVisitOutcomeWhere } from "./visit-progress";
import { previousCustomerContext } from "./followup-context";

describe("needsVisitOutcomeWhere", () => {
  const now = new Date("2026-09-06T10:00:00.000Z"); // 15:30 IST

  it("limits the queue to past, scheduled visits without an outcome in the caller's organization", () => {
    expect(needsVisitOutcomeWhere("org_a", now, "fe_a")).toEqual({
      organizationId: "org_a",
      assignedToId: "fe_a",
      status: "SCHEDULED",
      outcome: null,
      OR: [
        { visitDate: { lt: new Date("2026-09-05T18:30:00.000Z") } },
        { visitDate: { gte: new Date("2026-09-05T18:30:00.000Z"), lte: new Date("2026-09-06T18:29:59.999Z") }, visitTime: { lt: "15:30" } },
      ],
    });
  });

  it("does not include terminal statuses, completed outcomes, or future appointment times", () => {
    const where = needsVisitOutcomeWhere("org_a", now);
    expect(where.status).toBe("SCHEDULED");
    expect(where.outcome).toBeNull();
    expect(JSON.stringify(where)).not.toContain("CANCELLED");
    expect((where.OR as Array<Record<string, unknown>>)[1].visitTime).toEqual({ lt: "15:30" });
  });
});

describe("previousCustomerContext", () => {
  it("uses the latest structured interaction and preserves its outcome and note", () => {
    expect(previousCustomerContext([
      { type: "NOTE_ADDED", description: "Internal call logged", metadata: JSON.stringify({ interactionType: "CALL", outcome: "NEEDS_TIME", notes: "Discuss with family" }), createdAt: new Date() },
    ])).toEqual({ response: "NEEDS_TIME", note: "Discuss with family" });
  });

  it("excludes system activity and generic notes", () => {
    expect(previousCustomerContext([
      { type: "NOTE_ADDED", description: "Notes updated", metadata: null, createdAt: new Date() },
      { type: "STATUS_CHANGED", description: "Assigned", metadata: null, createdAt: new Date() },
    ])).toBeNull();
  });

  it("uses a customer reply when no structured composer metadata exists", () => {
    expect(previousCustomerContext([
      { type: "CLIENT_REPLY_RECEIVED", description: "Please call Saturday", metadata: null, createdAt: new Date() },
    ])).toEqual({ response: "Customer reply", note: "Please call Saturday" });
  });
});
