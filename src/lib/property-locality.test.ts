import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();
const findMany = vi.fn();

const fakePrisma = {
  propertyLocality: {
    findUnique: (...a: unknown[]) => findUnique(...a),
    create: (...a: unknown[]) => create(...a),
    findMany: (...a: unknown[]) => findMany(...a),
  },
};

vi.mock("./prisma", () => ({ prisma: fakePrisma }));

const { resolveOrCreatePropertyLocality, searchPropertyLocalities } = await import("./property-locality");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveOrCreatePropertyLocality (A8)", () => {
  it("returns null for a blank area, never creating a row", async () => {
    const id = await resolveOrCreatePropertyLocality("org1", "   ", "user1");
    expect(id).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("reuses an existing locality matched case-insensitively/whitespace-insensitively", async () => {
    findUnique.mockResolvedValue({ id: "loc1" });
    const id = await resolveOrCreatePropertyLocality("org1", "  Mansarovar   Garden ", "user1");
    expect(id).toBe("loc1");
    expect(create).not.toHaveBeenCalled();
    expect(findUnique.mock.calls[0][0].where.organizationId_normalizedName).toEqual({
      organizationId: "org1",
      normalizedName: "mansarovar garden",
    });
  });

  it("creates a new locality (as data, not a hardcoded list) when none exists yet", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "loc2" });
    const id = await resolveOrCreatePropertyLocality("org1", "Basai Darapur", "user1");
    expect(id).toBe("loc2");
    expect(create).toHaveBeenCalledWith({
      data: { organizationId: "org1", name: "Basai Darapur", normalizedName: "basai darapur", createdById: "user1" },
      select: { id: true },
    });
  });

  it("scopes duplicate protection to the organization - two orgs can each have their own Kirti Nagar", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "loc-orgB" });
    await resolveOrCreatePropertyLocality("orgB", "Kirti Nagar", "user2");
    expect(findUnique.mock.calls[0][0].where.organizationId_normalizedName.organizationId).toBe("orgB");
    expect(create.mock.calls[0][0].data.organizationId).toBe("orgB");
  });

  it("recovers gracefully from a race (unique constraint violation) by re-reading the winner", async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "loc-winner" });
    const uniqueViolation = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    create.mockRejectedValue(uniqueViolation);

    const id = await resolveOrCreatePropertyLocality("org1", "Kirti Nagar", "user1");

    expect(id).toBe("loc-winner");
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("propagates a genuine, non-duplicate database error", async () => {
    findUnique.mockResolvedValue(null);
    create.mockRejectedValue(new Error("connection lost"));
    await expect(resolveOrCreatePropertyLocality("org1", "Kirti Nagar", "user1")).rejects.toThrow("connection lost");
  });

  it("accepts a null actorId (system/webhook-created properties)", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "loc3" });
    await resolveOrCreatePropertyLocality("org1", "Rajouri Garden", null);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdById: null }) }));
  });
});

describe("searchPropertyLocalities - the read side the locality picker uses", () => {
  it("scopes the query to the given organization and orders by name", async () => {
    findMany.mockResolvedValue([]);
    await searchPropertyLocalities("org1", null, 20);
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: "org1" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 20,
    });
  });

  it("adds a case-insensitive contains filter when a query is given", async () => {
    findMany.mockResolvedValue([{ id: "loc1", name: "Basai Darapur" }]);
    const result = await searchPropertyLocalities("org1", "basai", 20);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org1", name: { contains: "basai", mode: "insensitive" } },
      })
    );
    expect(result).toEqual([{ id: "loc1", name: "Basai Darapur" }]);
  });

  it("trims the query before searching and ignores a whitespace-only query", async () => {
    findMany.mockResolvedValue([]);
    await searchPropertyLocalities("org1", "  Basai  ", 20);
    expect(findMany.mock.calls[0][0].where.name).toEqual({ contains: "Basai", mode: "insensitive" });

    findMany.mockClear();
    await searchPropertyLocalities("org1", "   ", 20);
    expect(findMany.mock.calls[0][0].where).toEqual({ organizationId: "org1" });
  });
});
