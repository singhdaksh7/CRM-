import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AddFollowUpModal } from "@/components/followups/add-followup-modal";
import { FollowUpRow } from "@/components/followups/followup-row";
import { EmptyState } from "@/components/ui/states";
import { KpiCard } from "@/components/ui/kpi-card";
import { Pagination, DEFAULT_PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { withTiming } from "@/lib/perf";
import { AlertTriangle, CalendarClock, CalendarDays } from "lucide-react";
import { getOrganizationId } from "@/lib/organization";
import { assignedToSelect } from "@/lib/user-select";
import { previousCustomerContext } from "@/lib/followup-context";
import type { Prisma } from "@prisma/client";

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const organizationId = getOrganizationId(session!.user);
  const sp = await searchParams;
  const bucket = sp.bucket ?? "today";
  const page = parsePage(sp.page);

  const scoped: Prisma.FollowUpWhereInput = {
    organizationId,
    leadId: { not: null },
    ...(session!.user.role === "FIELD_EXECUTIVE" ? { ownerId: session!.user.id } : {}),
  };

  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);

  const where: Prisma.FollowUpWhereInput = { ...scoped };
  if (bucket === "overdue") { where.status = { not: "COMPLETED" }; where.dueDate = { lt: startOfToday }; }
  else if (bucket === "today") where.dueDate = { gte: startOfToday, lte: endOfToday };
  else if (bucket === "upcoming") where.dueDate = { gt: endOfToday };

  const [overdueCount, todayCount, upcomingCount, leads, employees, followUps, followUpsTotal] = await withTiming("followUpsPageQuery", "/follow-ups", () =>
    Promise.all([
      prisma.followUp.count({ where: { ...scoped, status: { not: "COMPLETED" }, dueDate: { lt: startOfToday } } }),
      prisma.followUp.count({ where: { ...scoped, dueDate: { gte: startOfToday, lte: endOfToday } } }),
      prisma.followUp.count({ where: { ...scoped, dueDate: { gt: endOfToday } } }),
      prisma.lead.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.user.findMany({ where: { organizationId, status: "ACTIVE" }, select: assignedToSelect }),
      prisma.followUp.findMany({
        where,
        include: {
          lead: {
            select: {
              id: true,
              clientName: true,
              activities: {
                where: { organizationId, type: { in: ["PHONE_CALL_MADE", "CLIENT_REPLY_RECEIVED", "NOTE_ADDED"] } },
                select: { type: true, description: true, metadata: true, createdAt: true },
                orderBy: { createdAt: "desc" },
                take: 20,
              },
            },
          },
          owner: { select: assignedToSelect },
        },
        orderBy: { dueDate: "asc" },
        skip: (page - 1) * DEFAULT_PAGE_SIZE,
        take: DEFAULT_PAGE_SIZE,
      }),
      prisma.followUp.count({ where }),
    ])
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#09090B]">Follow-ups</h1>
          <p className="mt-1 text-sm text-[#52525B]">Stay on top of client conversations and action items</p>
        </div>
        <AddFollowUpModal leads={leads} employees={employees} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/follow-ups?bucket=overdue" className="block transition-transform hover:-translate-y-0.5">
          <KpiCard label="Overdue" value={overdueCount} icon={AlertTriangle} tone="red" />
        </Link>
        <Link href="/follow-ups?bucket=today" className="block transition-transform hover:-translate-y-0.5">
          <KpiCard label="Due Today" value={todayCount} icon={CalendarClock} tone="amber" />
        </Link>
        <Link href="/follow-ups?bucket=upcoming" className="block transition-transform hover:-translate-y-0.5">
          <KpiCard label="Upcoming" value={upcomingCount} icon={CalendarDays} tone="slate" />
        </Link>
      </div>

      <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#71717A]">
          {bucket} Follow-ups ({followUpsTotal})
        </h3>
        {followUps.length === 0 ? (
          <EmptyState title="No follow-ups in this bucket" />
        ) : (
          <div className="divide-y divide-[#E4E4E7]">
            {followUps.map((f) => (
              <FollowUpRow
                key={f.id}
                followUp={{ ...f, lead: f.lead! }}
                previousContext={previousCustomerContext(f.lead?.activities ?? [])}
              />
            ))}
          </div>
        )}
      </div>

      <Pagination basePath="/follow-ups" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={followUpsTotal} />
    </div>
  );
}
