import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("./prisma", () => ({ prisma: { property: { findMany: (...a: unknown[]) => findMany(...a) } } }));

const { findNearbyProperties, isAllowedRadius, ALLOWED_RADIUS_METERS } = await import("./nearby-properties");

const CENTER = { latitude: 28.6219, longitude: 77.0878 }; // Janakpuri

beforeEach(() => {
  vi.clearAllMocks();
});

function propAt(id: string, offsetMeters: number) {
  // ~0.001 degree latitude ~= 111m
  const offsetDeg = offsetMeters / 111_000;
  return { id, latitude: CENTER.latitude + offsetDeg, longitude: CENTER.longitude, status: "AVAILABLE" };
}

describe("findNearbyProperties", () => {
  it("includes a property within the radius and excludes one beyond it", async () => {
    findMany.mockResolvedValue([propAt("near", 500), propAt("far", 8000)]);
    const results = await findNearbyProperties({ organizationId: "org1", center: CENTER, radiusMeters: 3000 });
    expect(results.map((r) => r.property.id)).toEqual(["near"]);
  });

  it("sorts results nearest-first", async () => {
    findMany.mockResolvedValue([propAt("b", 2000), propAt("a", 500)]);
    const results = await findNearbyProperties({ organizationId: "org1", center: CENTER, radiusMeters: 5000 });
    expect(results.map((r) => r.property.id)).toEqual(["a", "b"]);
  });

  it("excludes properties with no geocoded coordinate", async () => {
    findMany.mockResolvedValue([{ id: "no-coords", latitude: null, longitude: null, status: "AVAILABLE" }]);
    const results = await findNearbyProperties({ organizationId: "org1", center: CENTER, radiusMeters: 5000 });
    expect(results).toEqual([]);
  });

  it("returns an empty array when nothing is within radius", async () => {
    findMany.mockResolvedValue([propAt("far", 20_000)]);
    const results = await findNearbyProperties({ organizationId: "org1", center: CENTER, radiusMeters: 1000 });
    expect(results).toEqual([]);
  });

  it("respects the take limit", async () => {
    findMany.mockResolvedValue([propAt("a", 100), propAt("b", 200), propAt("c", 300)]);
    const results = await findNearbyProperties({ organizationId: "org1", center: CENTER, radiusMeters: 5000, take: 2 });
    expect(results).toHaveLength(2);
  });

  it("scopes the query to the given organization", async () => {
    findMany.mockResolvedValue([]);
    await findNearbyProperties({ organizationId: "org42", center: CENTER, radiusMeters: 1000 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org42" }) }));
  });
});

describe("isAllowedRadius", () => {
  it("accepts the four documented radius options", () => {
    for (const r of ALLOWED_RADIUS_METERS) expect(isAllowedRadius(r)).toBe(true);
  });

  it("rejects an arbitrary radius", () => {
    expect(isAllowedRadius(2500)).toBe(false);
  });
});
