import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();

const fakePrisma = { propertyLocality: { findUnique: (...a: unknown[]) => findUnique(...a), create: (...a: unknown[]) => create(...a) } };

vi.mock("./prisma", () => ({ prisma: fakePrisma }));

const { resolveOrCreatePropertyLocality } = await import("./property-locality");

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
