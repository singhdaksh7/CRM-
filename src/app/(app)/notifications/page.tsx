import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notificationVisibilityWhere } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";
import { NotificationList } from "@/components/notifications/notification-list";
import { NOTIFICATION_LABELS } from "@/components/notifications/notification-meta";
import { Pagination, DEFAULT_PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { withTiming } from "@/lib/perf";
import { cn } from "@/lib/utils";
import type { NotificationType, Prisma } from "@prisma/client";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const typeFilter = sp.type as NotificationType | undefined;
  const unreadOnly = sp.unread === "true";
  const page = parsePage(sp.page);

  const where: Prisma.NotificationWhereInput = {
    organizationId: getOrganizationId(session!.user.id),
    ...notificationVisibilityWhere(session!.user.id, session!.user.role),
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const [notifications, totalCount] = await withTiming("notificationsPageQuery", "/notifications", () =>
    Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * DEFAULT_PAGE_SIZE, take: DEFAULT_PAGE_SIZE }),
      prisma.notification.count({ where }),
    ])
  );
  const types = Object.keys(NOTIFICATION_LABELS) as NotificationType[];

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E7ECF2] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Notifications Centre</h1>
        <p className="mt-1 text-sm text-[#596579]">Alerts & operational updates across leads, site visits, and follow-ups.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip href="/notifications" active={!typeFilter && !unreadOnly} label="All" />
        <FilterChip href="/notifications?unread=true" active={unreadOnly} label="Unread" />
        {types.map((t) => (
          <FilterChip key={t} href={`/notifications?type=${t}`} active={typeFilter === t} label={NOTIFICATION_LABELS[t]} />
        ))}
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-2 shadow-xs">
        <NotificationList notifications={notifications} />
      </div>

      <Pagination basePath="/notifications" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-all border",
        active
          ? "bg-[#3366FF] text-white border-[#3366FF] shadow-xs"
          : "bg-white text-[#596579] border-[#E7ECF2] hover:bg-[#F3F6FA] hover:text-[#1B2430]"
      )}
    >
      {label}
    </Link>
  );
}
