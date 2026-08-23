import { describe, it, expect, vi, beforeEach } from "vitest";
import { countDemoSearchResults } from "./search-verify";

vi.mock("../prisma", () => ({
  prisma: {
    lead: { count: vi.fn() },
    property: { count: vi.fn() },
  },
}));

import { prisma } from "../prisma";

describe("countDemoSearchResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes both lead and property queries to the given organizationId", async () => {
    (prisma.lead.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.property.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    const total = await countDemoSearchResults("DEMO-PROP", { organizationId: "org_default", role: "ADMIN", userId: "kp-demo-emp-00001" });

    expect(total).toBe(5);
    expect((prisma.lead.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where.organizationId).toBe("org_default");
    expect((prisma.property.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where.organizationId).toBe("org_default");
  });

  it("fails to find results scoped to a different organizationId than the one holding the data", async () => {
    // Simulates the mock only "having" rows for org_default - querying a
    // different organizationId should legitimately come back empty, since
    // the where-clause organizationId differs.
    (prisma.lead.count as ReturnType<typeof vi.fn>).mockImplementation((args: { where: { organizationId: string } }) =>
      Promise.resolve(args.where.organizationId === "org_default" ? 4 : 0)
    );
    (prisma.property.count as ReturnType<typeof vi.fn>).mockImplementation((args: { where: { organizationId: string } }) =>
      Promise.resolve(args.where.organizationId === "org_default" ? 6 : 0)
    );

    const wrongOrgTotal = await countDemoSearchResults("DEMO", { organizationId: "some_other_org", role: "ADMIN", userId: "u1" });
    const rightOrgTotal = await countDemoSearchResults("DEMO", { organizationId: "org_default", role: "ADMIN", userId: "u1" });

    expect(wrongOrgTotal).toBe(0);
    expect(rightOrgTotal).toBe(10);
  });

  it("scopes FIELD_EXECUTIVE lead results to their own assigned leads", async () => {
    (prisma.lead.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.property.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await countDemoSearchResults("DEMO", { organizationId: "org_default", role: "FIELD_EXECUTIVE", userId: "kp-demo-emp-00002" });

    expect((prisma.lead.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where.assignedToId).toBe("kp-demo-emp-00002");
  });

  it("caps each entity type's contribution at the per-entity limit (8), matching the real search UI's page size", async () => {
    (prisma.lead.count as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (prisma.property.count as ReturnType<typeof vi.fn>).mockResolvedValue(500);

    const total = await countDemoSearchResults("DEMO", { organizationId: "org_default", role: "ADMIN", userId: "u1" });
    expect(total).toBe(16); // 8 + 8
  });
});
