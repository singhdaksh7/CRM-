/**
 * The PUBLIC half of the catalogue -> visit workflow.
 *
 * Product decision, made explicitly: a client tapping "Request Visit" on the
 * public catalogue page books NOTHING. It records a VISIT_REQUESTED
 * CatalogueInteraction and a VISIT_CONFIRMATION FollowUp so a human picks it
 * up - and creates no Visit and no VisitProperty. A real visit only exists
 * after an Admin reviews the request and presses [Confirm Visit], which is
 * covered in visit-workflow.test.ts.
 *
 * These tests pin that boundary down from the public side, plus the read
 * model an Admin uses to see the queue, plus a source-level assertion that no
 * WhatsApp send is reachable anywhere in request -> confirm -> complete.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach, vi } from "vitest";

interface Row {
  [key: string]: unknown;
}

const db = {
  catalogueShares: [] as Row[],
  catalogueShareProperties: [] as Row[],
  catalogueInteractions: [] as Row[],
  followUps: [] as Row[],
  visits: [] as Row[],
  visitProperties: [] as Row[],
};

const visitCreate = vi.fn();
const visitPropertyCreate = vi.fn();

let idCounter = 0;

function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "catalogueShare") {
      const parent = db.catalogueShares.find((c) => c.id === row.catalogueShareId);
      return matchesWhere(parent ?? {}, condition as Row);
    }
    const value = row[key];
    if (condition !== null && typeof condition === "object" && !(condition instanceof Date)) {
      const c = condition as Record<string, unknown>;
      if ("in" in c) return (c.in as unknown[]).includes(value);
      if ("gte" in c) return (value as Date).getTime() >= (c.gte as Date).getTime();
    }
    return value === condition;
  });
}

vi.mock("./prisma", () => ({
  prisma: {
    catalogueShare: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const c = db.catalogueShares.find((r) => r.id === where.id);
        return c ? { ...c, lead: { id: c.leadId, clientName: "Rahul Sharma", assignedToId: "emp_sagar", leadCode: "LEAD-0001", phone: "+919876543210" } } : null;
      }),
    },
    catalogueShareProperty: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => {
        const key = where.catalogueShareId_propertyId as Row;
        return db.catalogueShareProperties.find((cp) => cp.catalogueShareId === key.catalogueShareId && cp.propertyId === key.propertyId) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) =>
        db.catalogueShareProperties
          .filter((cp) => matchesWhere(cp, where))
          .map((cp) => ({
            ...cp,
            property: { id: cp.propertyId, title: `Title ${cp.propertyId}`, propertyCode: `PC-${cp.propertyId}`, area: "Janakpuri", status: cp.propertyStatus ?? "AVAILABLE" },
          }))
      ),
    },
    catalogueInteraction: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => db.catalogueInteractions.find((r) => matchesWhere(r, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) =>
        db.catalogueInteractions
          .filter((r) => matchesWhere(r, where))
          .map((r) => {
            const catalogue = db.catalogueShares.find((c) => c.id === r.catalogueShareId)!;
            return {
              ...r,
              property: r.propertyId ? { id: r.propertyId, title: `Title ${r.propertyId}`, propertyCode: `PC-${r.propertyId}`, area: "Janakpuri", status: "AVAILABLE" } : null,
              catalogueShare: {
                id: catalogue.id,
                title: catalogue.title,
                leadId: catalogue.leadId,
                lead: { id: catalogue.leadId, leadCode: "LEAD-0001", clientName: "Rahul Sharma", phone: "+919876543210" },
              },
            };
          })
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = { id: `int${++idCounter}`, createdAt: new Date("2026-08-17T09:00:00.000Z"), scheduledVisitId: null, scheduledAt: null, scheduledById: null, ...data };
        db.catalogueInteractions.push(row);
        return row;
      }),
    },
    followUp: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = { id: `fu${++idCounter}`, ...data };
        db.followUps.push(row);
        return row;
      }),
    },
    property: { findUnique: vi.fn(async ({ where }: { where: Row }) => ({ id: where.id, propertyCode: `PC-${where.id}`, title: `Title ${where.id}` })) },
    // Deliberately present so that ANY attempt by the public path to create a
    // visit would be observed by the test rather than throwing an opaque
    // "cannot read property of undefined".
    visit: { create: visitCreate },
    visitProperty: { create: visitPropertyCreate },
  },
}));

vi.mock("./activity", () => ({ logActivity: vi.fn() }));
vi.mock("./notifications", () => ({ createNotification: vi.fn() }));
vi.mock("./scoring", () => ({ recalculateLeadScore: vi.fn() }));
vi.mock("./automation-rules", () => ({ runAutomationRules: vi.fn() }));
vi.mock("./property-timeline", () => ({ appendPropertyTimelineEvent: vi.fn() }));
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

const { recordCatalogueInteraction } = await import("./catalogue-interactions");
const { listCatalogueVisitRequests, getVisitRequestCatalogueOptions } = await import("./visit-requests");

const ORG = "org_default";

beforeEach(() => {
  vi.clearAllMocks();
  idCounter = 0;
  db.catalogueShares = [{ id: "cat1", organizationId: ORG, leadId: "lead_rahul", title: "Janakpuri shortlist", status: "ACTIVE", viewCount: 0 }];
  db.catalogueShareProperties = [
    { id: "csp1", catalogueShareId: "cat1", propertyId: "propF", sortOrder: 0, removedAt: null },
    { id: "csp2", catalogueShareId: "cat1", propertyId: "propM", sortOrder: 1, removedAt: null },
    { id: "csp3", catalogueShareId: "cat1", propertyId: "propK", sortOrder: 2, removedAt: null },
  ];
  db.catalogueInteractions = [];
  db.followUps = [];
  db.visits = [];
  db.visitProperties = [];
});

// ---------------------------------------------------------------------------
// The public request creates NO visit
// ---------------------------------------------------------------------------

describe("public Request Visit", () => {
  it("records a request and a follow-up, and creates NO Visit", async () => {
    const interaction = await recordCatalogueInteraction("cat1", {
      type: "VISIT_REQUESTED",
      propertyId: "propF",
      preferredDate: "2026-08-18",
      preferredWindow: "Morning",
      message: "Weekend would suit us",
    });

    expect(interaction).toBeTruthy();
    expect(db.catalogueInteractions).toHaveLength(1);
    expect(db.catalogueInteractions[0].type).toBe("VISIT_REQUESTED");
    // The client's request is unresolved until an Admin confirms it.
    expect(db.catalogueInteractions[0].scheduledVisitId).toBeNull();

    // A human is queued to act on it - this is the whole point of a request.
    expect(db.followUps).toHaveLength(1);
    expect(db.followUps[0].type).toBe("VISIT_CONFIRMATION");

    // And absolutely nothing was booked.
    expect(visitCreate).not.toHaveBeenCalled();
    expect(visitPropertyCreate).not.toHaveBeenCalled();
    expect(db.visits).toHaveLength(0);
    expect(db.visitProperties).toHaveLength(0);
  });

  it("a bulk request across several properties still creates no Visit, one request row per property", async () => {
    for (const propertyId of ["propF", "propM", "propK"]) {
      await recordCatalogueInteraction("cat1", { type: "VISIT_REQUESTED", propertyId, preferredWindow: "Evening" });
    }

    expect(db.catalogueInteractions).toHaveLength(3);
    expect(visitCreate).not.toHaveBeenCalled();
    expect(db.visits).toHaveLength(0);
  });

  it("refuses a property that is not in the catalogue", async () => {
    await expect(recordCatalogueInteraction("cat1", { type: "VISIT_REQUESTED", propertyId: "propX" })).rejects.toThrow(/not part of this catalogue/);
    expect(db.catalogueInteractions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The Admin queue
// ---------------------------------------------------------------------------

describe("admin visit-request queue", () => {
  it("makes a fresh client request visible and actionable to the Admin", async () => {
    await recordCatalogueInteraction("cat1", { type: "VISIT_REQUESTED", propertyId: "propF", preferredDate: "2026-08-18", preferredWindow: "Morning", message: "Weekend would suit us" });

    const requests = await listCatalogueVisitRequests(ORG);
    expect(requests).toHaveLength(1);

    const request = requests[0];
    expect(request.status).toBe("PENDING");
    expect(request.clientName).toBe("Rahul Sharma");
    expect(request.leadCode).toBe("LEAD-0001");
    expect(request.catalogueTitle).toBe("Janakpuri shortlist");
    expect(request.clientPhone).toBe("+919876543210");
    expect(request.propertyCount).toBe(1);
    expect(request.requestedProperties[0].propertyId).toBe("propF");
    expect(request.preferredDate).toBe("2026-08-18");
    expect(request.preferredWindow).toBe("Morning");
    expect(request.message).toBe("Weekend would suit us");
    expect(request.requestedAt).toBeInstanceOf(Date);
    expect(request.scheduledVisitId).toBeNull();
  });

  it("groups one bulk request into a single actionable item carrying every requested property", async () => {
    for (const propertyId of ["propF", "propM"]) {
      await recordCatalogueInteraction("cat1", { type: "VISIT_REQUESTED", propertyId });
    }

    const requests = await listCatalogueVisitRequests(ORG);
    expect(requests).toHaveLength(1);
    expect(requests[0].propertyCount).toBe(2);
    expect(requests[0].requestedProperties.map((p) => p.propertyId).sort()).toEqual(["propF", "propM"]);
    expect(requests[0].interactionIds).toHaveLength(2);
  });

  it("shows an already-confirmed request as SCHEDULED with its visit, not as pending work", async () => {
    await recordCatalogueInteraction("cat1", { type: "VISIT_REQUESTED", propertyId: "propF" });
    // Simulate the Admin having confirmed it.
    db.catalogueInteractions[0].scheduledVisitId = "visit_1";
    db.catalogueInteractions[0].scheduledAt = new Date();

    const requests = await listCatalogueVisitRequests(ORG);
    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("SCHEDULED");
    expect(requests[0].scheduledVisitId).toBe("visit_1");

    // And the pending-only view no longer offers it for scheduling at all.
    const pendingOnly = await listCatalogueVisitRequests(ORG, { includeScheduled: false });
    expect(pendingOnly).toHaveLength(0);
  });

  it("keeps a later request separate from an already-confirmed one instead of merging them", async () => {
    await recordCatalogueInteraction("cat1", { type: "VISIT_REQUESTED", propertyId: "propF" });
    db.catalogueInteractions[0].scheduledVisitId = "visit_1";
    // The client comes back and asks about another property.
    await recordCatalogueInteraction("cat1", { type: "VISIT_REQUESTED", propertyId: "propM" });

    const requests = await listCatalogueVisitRequests(ORG);
    expect(requests).toHaveLength(2);
    expect(requests[0].status).toBe("PENDING");
    expect(requests[0].requestedProperties.map((p) => p.propertyId)).toEqual(["propM"]);
    expect(requests[1].status).toBe("SCHEDULED");
  });

  it("never leaks another organization's requests", async () => {
    await recordCatalogueInteraction("cat1", { type: "VISIT_REQUESTED", propertyId: "propF" });
    expect(await listCatalogueVisitRequests("org_other")).toHaveLength(0);
  });

  it("survives malformed request metadata rather than hiding the request from the queue", async () => {
    await recordCatalogueInteraction("cat1", { type: "VISIT_REQUESTED", propertyId: "propF" });
    db.catalogueInteractions[0].metadata = "{not json";

    const requests = await listCatalogueVisitRequests(ORG);
    expect(requests).toHaveLength(1);
    expect(requests[0].preferredDate).toBeNull();
  });

  it("pre-fills the scheduling picker with exactly the requested properties, offering the rest of the catalogue as opt-in", async () => {
    await recordCatalogueInteraction("cat1", { type: "VISIT_REQUESTED", propertyId: "propM" });

    const requests = await listCatalogueVisitRequests(ORG);
    const options = await getVisitRequestCatalogueOptions(requests, ORG);

    const forCatalogue = options["cat1"];
    // Every catalogue property is offered...
    expect(forCatalogue.map((o) => o.propertyId)).toEqual(["propF", "propM", "propK"]);
    // ...but only the one the client actually asked for is pre-selected.
    expect(forCatalogue.filter((o) => o.requested).map((o) => o.propertyId)).toEqual(["propM"]);
  });
});

// ---------------------------------------------------------------------------
// No WhatsApp anywhere in this workflow
// ---------------------------------------------------------------------------

describe("no WhatsApp send in the request -> confirm -> complete workflow", () => {
  const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

  const WORKFLOW_SOURCES = [
    "./visits.ts",
    "./visit-requests.ts",
    "./visit-progress.ts",
    "./visit-detail-dto.ts",
    "./catalogue-interactions.ts",
    "../app/api/catalogues/[id]/schedule-visit/route.ts",
    "../app/api/visits/[id]/start/route.ts",
    "../app/api/visits/[id]/complete/route.ts",
    "../app/api/visits/[id]/properties/[propertyId]/route.ts",
    "../app/api/visits/[id]/preferred/route.ts",
    "../app/api/visits/[id]/reschedule/route.ts",
    "../app/api/visits/[id]/cancel/route.ts",
    "../components/visits/pending-visit-requests.tsx",
  ];

  it("no module in the workflow imports a WhatsApp sender", () => {
    for (const path of WORKFLOW_SOURCES) {
      const source = read(path);
      // Comments explaining WHY no WhatsApp is sent are fine and desirable;
      // an actual import of the messaging surface is not.
      expect(source, `${path} must not import a WhatsApp module`).not.toMatch(/^\s*import[^\n]*whatsapp/im);
    }
  });

  it("no module in the workflow calls a WhatsApp send function", () => {
    for (const path of WORKFLOW_SOURCES) {
      const source = read(path);
      expect(source, `${path} must not call a WhatsApp sender`).not.toMatch(/sendWhatsApp|getWhatsAppAdapter|sendTemplateMessage/);
    }
  });

  it("the client-facing confirmation UI promises no client message", () => {
    const source = read("../components/visits/pending-visit-requests.tsx");
    expect(source).toMatch(/No message is sent to the client from here/);
  });
});
