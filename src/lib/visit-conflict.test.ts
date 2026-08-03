import { describe, it, expect, vi, beforeEach } from "vitest";

const visitFindMany = vi.fn();
const propertyFindUnique = vi.fn();
vi.mock("./prisma", () => ({
  prisma: {
    visit: { findMany: (...a: unknown[]) => visitFindMany(...a) },
    property: { findUnique: (...a: unknown[]) => propertyFindUnique(...a) },
  },
}));

let providerName: "GOOGLE" | "DISABLED" = "GOOGLE";
vi.mock("@/integrations/maps", () => ({ getMapsProvider: () => ({ name: providerName }) }));

const getDirectionsCached = vi.fn();
vi.mock("./geocoding", () => ({ getDirectionsCached: (...a: unknown[]) => getDirectionsCached(...a) }));

const { checkVisitConflict, DEFAULT_VISIT_DURATION_MINUTES, DEFAULT_CONFLICT_BUFFER_MINUTES, FALLBACK_TRAVEL_ESTIMATE_MINUTES } = await import("./visit-conflict");

const THIS_PROPERTY = { latitude: 28.6, longitude: 77.1 };
const OTHER_PROPERTY = { latitude: 28.7, longitude: 77.3 };

beforeEach(() => {
  vi.clearAllMocks();
  providerName = "GOOGLE";
  propertyFindUnique.mockResolvedValue(THIS_PROPERTY);
});

function visitDate() {
  return new Date("2026-02-10T00:00:00.000Z");
}

describe("checkVisitConflict - no conflict", () => {
  it("returns NONE when there are no other visits that day", async () => {
    visitFindMany.mockResolvedValue([]);
    const result = await checkVisitConflict({ employeeId: "e1", organizationId: "org1", visitDate: visitDate(), visitTime: "10:00", propertyId: "p1" });
    expect(result.status).toBe("NONE");
  });

  it("returns NONE when the gap easily covers travel time + buffer", async () => {
    visitFindMany.mockResolvedValue([
      { id: "v1", visitDate: visitDate(), visitTime: "08:00", property: { id: "other", ...OTHER_PROPERTY } },
    ]);
    getDirectionsCached.mockResolvedValue({ distanceMeters: 5000, durationSeconds: 600, durationInTrafficSeconds: 600, polyline: null });
    // 08:00 visit + 45min default duration = ends 08:45; this visit at 10:00 -> 75 min gap, well over 10+15=25 min required
    const result = await checkVisitConflict({ employeeId: "e1", organizationId: "org1", visitDate: visitDate(), visitTime: "10:00", propertyId: "p1" });
    expect(result.status).toBe("NONE");
  });
});

describe("checkVisitConflict - exact time overlap", () => {
  it("flags an exact double-booking regardless of Maps configuration", async () => {
    visitFindMany.mockResolvedValue([{ id: "v1", visitDate: visitDate(), visitTime: "10:00", property: { id: "other", ...OTHER_PROPERTY } }]);
    const result = await checkVisitConflict({ employeeId: "e1", organizationId: "org1", visitDate: visitDate(), visitTime: "10:00", propertyId: "p1" });
    expect(result.status).toBe("WARNING");
    expect(result.routeSource).toBe("NONE");
  });
});

describe("checkVisitConflict - travel-buffer conflict", () => {
  it("flags a warning when the gap is shorter than travel time + buffer (real Google directions)", async () => {
    visitFindMany.mockResolvedValue([{ id: "v1", visitDate: visitDate(), visitTime: "09:30", property: { id: "other", ...OTHER_PROPERTY } }]);
    getDirectionsCached.mockResolvedValue({ distanceMeters: 20000, durationSeconds: 1800, durationInTrafficSeconds: 1800, polyline: null }); // 30 min travel
    // 09:30 + 45min duration = ends 10:15; this visit at 10:30 -> 15 min gap; needs 30+15=45min
    const result = await checkVisitConflict({ employeeId: "e1", organizationId: "org1", visitDate: visitDate(), visitTime: "10:30", propertyId: "p1" });
    expect(result.status).toBe("WARNING");
    expect(result.routeSource).toBe("GOOGLE");
    expect(result.travelDurationMinutes).toBe(30);
  });
});

describe("checkVisitConflict - disabled-provider fallback", () => {
  it("uses the fixed fallback estimate and labels it as estimated when Maps is disabled", async () => {
    providerName = "DISABLED";
    visitFindMany.mockResolvedValue([{ id: "v1", visitDate: visitDate(), visitTime: "09:30", property: { id: "other", ...OTHER_PROPERTY } }]);
    const result = await checkVisitConflict({ employeeId: "e1", organizationId: "org1", visitDate: visitDate(), visitTime: "10:30", propertyId: "p1" });
    expect(result.routeSource).toBe("ESTIMATED");
    expect(result.travelDurationMinutes).toBe(FALLBACK_TRAVEL_ESTIMATE_MINUTES);
    expect(getDirectionsCached).not.toHaveBeenCalled();
  });

  it("falls back to the estimate (not a thrown error) when the Directions call fails", async () => {
    visitFindMany.mockResolvedValue([{ id: "v1", visitDate: visitDate(), visitTime: "09:30", property: { id: "other", ...OTHER_PROPERTY } }]);
    getDirectionsCached.mockRejectedValue(new Error("timeout"));
    const result = await checkVisitConflict({ employeeId: "e1", organizationId: "org1", visitDate: visitDate(), visitTime: "10:30", propertyId: "p1" });
    expect(result.routeSource).toBe("ESTIMATED");
  });
});

describe("checkVisitConflict - missing location", () => {
  it("does not flag a conflict when either property has no coordinates (nothing to estimate from)", async () => {
    visitFindMany.mockResolvedValue([{ id: "v1", visitDate: visitDate(), visitTime: "09:30", property: { id: "other", latitude: null, longitude: null } }]);
    const result = await checkVisitConflict({ employeeId: "e1", organizationId: "org1", visitDate: visitDate(), visitTime: "10:30", propertyId: "p1" });
    expect(result.status).toBe("NONE");
    expect(getDirectionsCached).not.toHaveBeenCalled();
  });
});

describe("checkVisitConflict - same property back-to-back", () => {
  it("still checks travel (same property means ~0 distance, so it should never conflict)", async () => {
    visitFindMany.mockResolvedValue([{ id: "v1", visitDate: visitDate(), visitTime: "09:30", property: { id: "p1", ...THIS_PROPERTY } }]);
    getDirectionsCached.mockResolvedValue({ distanceMeters: 0, durationSeconds: 0, durationInTrafficSeconds: 0, polyline: null });
    const result = await checkVisitConflict({ employeeId: "e1", organizationId: "org1", visitDate: visitDate(), visitTime: "10:30", propertyId: "p1" });
    expect(result.status).toBe("NONE");
  });
});

describe("constants", () => {
  it("exposes the documented defaults", () => {
    expect(DEFAULT_VISIT_DURATION_MINUTES).toBeGreaterThan(0);
    expect(DEFAULT_CONFLICT_BUFFER_MINUTES).toBeGreaterThan(0);
  });
});
