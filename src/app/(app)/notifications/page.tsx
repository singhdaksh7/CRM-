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
    organizationId: getOrganizationId(session!.user),
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
    <div className="space-y-5">
      <div className="border-b border-[#E4E4E7] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#09090B]">Notifications Centre</h1>
        <p className="mt-1 text-sm text-[#52525B]">Alerts & operational updates across leads, site visits, and follow-ups.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip href="/notifications" active={!typeFilter && !unreadOnly} label="All" />
        <FilterChip href="/notifications?unread=true" active={unreadOnly} label="Unread" />
        {types.map((t) => (
          <FilterChip key={t} href={`/notifications?type=${t}`} active={typeFilter === t} label={NOTIFICATION_LABELS[t]} />
        ))}
      </div>

      <div className="rounded-xl border border-[#E4E4E7] bg-white overflow-hidden shadow-xs">
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
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border",
        active
          ? "bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-xs"
          : "bg-white text-[#52525B] border-[#E4E4E7] hover:bg-[#F4F4F5] hover:text-[#09090B]"
      )}
    >
      {label}
    </Link>
  );
}
