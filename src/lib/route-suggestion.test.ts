import { describe, it, expect, vi, beforeEach } from "vitest";

const visitFindMany = vi.fn();
vi.mock("./prisma", () => ({ prisma: { visit: { findMany: (...a: unknown[]) => visitFindMany(...a) } } }));

let providerName: "GOOGLE" | "DISABLED" = "GOOGLE";
vi.mock("@/integrations/maps", () => ({ getMapsProvider: () => ({ name: providerName }) }));

const getDistanceMatrixCached = vi.fn();
vi.mock("./geocoding", () => ({ getDistanceMatrixCached: (...a: unknown[]) => getDistanceMatrixCached(...a) }));

const { buildSuggestedRoute } = await import("./route-suggestion");

beforeEach(() => {
  vi.clearAllMocks();
  providerName = "GOOGLE";
});

function visit(id: string, time: string, coords: { latitude: number; longitude: number } | null) {
  return {
    id,
    visitTime: time,
    lead: { clientName: `Client ${id}` },
    property: { title: `Property ${id}`, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null },
  };
}

describe("buildSuggestedRoute", () => {
  it("orders stops chronologically (never reorders by proximity)", async () => {
    visitFindMany.mockResolvedValue([visit("a", "09:00", { latitude: 28.6, longitude: 77.1 }), visit("b", "10:00", { latitude: 28.7, longitude: 77.2 })]);
    const route = await buildSuggestedRoute({ employeeId: "e1", organizationId: "org1", date: new Date() });
    expect(route.stops.map((s) => s.visitId)).toEqual(["a", "b"]);
  });

  it("computes real travel time between consecutive stops via the Distance Matrix", async () => {
    visitFindMany.mockResolvedValue([visit("a", "09:00", { latitude: 28.6, longitude: 77.1 }), visit("b", "10:00", { latitude: 28.7, longitude: 77.2 })]);
    getDistanceMatrixCached.mockResolvedValue({ rows: [[{ distanceMeters: 5000, durationSeconds: 900, status: "OK" }]] });

    const route = await buildSuggestedRoute({ employeeId: "e1", organizationId: "org1", date: new Date() });
    expect(route.stops[0].travelFromPreviousMinutes).toBeNull(); // first stop has no "previous"
    expect(route.stops[1].travelFromPreviousMinutes).toBe(15);
    expect(route.stops[1].travelSource).toBe("GOOGLE");
  });

  it("falls back to a distance-only estimate when Maps is disabled", async () => {
    providerName = "DISABLED";
    visitFindMany.mockResolvedValue([visit("a", "09:00", { latitude: 28.6, longitude: 77.1 }), visit("b", "10:00", { latitude: 28.7, longitude: 77.2 })]);

    const route = await buildSuggestedRoute({ employeeId: "e1", organizationId: "org1", date: new Date() });
    expect(route.stops[1].travelSource).toBe("ESTIMATED");
    expect(route.stops[1].travelFromPreviousMinutes).toBeNull(); // no speed assumption, distance only
    expect(route.stops[1].travelFromPreviousMeters).toBeGreaterThan(0);
    expect(getDistanceMatrixCached).not.toHaveBeenCalled();
  });

  it("counts and skips travel computation for unmapped stops", async () => {
    visitFindMany.mockResolvedValue([visit("a", "09:00", null), visit("b", "10:00", { latitude: 28.7, longitude: 77.2 })]);
    const route = await buildSuggestedRoute({ employeeId: "e1", organizationId: "org1", date: new Date() });
    expect(route.unmappedCount).toBe(1);
    expect(route.stops[1].travelFromPreviousMinutes).toBeNull();
  });

  it("builds a full-route Google Maps URL when 2+ stops are mapped", async () => {
    visitFindMany.mockResolvedValue([
      visit("a", "09:00", { latitude: 28.6, longitude: 77.1 }),
      visit("b", "10:00", { latitude: 28.65, longitude: 77.15 }),
      visit("c", "11:00", { latitude: 28.7, longitude: 77.2 }),
    ]);
    getDistanceMatrixCached.mockResolvedValue({ rows: [[{ distanceMeters: 1000, durationSeconds: 300, status: "OK" }]] });

    const route = await buildSuggestedRoute({ employeeId: "e1", organizationId: "org1", date: new Date() });
    expect(route.fullRouteUrl).toContain("origin=28.6%2C77.1");
    expect(route.fullRouteUrl).toContain("destination=28.7%2C77.2");
    expect(route.fullRouteUrl).toContain("waypoints=28.65%2C77.15");
  });

  it("returns a null full-route URL when fewer than 2 stops are mapped", async () => {
    visitFindMany.mockResolvedValue([visit("a", "09:00", { latitude: 28.6, longitude: 77.1 }), visit("b", "10:00", null)]);
    const route = await buildSuggestedRoute({ employeeId: "e1", organizationId: "org1", date: new Date() });
    expect(route.fullRouteUrl).toBeNull();
  });
});
