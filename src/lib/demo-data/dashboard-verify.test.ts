import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDemoVerificationMetrics } from "./dashboard-verify";

vi.mock("../prisma", () => ({
  prisma: {
    property: { count: vi.fn() },
    lead: { count: vi.fn() },
    catalogueShare: { count: vi.fn() },
    notification: { count: vi.fn() },
  },
}));

import { prisma } from "../prisma";

describe("getDemoVerificationMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes every query to the given organizationId", async () => {
    (prisma.property.count as ReturnType<typeof vi.fn>).mockResolvedValue(10);
    (prisma.lead.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    (prisma.catalogueShare.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    (prisma.notification.count as ReturnType<typeof vi.fn>).mockResolvedValue(20);

    const result = await getDemoVerificationMetrics("org_default");

    expect(result).toEqual({ totalProperties: 10, availableProperties: 10, totalLeads: 5, catalogueSharesCount: 3, notificationsCount: 20 });
    for (const call of (prisma.property.count as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0].where.organizationId).toBe("org_default");
    }
    expect((prisma.lead.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where.organizationId).toBe("org_default");
    expect((prisma.catalogueShare.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where.organizationId).toBe("org_default");
    expect((prisma.notification.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where.organizationId).toBe("org_default");
  });

  it("passes a different organizationId through to every query when called for a different org", async () => {
    (prisma.property.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.lead.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.catalogueShare.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.notification.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await getDemoVerificationMetrics("some_other_org");

    expect((prisma.lead.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where.organizationId).toBe("some_other_org");
    expect((prisma.property.count as ReturnType<typeof vi.fn>).mock.calls[0][0].where.organizationId).toBe("some_other_org");
  });

  it("distinguishes availableProperties (status: AVAILABLE) from totalProperties", async () => {
    const propertyCount = prisma.property.count as ReturnType<typeof vi.fn>;
    propertyCount.mockImplementation((args: { where: { status?: string } }) => Promise.resolve(args.where.status === "AVAILABLE" ? 4 : 9));
    (prisma.lead.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.catalogueShare.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.notification.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const result = await getDemoVerificationMetrics("org_default");
    expect(result.totalProperties).toBe(9);
    expect(result.availableProperties).toBe(4);
  });

  it("propagates a query failure instead of swallowing it", async () => {
    (prisma.property.count as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connection lost"));
    (prisma.lead.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.catalogueShare.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.notification.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await expect(getDemoVerificationMetrics("org_default")).rejects.toThrow("connection lost");
  });
});
