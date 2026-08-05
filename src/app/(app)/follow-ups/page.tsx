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
import type { Prisma } from "@prisma/client";

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const bucket = sp.bucket ?? "today";
  const page = parsePage(sp.page);

  const scoped: Prisma.FollowUpWhereInput = {
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
      prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.user.findMany({ where: { status: "ACTIVE" } }),
      prisma.followUp.findMany({ where, include: { lead: true, owner: true }, orderBy: { dueDate: "asc" }, skip: (page - 1) * DEFAULT_PAGE_SIZE, take: DEFAULT_PAGE_SIZE }),
      prisma.followUp.count({ where }),
    ])
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1B2430]">Follow-ups</h1>
          <p className="text-sm text-[#596579]">Stay on top of client follow-ups</p>
        </div>
        <AddFollowUpModal leads={leads} employees={employees} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/follow-ups?bucket=overdue"><KpiCard label="Overdue" value={overdueCount} icon={AlertTriangle} tone="red" /></Link>
        <Link href="/follow-ups?bucket=today"><KpiCard label="Due Today" value={todayCount} icon={CalendarClock} tone="amber" /></Link>
        <Link href="/follow-ups?bucket=upcoming"><KpiCard label="Upcoming" value={upcomingCount} icon={CalendarDays} tone="blue" /></Link>
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
        <h3 className="mb-2 text-sm font-bold capitalize text-[#1B2430]">{bucket} Follow-ups ({followUpsTotal})</h3>
        {followUps.length === 0 ? (
          <EmptyState title="No follow-ups in this bucket" />
        ) : (
          <div>
            {followUps.map((f) => (<FollowUpRow key={f.id} followUp={{ ...f, lead: f.lead! }} />))}
          </div>
        )}
      </div>

      <Pagination basePath="/follow-ups" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={followUpsTotal} />
    </div>
  );
}
