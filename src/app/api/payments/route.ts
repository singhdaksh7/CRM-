import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { readTake, readSkip } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user.id);
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = { organizationId };

    const status = sp.get("status");
    if (status) where.status = status;
    const direction = sp.get("direction");
    if (direction) where.direction = direction;
    const dealId = sp.get("dealId");
    if (dealId) where.dealId = dealId;
    const method = sp.get("method");
    if (method) where.method = method;

    const take = readTake(sp);
    const skip = readSkip(sp);

    // Totals are computed via aggregate over the *whole* filtered set, not
    // just the current page, so they stay correct regardless of pagination.
    const [payments, total, totalsByStatus] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: { deal: { select: { id: true, dealCode: true, dealType: true } } },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.payment.count({ where }),
      prisma.payment.groupBy({ by: ["status"], where, _sum: { amount: true } }),
    ]);

    const sumFor = (statuses: string[]) => totalsByStatus.filter((t) => statuses.includes(t.status)).reduce((s, t) => s + (t._sum.amount ?? 0), 0);
    const totals = {
      pending: sumFor(["PENDING", "PARTIAL"]),
      paid: sumFor(["PAID"]),
      overdue: sumFor(["OVERDUE"]),
    };

    return NextResponse.json({ payments, total, take, skip, totals });
  } catch (err) {
    return handleApiError(err);
  }
}
