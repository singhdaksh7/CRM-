/**
 * End-to-end behavioural coverage of the catalogue -> visit -> field
 * executive workflow against a small in-memory stand-in for Prisma.
 *
 * The headline case is `catalogue -> visit regression (the original bug)`,
 * which reproduces the exact reported failure: a catalogue is created, a
 * visit is scheduled from it and assigned to a Field Executive, and the
 * visit must then (a) exist, (b) appear in the Admin upcoming query,
 * (c) appear in the assigned executive's query, and (d) contain exactly the
 * catalogue properties that were selected. Before this branch, step (a)
 * already failed - the catalogue "request a visit" path only ever wrote a
 * CatalogueInteraction and a FollowUp, never a Visit.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface Row {
  [key: string]: unknown;
}

const db = {
  visits: [] as Row[],
  visitProperties: [] as Row[],
  properties: [] as Row[],
  catalogueShares: [] as Row[],
  catalogueShareProperties: [] as Row[],
  /** VISIT_REQUESTED rows are the client's visit REQUESTS - never bookings. */
  catalogueInteractions: [] as Row[],
  leads: [] as Row[],
};

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}${++idCounter}`;

/** Extremely small subset of Prisma `where` matching - enough for these tests. */
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "visit") return matches(db.visits.find((v) => v.id === row.visitId) ?? {}, condition as Row);
    const value = row[key];
    if (condition !== null && typeof condition === "object" && !(condition instanceof Date)) {
      const c = condition as Record<string, unknown>;
      if ("in" in c) return (c.in as unknown[]).includes(value);
      if ("notIn" in c) return !(c.notIn as unknown[]).includes(value);
      if ("gt" in c) return (value as Date).getTime() > (c.gt as Date).getTime();
      if ("gte" in c && "lte" in c) return (value as Date).getTime() >= (c.gte as Date).getTime() && (value as Date).getTime() <= (c.lte as Date).getTime();
      if ("gte" in c) return (value as Date).getTime() >= (c.gte as Date).getTime();
      if ("not" in c) return value !== c.not;
    }
    return value === condition;
  });
}

function hydrateVisit(visit: Row): Row {
  const properties = db.visitProperties
    .filter((vp) => vp.visitId === visit.id)
    .sort((a, b) => (a.sequence as number) - (b.sequence as number))
    .map((vp) => ({ ...vp, property: db.properties.find((p) => p.id === vp.propertyId), visitedBy: null }));
  return {
    ...visit,
    properties,
    lead: db.leads.find((l) => l.id === visit.leadId),
    property: db.properties.find((p) => p.id === visit.propertyId),
    assignedTo: visit.assignedToId ? { id: visit.assignedToId, name: "Sagar" } : null,
    catalogueShare: db.catalogueShares.find((c) => c.id === visit.catalogueShareId) ?? null,
  };
}

vi.mock("./prisma", () => {
  const prisma: Record<string, unknown> = {
    visit: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const { properties, ...rest } = data as Row & { properties?: { create: Row[] } };
        const visit: Row = { id: nextId("visit"), status: "SCHEDULED", startedAt: null, completedAt: null, outcome: null, ...rest };
        db.visits.push(visit);
        for (const vp of properties?.create ?? []) {
          db.visitProperties.push({ id: nextId("vp"), status: "PENDING", visitedAt: null, visitedById: null, reactionRating: null, reactionNote: null, skipReason: null, isPreferred: false, ...vp, visitId: visit.id });
        }
        return hydrateVisit(visit);
      }),
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const visit = db.visits.find((v) => matches(v, where));
        return visit ? hydrateVisit(visit) : null;
      }),
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) => db.visits.filter((v) => matches(v, where)).map(hydrateVisit)),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const visit = db.visits.find((v) => v.id === where.id)!;
        Object.assign(visit, data);
        return hydrateVisit(visit);
      }),
    },
    visitProperty: {
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const vp = db.visitProperties.find((r) => r.id === where.id)!;
        Object.assign(vp, data);
        return { ...vp, property: db.properties.find((p) => p.id === vp.propertyId) };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const targets = db.visitProperties.filter((r) => matches(r, where));
        for (const t of targets) Object.assign(t, data);
        return { count: targets.length };
      }),
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) => db.visitProperties.filter((r) => matches(r, where))),
    },
    property: { findMany: vi.fn(async ({ where }: { where: Row }) => db.properties.filter((p) => matches(p, where))) },
    catalogueShare: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const c = db.catalogueShares.find((r) => matches(r, where));
        if (!c) return null;
        return { ...c, properties: db.catalogueShareProperties.filter((cp) => cp.catalogueShareId === c.id && cp.removedAt === null).sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number)) };
      }),
    },
    catalogueShareProperty: { updateMany: vi.fn(async () => ({ count: 0 })) },
    catalogueInteraction: {
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) => db.catalogueInteractions.filter((r) => matches(r, where))),
      // The single-use claim. Mirrors Postgres semantics closely enough for
      // the race test: only rows still matching the guard are updated, and
      // the count is what the caller checks.
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const targets = db.catalogueInteractions.filter((r) => matches(r, where));
        for (const t of targets) Object.assign(t, data);
        return { count: targets.length };
      }),
    },
    lead: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => db.leads.find((l) => matches(l, where)) ?? null),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    // Interactive transaction WITH rollback. Rollback is the whole point of
    // the double-confirmation guard - the losing confirmation must take its
    // half-created Visit down with it - so the fake models it by snapshotting
    // every table and restoring on throw.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = Object.fromEntries(
        Object.entries(db).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))])
      ) as typeof db;
      try {
        return await fn(prisma);
      } catch (err) {
        for (const table of Object.keys(db) as (keyof typeof db)[]) db[table] = snapshot[table];
        throw err;
      }
    }),
  };
  return { prisma };
});

const logActivity = vi.fn();
const createNotification = vi.fn();
const recordAudit = vi.fn();
const appendPropertyTimelineEvent = vi.fn();

vi.mock("./activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
vi.mock("./notifications", () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock("./audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock("./property-timeline", () => ({ appendPropertyTimelineEvent: (...a: unknown[]) => appendPropertyTimelineEvent(...a) }));
vi.mock("./scoring", () => ({ recalculateLeadScore: vi.fn() }));
vi.mock("./api-auth", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError };
});

const {
  scheduleVisit,
  scheduleVisitFromCatalogue,
  startVisit,
  recordVisitPropertyOutcome,
  completeVisit,
  setPreferredProperties,
  loadVisitForActor,
  rescheduleVisit,
  cancelVisit,
} = await import("./visits");
const { upcomingVisitsWhere, visitRoleScopeWhere, computeVisitProgress } = await import("./visit-progress");
const { prisma } = await import("./prisma");

const ORG = "org_default";
const OTHER_ORG = "org_other";
const ADMIN = { id: "admin1", role: "ADMIN" as const };
const SAGAR = { id: "emp_sagar", role: "FIELD_EXECUTIVE" as const };
const OTHER_EXEC = { id: "emp_other", role: "FIELD_EXECUTIVE" as const };

/** 18 Aug 2026, 11:00 IST. */
const TOMORROW_11AM_IST = new Date("2026-08-18T05:30:00.000Z");
/** 17 Aug 2026, 23:00 IST - "now" for the upcoming-query assertions. */
const NOW_LATE_IST = new Date("2026-08-17T17:30:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  idCounter = 0;
  db.visits = [];
  db.visitProperties = [];
  db.catalogueShares = [];
  db.catalogueShareProperties = [];
  db.catalogueInteractions = [];
  db.properties = [
    { id: "propF", organizationId: ORG, title: "F Block 2BHK", area: "Janakpuri", status: "AVAILABLE" },
    { id: "propM", organizationId: ORG, title: "M Block 3BHK", area: "Janakpuri", status: "AVAILABLE" },
    { id: "propK", organizationId: ORG, title: "K Block 1BHK", area: "Dwarka", status: "AVAILABLE" },
    { id: "propX", organizationId: ORG, title: "X Block Studio", area: "Dwarka", status: "AVAILABLE" },
    { id: "propForeign", organizationId: OTHER_ORG, title: "Other Org Flat", area: "Noida", status: "AVAILABLE" },
  ];
  db.leads = [{ id: "lead_rahul", organizationId: ORG, clientName: "Rahul Sharma", leadCode: "LEAD-0001", phone: "+919876543210" }];
});

function seedCatalogue(propertyIds: string[], organizationId = ORG) {
  db.catalogueShares.push({ id: "cat1", organizationId, leadId: "lead_rahul", title: "Janakpuri shortlist", version: 1, status: "ACTIVE" });
  propertyIds.forEach((propertyId, sortOrder) => {
    db.catalogueShareProperties.push({ id: nextId("csp"), catalogueShareId: "cat1", propertyId, sortOrder, removedAt: null });
  });
}

// ---------------------------------------------------------------------------
// THE REGRESSION TEST
// ---------------------------------------------------------------------------

describe("catalogue -> visit regression (the original bug)", () => {
  it("a visit scheduled from a catalogue exists, is in Admin Upcoming, is in the assigned executive's list, and holds the selected catalogue properties", async () => {
    // 1. A catalogue is created for the client with three properties.
    seedCatalogue(["propF", "propM", "propK"]);

    // 2. A visit is scheduled from that catalogue and assigned to Sagar.
    const created = await scheduleVisitFromCatalogue({
      catalogueShareId: "cat1",
      organizationId: ORG,
      propertyIds: ["propF", "propM", "propK"],
      assignedToId: SAGAR.id,
      visitDate: TOMORROW_11AM_IST,
      visitTime: "11:00",
      createdById: ADMIN.id,
    });

    // (a) The Visit record actually exists - this is what used to fail outright.
    expect(created.id).toBeTruthy();
    expect(db.visits).toHaveLength(1);
    expect(db.visits[0].catalogueShareId).toBe("cat1");
    expect(db.visits[0].assignedToId).toBe(SAGAR.id);
    expect(db.visits[0].organizationId).toBe(ORG);

    // (b) It appears in the Admin upcoming query, evaluated late on the
    //     previous IST day - the exact boundary that used to hide it.
    const adminUpcoming = await prisma.visit.findMany({ where: upcomingVisitsWhere(ORG, NOW_LATE_IST) });
    expect(adminUpcoming.map((v) => v.id)).toContain(created.id);

    // (c) It appears in the assigned executive's query, which keys on
    //     assignedToId - not createdById, not the lead owner.
    const execWhere = { ...visitRoleScopeWhere(ORG, SAGAR), ...upcomingVisitsWhere(ORG, NOW_LATE_IST, SAGAR.id) };
    const execUpcoming = await prisma.visit.findMany({ where: execWhere });
    expect(execUpcoming.map((v) => v.id)).toContain(created.id);

    // (d) It contains exactly the selected catalogue properties, in order,
    //     via the VisitProperty relation - not a text blob.
    const stored = db.visitProperties.filter((vp) => vp.visitId === created.id);
    expect(stored.map((vp) => vp.propertyId)).toEqual(["propF", "propM", "propK"]);
    expect(stored.map((vp) => vp.sequence)).toEqual([0, 1, 2]);
    expect(stored.every((vp) => vp.status === "PENDING")).toBe(true);
    expect(stored.every((vp) => vp.organizationId === ORG)).toBe(true);

    // And the legacy single-property column still points at the first
    // property, so every pre-existing reader keeps working.
    expect(db.visits[0].propertyId).toBe("propF");
  });

  it("notifies the assigned executive in-app, and sends no WhatsApp", async () => {
    seedCatalogue(["propF", "propM", "propK"]);
    await scheduleVisitFromCatalogue({
      catalogueShareId: "cat1",
      organizationId: ORG,
      propertyIds: ["propF", "propM", "propK"],
      assignedToId: SAGAR.id,
      visitDate: TOMORROW_11AM_IST,
      visitTime: "11:00",
      createdById: ADMIN.id,
    });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SAGAR.id, type: "VISIT_SCHEDULED", organizationId: ORG })
    );
    const message = createNotification.mock.calls[0][0].message as string;
    expect(message).toContain("Rahul Sharma");
    expect(message).toContain("3 properties");
    // No WhatsApp module is reachable from this path at all.
    expect(message).not.toMatch(/whatsapp/i);
  });
});

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

describe("scheduling", () => {
  it("preserves exactly the selected subset, not the whole catalogue", async () => {
    seedCatalogue(["propF", "propM", "propK", "propX"]);
    const visit = await scheduleVisitFromCatalogue({
      catalogueShareId: "cat1",
      organizationId: ORG,
      propertyIds: ["propM", "propK"],
      assignedToId: SAGAR.id,
      visitDate: TOMORROW_11AM_IST,
      visitTime: "11:00",
    });
    expect(db.visitProperties.filter((vp) => vp.visitId === visit.id).map((vp) => vp.propertyId)).toEqual(["propM", "propK"]);
  });

  it("falls back to the full active catalogue only when no selection is supplied", async () => {
    seedCatalogue(["propF", "propM"]);
    const visit = await scheduleVisitFromCatalogue({ catalogueShareId: "cat1", organizationId: ORG, visitDate: TOMORROW_11AM_IST, visitTime: "11:00" });
    expect(db.visitProperties.filter((vp) => vp.visitId === visit.id)).toHaveLength(2);
  });

  it("rejects a property that is not part of the catalogue", async () => {
    seedCatalogue(["propF"]);
    await expect(
      scheduleVisitFromCatalogue({ catalogueShareId: "cat1", organizationId: ORG, propertyIds: ["propX"], visitDate: TOMORROW_11AM_IST, visitTime: "11:00" })
    ).rejects.toThrow(/not part of this catalogue/);
  });

  it("rejects a catalogue belonging to another organization", async () => {
    seedCatalogue(["propF"], OTHER_ORG);
    await expect(
      scheduleVisitFromCatalogue({ catalogueShareId: "cat1", organizationId: ORG, propertyIds: ["propF"], visitDate: TOMORROW_11AM_IST, visitTime: "11:00" })
    ).rejects.toThrow(/Catalogue not found/);
  });

  it("rejects a property from another organization", async () => {
    await expect(
      scheduleVisit({ organizationId: ORG, leadId: "lead_rahul", propertyIds: ["propForeign"], visitDate: TOMORROW_11AM_IST, visitTime: "11:00" })
    ).rejects.toThrow(/could not be found/);
  });

  it("rejects a visit with no properties", async () => {
    await expect(
      scheduleVisit({ organizationId: ORG, leadId: "lead_rahul", propertyIds: [], visitDate: TOMORROW_11AM_IST, visitTime: "11:00" })
    ).rejects.toThrow(/at least one property/);
  });

  it("de-duplicates a repeated property selection", async () => {
    const visit = await scheduleVisit({ organizationId: ORG, leadId: "lead_rahul", propertyIds: ["propF", "propF", "propM"], visitDate: TOMORROW_11AM_IST, visitTime: "11:00" });
    expect(db.visitProperties.filter((vp) => vp.visitId === visit.id).map((vp) => vp.propertyId)).toEqual(["propF", "propM"]);
  });

  it("writes a lead timeline entry and a property timeline entry per property", async () => {
    await scheduleVisit({ organizationId: ORG, leadId: "lead_rahul", propertyIds: ["propF", "propM"], visitDate: TOMORROW_11AM_IST, visitTime: "11:00", createdById: ADMIN.id });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead_rahul", type: "VISIT_SCHEDULED" }));
    expect(appendPropertyTimelineEvent).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

describe("role and organization security", () => {
  async function seedAssignedVisit() {
    return scheduleVisit({ organizationId: ORG, leadId: "lead_rahul", propertyIds: ["propF", "propM"], assignedToId: SAGAR.id, visitDate: TOMORROW_11AM_IST, visitTime: "11:00", createdById: ADMIN.id });
  }

  it("lets the assigned executive open their own visit", async () => {
    const visit = await seedAssignedVisit();
    await expect(loadVisitForActor(visit.id, ORG, SAGAR)).resolves.toMatchObject({ id: visit.id });
  });

  it("hides an unassigned visit from a different executive - as a 404, not a 403", async () => {
    const visit = await seedAssignedVisit();
    await expect(loadVisitForActor(visit.id, ORG, OTHER_EXEC)).rejects.toThrow(/Visit not found/);
  });

  it("denies cross-organization access even to an admin of the other org", async () => {
    const visit = await seedAssignedVisit();
    await expect(loadVisitForActor(visit.id, OTHER_ORG, ADMIN)).rejects.toThrow(/Visit not found/);
  });

  it("lets an admin open any visit in the organization", async () => {
    const visit = await seedAssignedVisit();
    await expect(loadVisitForActor(visit.id, ORG, ADMIN)).resolves.toMatchObject({ id: visit.id });
  });

  it("refuses a field executive trying to reschedule or cancel", async () => {
    const visit = await seedAssignedVisit();
    await expect(rescheduleVisit(visit.id, ORG, SAGAR, { visitTime: "15:00" })).rejects.toThrow(/Only an Admin or Data Manager/);
    await expect(cancelVisit(visit.id, ORG, SAGAR, "client busy")).rejects.toThrow(/Only an Admin or Data Manager/);
  });
});

// ---------------------------------------------------------------------------
// Start / per-property / complete
// ---------------------------------------------------------------------------

describe("field workflow", () => {
  async function seedThreePropertyVisit() {
    seedCatalogue(["propF", "propM", "propK"]);
    return scheduleVisitFromCatalogue({
      catalogueShareId: "cat1",
      organizationId: ORG,
      propertyIds: ["propF", "propM", "propK"],
      assignedToId: SAGAR.id,
      visitDate: TOMORROW_11AM_IST,
      visitTime: "11:00",
      createdById: ADMIN.id,
    });
  }

  it("Start Visit moves SCHEDULED -> IN_PROGRESS, stamps startedAt, and marks nothing visited", async () => {
    const visit = await seedThreePropertyVisit();
    await startVisit(visit.id, ORG, SAGAR);

    expect(db.visits[0].status).toBe("IN_PROGRESS");
    expect(db.visits[0].startedAt).toBeInstanceOf(Date);
    expect(db.visitProperties.every((vp) => vp.status === "PENDING")).toBe(true);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "visit_started" }) }));
  });

  it("Start Visit is idempotent - a second call does not re-stamp or re-log", async () => {
    const visit = await seedThreePropertyVisit();
    await startVisit(visit.id, ORG, SAGAR);
    const firstStartedAt = db.visits[0].startedAt;
    logActivity.mockClear();

    await startVisit(visit.id, ORG, SAGAR);
    expect(db.visits[0].startedAt).toBe(firstStartedAt);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("marking a property visited records visitedAt, the executive, and opens progress to 1/3", async () => {
    const visit = await seedThreePropertyVisit();
    await startVisit(visit.id, ORG, SAGAR);
    await recordVisitPropertyOutcome(visit.id, "propF", ORG, SAGAR, { status: "VISITED" });

    const vp = db.visitProperties.find((r) => r.propertyId === "propF")!;
    expect(vp.status).toBe("VISITED");
    expect(vp.visitedAt).toBeInstanceOf(Date);
    expect(vp.visitedById).toBe(SAGAR.id);

    const progress = computeVisitProgress(db.visitProperties as never);
    expect(progress.label).toBe("1/3 Visited, 2 Remaining");
  });

  it("stores the star reaction as a structured integer plus an optional note", async () => {
    const visit = await seedThreePropertyVisit();
    await recordVisitPropertyOutcome(visit.id, "propM", ORG, SAGAR, { status: "VISITED", reactionRating: 4, reactionNote: "Liked the balcony" });

    const vp = db.visitProperties.find((r) => r.propertyId === "propM")!;
    expect(vp.reactionRating).toBe(4);
    expect(typeof vp.reactionRating).toBe("number");
    expect(vp.reactionNote).toBe("Liked the balcony");
  });

  it("accepts a visited property with no note at all - feedback is never compulsory", async () => {
    const visit = await seedThreePropertyVisit();
    await recordVisitPropertyOutcome(visit.id, "propM", ORG, SAGAR, { status: "VISITED", reactionRating: 3 });
    expect(db.visitProperties.find((r) => r.propertyId === "propM")!.reactionNote).toBeNull();
  });

  it("rejects a star rating outside 1-5", async () => {
    const visit = await seedThreePropertyVisit();
    for (const bad of [0, 6, 2.5]) {
      await expect(recordVisitPropertyOutcome(visit.id, "propF", ORG, SAGAR, { status: "VISITED", reactionRating: bad })).rejects.toThrow(/1 to 5/);
    }
  });

  it("is duplicate-completion safe - re-marking updates the reaction but keeps the original visitedAt and does not re-log", async () => {
    const visit = await seedThreePropertyVisit();
    await recordVisitPropertyOutcome(visit.id, "propF", ORG, SAGAR, { status: "VISITED", reactionRating: 3 });
    const firstVisitedAt = db.visitProperties.find((r) => r.propertyId === "propF")!.visitedAt;
    logActivity.mockClear();
    appendPropertyTimelineEvent.mockClear();

    await recordVisitPropertyOutcome(visit.id, "propF", ORG, SAGAR, { status: "VISITED", reactionRating: 5 });

    const vp = db.visitProperties.find((r) => r.propertyId === "propF")!;
    expect(vp.visitedAt).toBe(firstVisitedAt);
    expect(vp.reactionRating).toBe(5);
    expect(logActivity).not.toHaveBeenCalled();
    expect(appendPropertyTimelineEvent).not.toHaveBeenCalled();
  });

  it("records a skip with an optional reason", async () => {
    const visit = await seedThreePropertyVisit();
    await recordVisitPropertyOutcome(visit.id, "propK", ORG, SAGAR, { status: "SKIPPED", skipReason: "Owner unavailable" });
    const vp = db.visitProperties.find((r) => r.propertyId === "propK")!;
    expect(vp.status).toBe("SKIPPED");
    expect(vp.skipReason).toBe("Owner unavailable");
  });

  it("records an on-site unavailable property without inventing a second availability system", async () => {
    const visit = await seedThreePropertyVisit();
    await recordVisitPropertyOutcome(visit.id, "propK", ORG, SAGAR, { status: "UNAVAILABLE", skipReason: "Already rented" });
    expect(db.visitProperties.find((r) => r.propertyId === "propK")!.status).toBe("UNAVAILABLE");
    // The property's own status is untouched here - that decision belongs to
    // the existing Phase 4 PropertyAvailabilityReport review flow.
    expect(db.properties.find((p) => p.id === "propK")!.status).toBe("AVAILABLE");
  });

  it("writes a 'Shown to client' property timeline entry carrying the reaction", async () => {
    const visit = await seedThreePropertyVisit();
    appendPropertyTimelineEvent.mockClear();
    await recordVisitPropertyOutcome(visit.id, "propF", ORG, SAGAR, { status: "VISITED", reactionRating: 5 });
    expect(appendPropertyTimelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: "propF", eventType: "SHOWN_TO_CLIENT", toValue: "5/5" })
    );
  });

  it("rejects a property that is not part of the visit", async () => {
    const visit = await seedThreePropertyVisit();
    await expect(recordVisitPropertyOutcome(visit.id, "propX", ORG, SAGAR, { status: "VISITED" })).rejects.toThrow(/not part of this visit/);
  });

  it("refuses to complete a visit while properties are still pending", async () => {
    const visit = await seedThreePropertyVisit();
    await recordVisitPropertyOutcome(visit.id, "propF", ORG, SAGAR, { status: "VISITED", reactionRating: 4 });
    await expect(completeVisit(visit.id, ORG, SAGAR, { overallRating: 4 })).rejects.toThrow(/still pending/);
    expect(db.visits[0].status).not.toBe("COMPLETED");
  });

  it("completes once everything is resolved, storing completedAt, the overall rating, and the summary", async () => {
    const visit = await seedThreePropertyVisit();
    await recordVisitPropertyOutcome(visit.id, "propF", ORG, SAGAR, { status: "VISITED", reactionRating: 2 });
    await recordVisitPropertyOutcome(visit.id, "propM", ORG, SAGAR, { status: "VISITED", reactionRating: 4 });
    await recordVisitPropertyOutcome(visit.id, "propK", ORG, SAGAR, { status: "SKIPPED" });

    await completeVisit(visit.id, ORG, SAGAR, { overallRating: 4, summary: "Client liked M Block." });

    expect(db.visits[0].status).toBe("COMPLETED");
    expect(db.visits[0].completedAt).toBeInstanceOf(Date);
    expect(db.visits[0].overallRating).toBe(4);
    expect(db.visits[0].completionSummary).toBe("Client liked M Block.");
    expect(db.visits[0].outcome).toBe("INTERESTED");
  });

  it("rejects an out-of-range overall rating", async () => {
    const visit = await seedThreePropertyVisit();
    for (const id of ["propF", "propM", "propK"]) await recordVisitPropertyOutcome(visit.id, id, ORG, SAGAR, { status: "VISITED", reactionRating: 4 });
    await expect(completeVisit(visit.id, ORG, SAGAR, { overallRating: 9 })).rejects.toThrow(/1 to 5/);
  });

  it("never closes or rejects the lead purely from a low rating", async () => {
    const visit = await seedThreePropertyVisit();
    for (const id of ["propF", "propM", "propK"]) await recordVisitPropertyOutcome(visit.id, id, ORG, SAGAR, { status: "VISITED", reactionRating: 1 });
    await completeVisit(visit.id, ORG, SAGAR, { overallRating: 1 });

    // The only lead write is the guarded advance to VISIT_COMPLETED.
    const leadWrites = (prisma.lead.updateMany as ReturnType<typeof vi.fn>).mock.calls;
    for (const [args] of leadWrites) {
      expect(args.data.status).toBe("VISIT_COMPLETED");
      expect(args.data.status).not.toBe("NOT_INTERESTED");
    }
  });

  it("completing twice is a no-op rather than an error", async () => {
    const visit = await seedThreePropertyVisit();
    for (const id of ["propF", "propM", "propK"]) await recordVisitPropertyOutcome(visit.id, id, ORG, SAGAR, { status: "VISITED", reactionRating: 4 });
    await completeVisit(visit.id, ORG, SAGAR, { overallRating: 4 });
    const completedAt = db.visits[0].completedAt;
    await completeVisit(visit.id, ORG, SAGAR, { overallRating: 2 });
    expect(db.visits[0].completedAt).toBe(completedAt);
    expect(db.visits[0].overallRating).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Preferred property / shortlist
// ---------------------------------------------------------------------------

describe("preferred property shortlist", () => {
  async function seedCompletedVisit() {
    seedCatalogue(["propF", "propM"]);
    const visit = await scheduleVisitFromCatalogue({
      catalogueShareId: "cat1",
      organizationId: ORG,
      propertyIds: ["propF", "propM"],
      assignedToId: SAGAR.id,
      visitDate: TOMORROW_11AM_IST,
      visitTime: "11:00",
    });
    await recordVisitPropertyOutcome(visit.id, "propF", ORG, SAGAR, { status: "VISITED", reactionRating: 2 });
    await recordVisitPropertyOutcome(visit.id, "propM", ORG, SAGAR, { status: "VISITED", reactionRating: 5 });
    return visit;
  }

  it("marks the chosen properties and mirrors onto the existing catalogue shortlist", async () => {
    const visit = await seedCompletedVisit();
    await setPreferredProperties(visit.id, ORG, SAGAR, ["propM"]);

    expect(db.visitProperties.find((r) => r.propertyId === "propM")!.isPreferred).toBe(true);
    expect(db.visitProperties.find((r) => r.propertyId === "propF")!.isPreferred).toBe(false);
    expect(prisma.catalogueShareProperty.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ executiveStatus: "SHORTLISTED" }) })
    );
  });

  it("supports more than one preferred property and replaces a previous selection", async () => {
    const visit = await seedCompletedVisit();
    await setPreferredProperties(visit.id, ORG, SAGAR, ["propM"]);
    await setPreferredProperties(visit.id, ORG, SAGAR, ["propF", "propM"]);
    expect(db.visitProperties.filter((r) => r.isPreferred)).toHaveLength(2);
  });

  it("refuses a property that was not actually visited", async () => {
    seedCatalogue(["propF", "propM"]);
    const visit = await scheduleVisitFromCatalogue({ catalogueShareId: "cat1", organizationId: ORG, propertyIds: ["propF", "propM"], visitDate: TOMORROW_11AM_IST, visitTime: "11:00" });
    await expect(setPreferredProperties(visit.id, ORG, ADMIN, ["propF"])).rejects.toThrow(/actually visited/);
  });

  it("refuses a property outside the visit", async () => {
    const visit = await seedCompletedVisit();
    await expect(setPreferredProperties(visit.id, ORG, SAGAR, ["propX"])).rejects.toThrow(/part of this visit/);
  });

  it("logs a 'Client preferred property' entry on the lead timeline", async () => {
    const visit = await seedCompletedVisit();
    logActivity.mockClear();
    await setPreferredProperties(visit.id, ORG, SAGAR, ["propM"]);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Client preferred") }));
  });
});

// ---------------------------------------------------------------------------
// Reschedule / cancel
// ---------------------------------------------------------------------------

describe("reschedule and cancel", () => {
  async function seedVisit() {
    return scheduleVisit({ organizationId: ORG, leadId: "lead_rahul", propertyIds: ["propF", "propM"], assignedToId: SAGAR.id, visitDate: TOMORROW_11AM_IST, visitTime: "11:00", createdById: ADMIN.id });
  }

  it("moves the visit and notifies the newly assigned executive", async () => {
    const visit = await seedVisit();
    createNotification.mockClear();

    const later = new Date("2026-08-20T05:30:00.000Z");
    await rescheduleVisit(visit.id, ORG, ADMIN, { visitDate: later, visitTime: "15:00", assignedToId: OTHER_EXEC.id });

    expect(db.visits[0].visitTime).toBe("15:00");
    expect(db.visits[0].assignedToId).toBe(OTHER_EXEC.id);
    // Back to SCHEDULED so it reappears in the active queue.
    expect(db.visits[0].status).toBe("SCHEDULED");
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: OTHER_EXEC.id, type: "VISIT_SCHEDULED" }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: SAGAR.id, type: "VISIT_RESCHEDULED" }));
  });

  it("records the assignment change in the audit log", async () => {
    const visit = await seedVisit();
    recordAudit.mockClear();
    await rescheduleVisit(visit.id, ORG, ADMIN, { assignedToId: OTHER_EXEC.id });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: expect.objectContaining({ assignedToId: SAGAR.id }),
        newValues: expect.objectContaining({ event: "visit_rescheduled", assignedToId: OTHER_EXEC.id }),
      })
    );
  });

  it("cancels with a reason and drops the visit out of the active upcoming queue", async () => {
    const visit = await seedVisit();
    await cancelVisit(visit.id, ORG, ADMIN, "Client travelling");

    expect(db.visits[0].status).toBe("CANCELLED");
    expect(db.visits[0].cancellationReason).toBe("Client travelling");

    const upcoming = await prisma.visit.findMany({ where: upcomingVisitsWhere(ORG, NOW_LATE_IST) });
    expect(upcoming.map((v) => v.id)).not.toContain(visit.id);

    // But it is still there in unfiltered history.
    const all = await prisma.visit.findMany({ where: { organizationId: ORG } });
    expect(all.map((v) => v.id)).toContain(visit.id);
  });

  it("requires a real cancellation reason", async () => {
    const visit = await seedVisit();
    await expect(cancelVisit(visit.id, ORG, ADMIN, "  ")).rejects.toThrow(/reason is required/);
  });

  it("refuses to start or complete a cancelled visit", async () => {
    const visit = await seedVisit();
    await cancelVisit(visit.id, ORG, ADMIN, "Client travelling");
    await expect(startVisit(visit.id, ORG, SAGAR)).rejects.toThrow(/cancelled/);
    await expect(completeVisit(visit.id, ORG, SAGAR, {})).rejects.toThrow(/cancelled/);
  });
});

// ---------------------------------------------------------------------------
// Client request -> Admin confirmation
//
// Product decision: a client's "Request Visit" tap NEVER creates a Visit. It
// records a VISIT_REQUESTED CatalogueInteraction; an Admin reviews it and
// only [Confirm Visit] materialises Visit + VisitProperty rows. These tests
// cover the confirmation half - the "public request creates no Visit" half
// lives in catalogue-visit-request.test.ts, against the real public path.
// ---------------------------------------------------------------------------

/** One pending client request per property, exactly as the public page writes them. */
function seedVisitRequest(propertyIds: string[], organizationId = ORG) {
  return propertyIds.map((propertyId) => {
    const row: Row = {
      id: nextId("req"),
      organizationId,
      catalogueShareId: "cat1",
      propertyId,
      type: "VISIT_REQUESTED",
      message: "Weekend would suit us",
      clientName: "Rahul Sharma",
      clientPhone: "+919876543210",
      metadata: JSON.stringify({ preferredDate: "2026-08-18", preferredWindow: "Morning" }),
      createdAt: new Date("2026-08-17T09:00:00.000Z"),
      scheduledVisitId: null,
      scheduledAt: null,
      scheduledById: null,
    };
    db.catalogueInteractions.push(row);
    return row;
  });
}

describe("client request -> admin confirmation", () => {
  it("confirming a request creates exactly one Visit and claims the request rows", async () => {
    seedCatalogue(["propF", "propM", "propK"]);
    const requests = seedVisitRequest(["propF", "propM"]);

    const visit = await scheduleVisitFromCatalogue({
      catalogueShareId: "cat1",
      organizationId: ORG,
      propertyIds: ["propF", "propM"],
      assignedToId: SAGAR.id,
      visitDate: TOMORROW_11AM_IST,
      visitTime: "11:00",
      createdById: ADMIN.id,
      requestInteractionIds: requests.map((r) => r.id as string),
    });

    expect(db.visits).toHaveLength(1);
    expect(visit.id).toBe(db.visits[0].id);
    // VisitProperty count equals exactly what was selected at confirmation.
    expect(db.visitProperties.filter((vp) => vp.visitId === visit.id)).toHaveLength(2);
    // Every request row now points at the confirmed visit, so it can never be
    // confirmed a second time.
    expect(db.catalogueInteractions.every((r) => r.scheduledVisitId === visit.id)).toBe(true);
    expect(db.catalogueInteractions.every((r) => r.scheduledById === ADMIN.id)).toBe(true);
  });

  it("does not widen the visit to the whole catalogue when the admin confirms a subset", async () => {
    seedCatalogue(["propF", "propM", "propK", "propX"]);
    const requests = seedVisitRequest(["propF", "propM", "propK"]);

    // The admin removed one of the three requested properties before confirming.
    const visit = await scheduleVisitFromCatalogue({
      catalogueShareId: "cat1",
      organizationId: ORG,
      propertyIds: ["propF", "propK"],
      visitDate: TOMORROW_11AM_IST,
      visitTime: "11:00",
      createdById: ADMIN.id,
      requestInteractionIds: requests.map((r) => r.id as string),
    });

    expect(db.visitProperties.filter((vp) => vp.visitId === visit.id).map((vp) => vp.propertyId)).toEqual(["propF", "propK"]);
  });

  it("a second confirmation of the same request creates NO second visit", async () => {
    seedCatalogue(["propF", "propM"]);
    const requests = seedVisitRequest(["propF"]);
    const ids = requests.map((r) => r.id as string);

    const first = await scheduleVisitFromCatalogue({
      catalogueShareId: "cat1",
      organizationId: ORG,
      propertyIds: ["propF"],
      visitDate: TOMORROW_11AM_IST,
      visitTime: "11:00",
      createdById: ADMIN.id,
      requestInteractionIds: ids,
    });

    await expect(
      scheduleVisitFromCatalogue({
        catalogueShareId: "cat1",
        organizationId: ORG,
        propertyIds: ["propF"],
        visitDate: TOMORROW_11AM_IST,
        visitTime: "14:00",
        createdById: ADMIN.id,
        requestInteractionIds: ids,
      })
    ).rejects.toThrow(/already been scheduled/);

    expect(db.visits).toHaveLength(1);
    expect(db.visits[0].id).toBe(first.id);
  });

  it("a RACING double-submit rolls the loser's visit back - the pre-check cannot save it, the guarded claim must", async () => {
    seedCatalogue(["propF"]);
    const requests = seedVisitRequest(["propF"]);
    const ids = requests.map((r) => r.id as string);

    // Both calls read the request as unclaimed before either writes: this is
    // exactly the race a read-then-write check loses. Only the guarded
    // updateMany inside the transaction can decide it.
    const results = await Promise.allSettled([
      scheduleVisitFromCatalogue({
        catalogueShareId: "cat1",
        organizationId: ORG,
        propertyIds: ["propF"],
        visitDate: TOMORROW_11AM_IST,
        visitTime: "11:00",
        createdById: ADMIN.id,
        requestInteractionIds: ids,
      }),
      scheduleVisitFromCatalogue({
        catalogueShareId: "cat1",
        organizationId: ORG,
        propertyIds: ["propF"],
        visitDate: TOMORROW_11AM_IST,
        visitTime: "11:00",
        createdById: ADMIN.id,
        requestInteractionIds: ids,
      }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    // The losing transaction took its half-created Visit down with it.
    expect(db.visits).toHaveLength(1);
    expect(db.visitProperties).toHaveLength(1);
  });

  it("rejects request rows belonging to a different catalogue", async () => {
    seedCatalogue(["propF"]);
    db.catalogueInteractions.push({
      id: "req_stray",
      organizationId: ORG,
      catalogueShareId: "cat_other",
      propertyId: "propF",
      type: "VISIT_REQUESTED",
      scheduledVisitId: null,
      createdAt: new Date(),
    });

    await expect(
      scheduleVisitFromCatalogue({
        catalogueShareId: "cat1",
        organizationId: ORG,
        propertyIds: ["propF"],
        visitDate: TOMORROW_11AM_IST,
        visitTime: "11:00",
        requestInteractionIds: ["req_stray"],
      })
    ).rejects.toThrow(/do not belong to this catalogue/);
    expect(db.visits).toHaveLength(0);
  });

  it("the confirmed visit reaches the assigned executive and Admin Upcoming, and 404s for anyone else", async () => {
    seedCatalogue(["propF", "propM"]);
    const requests = seedVisitRequest(["propF", "propM"]);

    const visit = await scheduleVisitFromCatalogue({
      catalogueShareId: "cat1",
      organizationId: ORG,
      propertyIds: ["propF", "propM"],
      assignedToId: SAGAR.id,
      visitDate: TOMORROW_11AM_IST,
      visitTime: "11:00",
      createdById: ADMIN.id,
      requestInteractionIds: requests.map((r) => r.id as string),
    });

    const upcoming = await prisma.visit.findMany({ where: upcomingVisitsWhere(ORG, NOW_LATE_IST) });
    expect(upcoming.map((v) => v.id)).toContain(visit.id);

    await expect(loadVisitForActor(visit.id, ORG, SAGAR)).resolves.toMatchObject({ id: visit.id });
    await expect(loadVisitForActor(visit.id, ORG, OTHER_EXEC)).rejects.toThrow(/not found/i);
    // Cross-organization is a 404 too, never a 403 and never a leak.
    await expect(loadVisitForActor(visit.id, OTHER_ORG, ADMIN)).rejects.toThrow(/not found/i);
  });

  it("notifies the assigned executive in-app on confirmation, and nobody else", async () => {
    seedCatalogue(["propF"]);
    const requests = seedVisitRequest(["propF"]);
    createNotification.mockClear();

    await scheduleVisitFromCatalogue({
      catalogueShareId: "cat1",
      organizationId: ORG,
      propertyIds: ["propF"],
      assignedToId: SAGAR.id,
      visitDate: TOMORROW_11AM_IST,
      visitTime: "11:00",
      createdById: ADMIN.id,
      requestInteractionIds: requests.map((r) => r.id as string),
    });

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: SAGAR.id, type: "VISIT_SCHEDULED" }));
  });
});
